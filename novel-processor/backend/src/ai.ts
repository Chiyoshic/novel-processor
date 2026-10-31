import OpenAI from 'openai'
import { setTimeout as sleep } from 'node:timers/promises'
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions'
import type { ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming } from 'openai/resources/responses/responses'
import type { AiApiType, AiModelConfig } from '../server/db'
import { validateReasoning, type ReasoningLevel } from '../../shared/ai'
import { normalizeModelOutput } from './ai-compat'
import { AiGenerationError, AiOutputError, type AiFailureKind, type AiTimeoutDetail } from './ai-errors'
import { MAX_MODEL_JSON_BYTES, parseModelJson } from './ai-json'
import type { AiProgressData, AiProgressEvent } from '../../shared/ai-task'

export interface AiGenerateInput {
  system?: string
  prompt: string
  temperature?: number
  maxTokens?: number
  reasoningLevel?: ReasoningLevel
  signal?: AbortSignal
  onProgress?: (event: AiProgressEvent) => void
}
export interface AiGenerateResult { text: string; model: string; apiType: AiApiType; attempts: number }
export interface AiJsonResult<T> extends AiGenerateResult { value: T; jsonRepaired: boolean }
export interface AiRetryPolicy {
  maxAttempts: number
  totalTimeoutMs: number
  /** Non-streaming request limit; streaming first-event/idle limit, refreshed by upstream events. */
  requestTimeoutMs: number
  baseDelayMs: number
  maxDelayMs: number
}
export const DEFAULT_AI_RETRY_POLICY: Readonly<AiRetryPolicy> = Object.freeze({
  maxAttempts: 3, totalTimeoutMs: 3600000, requestTimeoutMs: 180000, baseDelayMs: 1000, maxDelayMs: 30000,
})
export const OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1'
const REASONING_KEYS = ['thinking', 'reasoning_effort', 'enable_thinking', 'thinking_budget', 'reasoning']
const OUTPUT_RETRY_INSTRUCTION = '\n上一次输出未通过完整性、JSON 格式或业务字段校验。请依据相同原文材料重新生成完整合法 JSON，严格遵守指定 JSON 结构；章节来源只填写 ID，不输出原句引用，不输出解释或代码围栏，不补造缺失事实。'

export function reasoningParameters(config: Pick<AiModelConfig, 'apiType' | 'reasoningDialect' | 'reasoningLevel'>, override?: ReasoningLevel): Record<string, unknown> {
  const level = override ?? config.reasoningLevel
  validateReasoning(config.reasoningDialect, level)
  if (level === 'default' || config.reasoningDialect === 'none') return {}
  if (config.apiType === 'responses') return { reasoning: { effort: level === 'off' ? 'none' : level } }
  if (config.reasoningDialect === 'deepseek') return level === 'off' ? { thinking: { type: 'disabled' } } : { thinking: { type: 'enabled' }, reasoning_effort: level }
  return { reasoning_effort: level === 'off' ? 'none' : level }
}

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('Base URL 必须为不带用户信息、查询或片段的 HTTP 地址')
  url.pathname = url.pathname.replace(/\/(?:chat\/completions|responses)\/?$/, '').replace(/\/+$/, '')
  return url.toString().replace(/\/$/, '')
}

export function classifyAiFailure(error: unknown): { kind: AiFailureKind; retryable: boolean; status?: number } {
  if (error instanceof AiOutputError) return { kind: error.refusal ? 'refusal' : 'invalid-output', retryable: error.retryable }
  if (error instanceof OpenAI.APIConnectionTimeoutError) return { kind: 'timeout', retryable: true }
  if (error instanceof OpenAI.APIUserAbortError) return { kind: 'cancelled', retryable: false }
  if (error instanceof OpenAI.APIConnectionError) return { kind: 'network', retryable: true }
  if (error instanceof OpenAI.APIError) {
    const status = error.status
    if (status === 429) return { kind: 'rate-limit', retryable: true, status }
    if (status === 408 || status === 409) return { kind: 'network', retryable: true, status }
    if (status !== undefined && status >= 500) return { kind: 'server', retryable: true, status }
    return { kind: 'rejected', retryable: false, ...(status ? { status } : {}) }
  }
  if (error instanceof SyntaxError) return { kind: 'server', retryable: true }
  return { kind: 'rejected', retryable: false }
}

