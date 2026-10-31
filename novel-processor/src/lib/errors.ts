/** 统一错误类型。便于上层按 code 做差异化处理（重试 / 提示 / 落库）。 */
export type ErrorCode =
  | 'UNSUPPORTED_SITE'
  | 'INVALID_INPUT'
  | 'HTTP_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PARSE_ERROR'
  | 'ABORTED'

export class NovelError extends Error {
  readonly code: ErrorCode
  readonly detail: Record<string, unknown>

  constructor(code: ErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'NovelError'
    this.code = code
    this.detail = detail
  }
}

export function isNovelError(err: unknown): err is NovelError {
  return err instanceof NovelError
}

/** 把任意异常转成可读的一行描述。 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}
