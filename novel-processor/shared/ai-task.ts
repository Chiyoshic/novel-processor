/** Progress contains public output and sanitized diagnostics, never credentials or raw provider errors. */
export type AiProgressData =
  | { type: 'attempt'; attempt: number; maxAttempts: number }
  | { type: 'activity'; attempt: number; stage: 'thinking' }
  | { type: 'delta'; attempt: number; text: string }
  | { type: 'validating'; attempt: number }
  | { type: 'validated'; attempt: number; jsonRepaired: boolean }
  | { type: 'retry'; attempt: number; nextAttempt: number; delayMs: number; reason: string; kind: string; status?: number }
export type AiProgressEvent = AiProgressData & { at: number }
