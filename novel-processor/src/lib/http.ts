/**
 * HTTP 客户端：抓取层唯一的 IO 出口。
 *
 * 内置能力：
 * - 并发上限（信号量）——同时最多 N 个请求在途
 * - 请求节奏（全局最小间隔）——相邻两次请求「发出」至少间隔 M 毫秒
 * - 指数退避重试（429 / 5xx / 网络异常）
 * - 超时控制
 * - 统一的 UA 标识
 *
 * 为什么「并发」与「节奏」必须分开：
 * 并发数决定同时在途的请求数，节奏决定请求发起速率，两者是独立约束。
 * 只放开并发但仍保持 800ms 节奏，吞吐不会提升（仍被 1.25 req/s 封顶）；
 * 只有把节奏一并放宽（例如 200ms），并发 4 才能真正带来约 5 req/s 的吞吐。
 */
import { NovelError } from './errors'
import type { HttpClient, HttpResponse } from './types'

export interface FetchHttpClientOptions {
  userAgent?: string
  /** 相邻两次请求「发出」的最小间隔（毫秒）。默认 800ms。 */
  minIntervalMs?: number
  /** 同时允许在途的请求数上限。默认 1（完全串行）。 */
  concurrency?: number
  /** 单次请求超时（毫秒）。默认 20s。 */
  timeoutMs?: number
  /** 失败重试次数（不含首次）。默认 3。 */
  maxRetries?: number
  /** 额外请求头，例如 R18 分站需要的 cookie */
  headers?: Record<string, string>
  /** 调试用：打印每个请求 */
  onRequest?: (url: string, attempt: number) => void
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 novel-processor/0.1 (personal library tool)'

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class FetchHttpClient implements HttpClient {
  private readonly userAgent: string
  private readonly minIntervalMs: number
  private readonly concurrency: number
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly headers: Record<string, string>
  private readonly onRequest: ((url: string, attempt: number) => void) | undefined

  /** 信号量：当前在途请求数 */
  private inFlight = 0
  /** 等待空位的请求（FIFO 唤醒） */
  private readonly waiting: Array<() => void> = []
  /** 下一次允许发起请求的时间戳 */
  private nextStartAt = 0

  constructor(options: FetchHttpClientOptions = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_UA
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? 800)
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 1))
    this.timeoutMs = options.timeoutMs ?? 20_000
    this.maxRetries = options.maxRetries ?? 3
    this.headers = options.headers ?? {}
    this.onRequest = options.onRequest
  }

  /** 当前生效配置，便于上层校验与展示。 */
  get config(): { concurrency: number; minIntervalMs: number } {
    return { concurrency: this.concurrency, minIntervalMs: this.minIntervalMs }
  }

  async get(url: string, init: { signal?: AbortSignal } = {}): Promise<HttpResponse> {
    let lastError: unknown = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.acquire()

      let result: HttpResponse | null = null
      let failure: unknown = null
      try {
        await this.pace()
        result = await this.requestOnce(url, attempt, init.signal)
      } catch (err) {
        failure = err
      } finally {
        this.release()
      }

      if (result) return result

      lastError = failure
      const retryable =
        failure instanceof NovelError && (failure.code === 'RATE_LIMITED' || failure.code === 'HTTP_ERROR')
      if (!retryable || attempt === this.maxRetries) break

      const backoff = 800 * 2 ** attempt + Math.floor(Math.random() * 300)
      await sleep(backoff)
    }

    if (lastError instanceof NovelError) throw lastError
    throw new NovelError('HTTP_ERROR', `请求失败：${url}`, { url, cause: String(lastError) })
  }

  /** 取得一个并发名额。 */
  private async acquire(): Promise<void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight += 1
      return
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve))
    // 被唤醒时名额已由 release() 直接转交，此处无需再自增
  }

  /** 释放名额：有等待者则直接转交，否则归还。 */
  private release(): void {
    const next = this.waiting.shift()
    if (next) {
      next()
      return
    }
    this.inFlight -= 1
  }

  /**
   * 请求节奏控制：按「发起时间」排队。
   *
   * 先同步计算并占用 `nextStartAt` 再 await，
   * 保证多并发下时间槽不会被重复分配。
   */
  private async pace(): Promise<void> {
    if (this.minIntervalMs <= 0) return
    const now = Date.now()
    const startAt = Math.max(now, this.nextStartAt)
    this.nextStartAt = startAt + this.minIntervalMs
    const wait = startAt - now
    if (wait > 0) await sleep(wait)
  }

  private async requestOnce(url: string, attempt: number, externalSignal?: AbortSignal): Promise<HttpResponse> {
    this.onRequest?.(url, attempt)

    const timeout = AbortSignal.timeout(this.timeoutMs)
    const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout

    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.8,zh-CN;q=0.6',
          ...this.headers,
        },
      })
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new NovelError('ABORTED', '请求被取消', { url })
      }
      if (timeout.aborted) {
        throw new NovelError('HTTP_ERROR', `请求超时（${this.timeoutMs}ms）：${url}`, { url })
      }
      throw new NovelError('HTTP_ERROR', `网络异常：${url}`, { url, cause: String(err) })
    }

    if (res.status === 404) {
      throw new NovelError('NOT_FOUND', `页面不存在：${url}`, { url, status: 404 })
    }
    if (res.status === 429) {
      throw new NovelError('RATE_LIMITED', `被限流：${url}`, { url, status: 429 })
    }
    if (!res.ok) {
      throw new NovelError('HTTP_ERROR', `HTTP ${res.status}：${url}`, { url, status: res.status })
    }

    const body = await res.text()
    return { url: res.url || url, status: res.status, body }
  }
}

/** 供上层判断某个状态码是否值得重试。 */
export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}
