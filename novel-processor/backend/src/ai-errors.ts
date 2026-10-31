export type AiFailureKind = 'network' | 'rate-limit' | 'server' | 'timeout' | 'cancelled' | 'rejected' | 'invalid-output' | 'refusal'

/** 输出不完整或未通过验证；不得把失败半包交给业务存储。 */
export class AiOutputError extends Error {
  readonly retryable: boolean
  readonly refusal: boolean
  constructor(message: string, options: { retryable?: boolean; refusal?: boolean } = {}) {
    super(message)
    this.name = 'AiOutputError'
    this.retryable = options.retryable ?? true
    this.refusal = options.refusal ?? false
  }
}

export interface AiTimeoutDetail { phase: 'first-event' | 'stream-idle' | 'request' | 'total'; limitMs: number }

/** 不含原始模型文本、请求头或 API Key 的统一失败信息。 */
export class AiGenerationError extends Error {
  readonly kind: AiFailureKind
  readonly attempts: number
  readonly status: number | undefined
  constructor(kind: AiFailureKind, attempts: number, status?: number, timeout?: AiTimeoutDetail) {
    const labels: Record<AiFailureKind, string> = {
      network: '模型连接失败', 'rate-limit': '模型服务限流', server: '模型服务暂不可用',
      timeout: '模型调用超时', cancelled: '模型调用已取消', rejected: '模型服务拒绝请求，请检查配置和参数',
      'invalid-output': '模型未返回完整且符合要求的结果', refusal: '模型拒绝生成此内容',
    }
    const timeoutLabels = { 'first-event': '等待首个流式事件超时', 'stream-idle': '流式响应连续无活动超时', request: '单次请求超时', total: '总任务时限已到' }
    const detail = kind === 'timeout' && timeout ? `（${timeoutLabels[timeout.phase]}，上限 ${timeout.limitMs / 1000} 秒）` : ''
    super(`${labels[kind]}${detail}${status ? `（HTTP ${status}）` : ''}；已尝试 ${attempts} 次，已有结果未覆盖`)
    this.name = 'AiGenerationError'
    this.kind = kind
    this.attempts = attempts
    this.status = status
  }
}
