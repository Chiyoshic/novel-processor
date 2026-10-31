export const REASONING_LEVELS = ['default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningLevel = typeof REASONING_LEVELS[number]
export type ReasoningDialect = 'none' | 'openai' | 'deepseek'
export type ResponseProfile = 'auto' | 'generic' | 'deepseek' | 'off'

export function reasoningLevels(dialect: ReasoningDialect): readonly ReasoningLevel[] {
  if (dialect === 'deepseek') return ['default', 'off', 'low', 'high']
  if (dialect === 'openai') return REASONING_LEVELS
  return ['default', 'off']
}
export function validateReasoning(dialect: string, level: string): void {
  if (!['none', 'openai', 'deepseek'].includes(dialect) || !reasoningLevels(dialect as ReasoningDialect).includes(level as ReasoningLevel)) {
    throw new Error('思考等级不受所选方言支持')
  }
}