export function retryAfterMs(error: unknown, now = Date.now()): number | undefined {
  if (!(error instanceof OpenAI.APIError) || !error.headers) return undefined
  const milliseconds = error.headers.get('retry-after-ms')
  if (milliseconds !== null && milliseconds.trim() && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0) return Number(milliseconds)
  const value = error.headers.get('retry-after')
  if (!value?.trim()) return undefined
  if (Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value) * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export class AiModelClient {
  private readonly client: OpenAI
  private readonly config: AiModelConfig
  private readonly retry: AiRetryPolicy
  constructor(config: AiModelConfig, policy: Partial<AiRetryPolicy> = {}) {
    this.config = config
    this.retry = { ...DEFAULT_AI_RETRY_POLICY, ...policy }
    if (!Number.isSafeInteger(this.retry.maxAttempts) || this.retry.maxAttempts < 1 || this.retry.maxAttempts > 5) throw new Error('模型请求总尝试次数须在 1–5 次之间')
    for (const key of ['totalTimeoutMs', 'requestTimeoutMs', 'baseDelayMs', 'maxDelayMs'] as const) {
      if (!Number.isSafeInteger(this.retry[key]) || this.retry[key] <= 0) throw new Error('重试超时和间隔须为正整数毫秒')
    }
    if (this.retry.totalTimeoutMs > 86400000) throw new Error('模型调用总时长不得超过 24 小时')
    if (config.provider === 'opencode' && !config.apiKey) throw new Error('OpenCode 需要 API Key')
    const baseURL = normalizeBaseUrl(config.baseUrl || (config.provider === 'opencode' ? OPENCODE_BASE_URL : 'https://api.openai.com/v1'))
    if (config.provider === 'opencode' || new URL(baseURL).hostname === 'opencode.ai') this.retry.requestTimeoutMs = Math.min(350000, this.retry.requestTimeoutMs)
    this.client = new OpenAI({ apiKey: config.apiKey || 'not-needed', baseURL, defaultHeaders: { ...(config.provider === 'opencode' ? { 'User-Agent': 'novel-processor/1.0' } : {}), ...config.headers }, timeout: this.retry.requestTimeoutMs, maxRetries: 0 })
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const result = await this.execute(input, (text) => ({ value: text, jsonRepaired: false }), false)
    return { text: result.text, model: result.model, apiType: result.apiType, attempts: result.attempts }
  }

  /** 本地修复 → 业务验证 → 有界重新生成，与网络重试共享同一请求帽。 */
  async generateJson<T>(input: AiGenerateInput, validate: (value: unknown) => T): Promise<AiJsonResult<T>> {
    return this.execute(input, (text) => {
      const parsed = parseModelJson(text)
      try { return { value: validate(parsed.value), jsonRepaired: parsed.repaired } }
      catch (error) {
        if (error instanceof AiOutputError) throw error
        throw new AiOutputError('模型 JSON 未通过字段格式验证')
      }
    }, true)
  }

  private async execute<T>(input: AiGenerateInput, decode: (text: string) => { value: T; jsonRepaired: boolean }, structured: boolean): Promise<AiJsonResult<T>> {
    const maxTokens = input.maxTokens ?? this.config.outputTokens
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > this.config.outputTokens) throw new Error('请求输出上限不能超过模型配置')
    reasoningParameters(this.config, input.reasoningLevel)
    const deadline = new AbortController()
    const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal
    const timer = setTimeout(() => deadline.abort(), this.retry.totalTimeoutMs)
    timer.unref()
    const expiresAt = Date.now() + this.retry.totalTimeoutMs
    let attempts = 0
    let outputRetry = false
    const abortError = () => input.signal?.aborted ? new AiGenerationError('cancelled', attempts) : new AiGenerationError('timeout', attempts, undefined, { phase: 'total', limitMs: this.retry.totalTimeoutMs })
    try {
      for (;;) {
        if (signal.aborted) throw abortError()
        attempts++
        input.onProgress?.({ type: 'attempt', attempt: attempts, maxAttempts: this.retry.maxAttempts, at: Date.now() })
        const attemptDeadline = new AbortController()
        const attemptTimeout = Math.min(this.retry.requestTimeoutMs, Math.max(1, expiresAt - Date.now()))
        let attemptTimer: ReturnType<typeof setTimeout> | undefined
        let hasStreamActivity = false
        const armAttemptDeadline = () => {
          if (attemptTimer) clearTimeout(attemptTimer)
          if (signal.aborted || attemptDeadline.signal.aborted) return
          attemptTimer = setTimeout(() => attemptDeadline.abort(), Math.min(this.retry.requestTimeoutMs, Math.max(1, expiresAt - Date.now())))
          attemptTimer.unref()
        }
        armAttemptDeadline()
        const onStreamActivity = () => { hasStreamActivity = true; armAttemptDeadline() }
        try {
          const actualInput = structured && outputRetry ? { ...input, system: (input.system ?? '') + OUTPUT_RETRY_INSTRUCTION } : input
          const response = await this.generateOnce(actualInput, maxTokens, AbortSignal.any([signal, attemptDeadline.signal]), attemptTimeout, attempts, onStreamActivity)
          clearTimeout(attemptTimer)
          if (attemptDeadline.signal.aborted) throw new OpenAI.APIConnectionTimeoutError()
          if (structured) input.onProgress?.({ type: 'validating', attempt: attempts, at: Date.now() })
          const decoded = decode(response.text)
          if (structured) input.onProgress?.({ type: 'validated', attempt: attempts, jsonRepaired: decoded.jsonRepaired, at: Date.now() })
          if (signal.aborted) throw abortError()
          return { ...response, ...decoded, attempts }
        } catch (error) {
          clearTimeout(attemptTimer)
          if (signal.aborted) throw abortError()
          const failure = classifyAiFailure(attemptDeadline.signal.aborted ? new OpenAI.APIConnectionTimeoutError() : error)
          const timeoutDetail: AiTimeoutDetail | undefined = failure.kind === 'timeout' ? { phase: input.onProgress ? (hasStreamActivity ? 'stream-idle' : 'first-event') : 'request', limitMs: this.retry.requestTimeoutMs } : undefined
          const reportedFailure = new AiGenerationError(failure.kind, attempts, failure.status, timeoutDetail)
          if (!failure.retryable || attempts >= this.retry.maxAttempts) throw reportedFailure
          if (failure.kind === 'invalid-output') outputRetry = true
          const backoff = Math.min(this.retry.maxDelayMs, this.retry.baseDelayMs * 2 ** (attempts - 1))
          const serverDelay = retryAfterMs(error)
          // Never retry sooner than Retry-After, or wait beyond the local budget.
          if (serverDelay !== undefined && serverDelay > this.retry.maxDelayMs) throw reportedFailure
          const delay = serverDelay ?? Math.round(backoff * (0.75 + Math.random() * 0.25))
          if (Date.now() + delay >= expiresAt) throw new AiGenerationError('timeout', attempts, undefined, { phase: 'total', limitMs: this.retry.totalTimeoutMs })
          input.onProgress?.({ type: 'retry', attempt: attempts, nextAttempt: attempts + 1, delayMs: delay, reason: reportedFailure.message, kind: failure.kind, ...(failure.status ? { status: failure.status } : {}), at: Date.now() })
          try { await sleep(delay, undefined, { signal }) }
          catch { throw abortError() }
        }
      }
    } finally { clearTimeout(timer) }
  }

  private async generateStreaming(input: AiGenerateInput, extra: Record<string, unknown>, sampling: Record<string, unknown>, reasoning: Record<string, unknown>, maxTokens: number, signal: AbortSignal, timeout: number, attempt: number, onStreamActivity: () => void): Promise<{ text: string; model: string }> {
    let text = ''
    let bytes = 0
    let model = this.config.model
    let thinking = false
    const emit = (event: AiProgressData) => input.onProgress?.({ ...event, at: Date.now() })
    const append = (delta: string) => {
      bytes += Buffer.byteLength(delta, 'utf8')
      if (bytes > MAX_MODEL_JSON_BYTES) throw new AiOutputError('模型输出超过大小限制')
      text += delta
      emit({ type: 'delta', attempt, text: delta })
    }
    const markThinking = () => {
      if (!thinking) { thinking = true; emit({ type: 'activity', attempt, stage: 'thinking' }) }
    }
    if (this.config.apiType === 'chat-completions') {
      const stream = await this.client.chat.completions.create({ ...extra, ...sampling, ...reasoning, model: this.config.model, messages: [...(input.system ? [{ role: 'system' as const, content: input.system }] : []), { role: 'user' as const, content: input.prompt }], ...(this.config.reasoningDialect === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }), stream: true } as ChatCompletionCreateParamsStreaming, { signal, timeout })
      let finish: string | null = null
      try {
        for await (const chunk of stream) {
          onStreamActivity()
          model = chunk.model || model
          const choice = chunk.choices?.find((item) => item.index === 0)
          if (!choice) continue
          if (choice.delta?.refusal || choice.finish_reason === 'content_filter') throw new AiOutputError('模型拒答', { retryable: false, refusal: true })
          const delta = choice.delta as typeof choice.delta & { reasoning_content?: string }
          if (delta.reasoning_content) markThinking()
          if (delta.content) append(delta.content)
          if (choice.finish_reason) finish = choice.finish_reason
        }
      } finally { stream.controller.abort() }
      if (finish !== 'stop') throw new AiOutputError('模型流式输出未完整结束')
    } else {
      const stream = await this.client.responses.create({ ...extra, ...sampling, ...reasoning, model: this.config.model, instructions: input.system, input: input.prompt, max_output_tokens: maxTokens, stream: true } as ResponseCreateParamsStreaming, { signal, timeout })
      let completed = false
      try {
        for await (const event of stream) {
          onStreamActivity()
          if (event.type === 'response.output_text.delta') append(event.delta)
          else if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') markThinking()
          else if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') throw new AiOutputError('模型拒答', { retryable: false, refusal: true })
          else if (event.type === 'response.completed') {
            if (event.response.status !== 'completed') throw new AiOutputError('模型响应未完成')
            if (event.response.output?.some((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'))) throw new AiOutputError('模型拒答', { retryable: false, refusal: true })
            model = event.response.model || model
            completed = true
          } else if (event.type === 'response.incomplete') throw new AiOutputError('模型响应未完成')
          else if (event.type === 'response.failed') throw new AiOutputError('模型服务生成失败', { retryable: event.response.error?.code === 'server_error' })
          else if (event.type === 'error') throw new AiOutputError('模型流式服务返回错误', { retryable: event.code === 'server_error' || event.code === 'rate_limit_exceeded' })
        }
      } finally { stream.controller.abort() }
      if (!completed) throw new AiOutputError('模型流式响应缺少完成事件')
    }
    return { text, model }
  }

  private async generateOnce(input: AiGenerateInput, maxTokens: number, signal: AbortSignal, timeout: number, attempt: number, onStreamActivity: () => void): Promise<Omit<AiGenerateResult, 'attempts'>> {
    const extra: Record<string, unknown> = { ...this.config.extraBody }
    for (const key of ['model', 'messages', 'input', 'instructions', 'stream', 'max_tokens', 'max_completion_tokens', 'max_output_tokens']) delete extra[key]
    const level = input.reasoningLevel ?? this.config.reasoningLevel
    if (level !== 'default' && this.config.reasoningDialect !== 'none') for (const key of REASONING_KEYS) delete extra[key]
    const reasoning = reasoningParameters(this.config, input.reasoningLevel)
    const sampling = input.temperature === undefined ? {} : { temperature: input.temperature }
    let text: string
    let model: string
    if (input.onProgress) {
      const result = await this.generateStreaming(input, extra, sampling, reasoning, maxTokens, signal, timeout, attempt, onStreamActivity)
      text = result.text
      model = result.model
    } else if (this.config.apiType === 'chat-completions') {
      const result = await this.client.chat.completions.create({ ...extra, ...sampling, ...reasoning, model: this.config.model, messages: [...(input.system ? [{ role: 'system' as const, content: input.system }] : []), { role: 'user' as const, content: input.prompt }], ...(this.config.reasoningDialect === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }), stream: false } as ChatCompletionCreateParamsNonStreaming, { signal, timeout })
      const choice = result.choices?.[0]
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new AiOutputError('模型拒答', { retryable: false, refusal: true })
      if (choice?.finish_reason !== 'stop') throw new AiOutputError('模型输出不完整或无有效正文')
      text = choice.message?.content ?? ''
      model = result.model
    } else {
      const result = await this.client.responses.create({ ...extra, ...sampling, ...reasoning, model: this.config.model, instructions: input.system, input: input.prompt, max_output_tokens: maxTokens, stream: false } as ResponseCreateParamsNonStreaming, { signal, timeout })
      if (result.output?.some((item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'))) throw new AiOutputError('模型拒答', { retryable: false, refusal: true })
      if (result.status === 'failed') {
        if (result.error?.code === 'server_error') throw new AiOutputError('模型服务生成失败')
        throw new AiOutputError('模型服务拒绝生成', { retryable: false })
      }
      if (result.status && result.status !== 'completed') throw new AiOutputError('模型响应未完成')
      text = result.output_text
      model = result.model
    }
    if (typeof text !== 'string' || !text.trim()) throw new AiOutputError('模型没有返回正文')
    let normalized: string
    try { normalized = normalizeModelOutput(text, this.config.responseProfile === 'auto' && this.config.provider === 'deepseek' ? 'deepseek' : this.config.responseProfile, this.config.model) }
    catch { throw new AiOutputError('模型输出包装格式不完整') }
    if (!normalized.trim()) throw new AiOutputError('模型没有返回正文')
    return { text: normalized, model, apiType: this.config.apiType }
  }
}
export function createAiModelClient(config: AiModelConfig): AiModelClient { return new AiModelClient(config) }
