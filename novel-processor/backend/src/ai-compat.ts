import type { ResponseProfile } from '../../shared/ai'

/** 只拆解完整、独立的响应包装，不改写合法 JSON 字符串里的原文标签。 */
export function normalizeModelOutput(raw: string, profile: ResponseProfile, model: string): string {
  let text = raw.trim()
  if (profile === 'off') return text
  while (text.startsWith('<think>')) {
    const end = text.indexOf('</think>')
    if (end < 0) throw new Error('模型仅返回了未闭合的思考内容，请重试')
    text = text.slice(end + 8).trimStart()
  }
  if (text.startsWith('{') || text.startsWith('[')) return text
  if (profile !== 'deepseek' && !(profile === 'auto' && /deepseek/i.test(model))) return text
  const marker = '(?:｜DSML｜|｜｜DSML｜｜)'
  const container = new RegExp(`^<${marker}\\s*(calls|function_calls)\\s*>([\\s\\S]*)<\\/${marker}\\s*\\1\\s*>$`)
  const outer = text.match(container)
  if (outer) text = outer[2]!.trim()
  const invoke = text.match(new RegExp(`^<${marker}\\s*invoke\\s+name=["'](submit_translation_brief|initialize_translation)["']\\s*>([\\s\\S]*)<\\/${marker}\\s*invoke\\s*>$`))
  if (!invoke) {
    if (/^<\/?｜(?:｜)?DSML/.test(text)) throw new Error('模型返回未知或不完整的 DSML 包装，概要未保存')
    return text
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const parameter = new RegExp(`^<${marker}\\s*parameter\\b([^>]*)>([\\s\\S]*?)<\\/${marker}\\s*parameter\\s*>`)
  let rest = invoke[2]!.trim()
  while (rest) {
    const match = rest.match(parameter)
    if (!match) throw new Error('DSML 参数格式不完整或含多余内容')
    const name = match[1]!.match(/(?:^|\s)name=["']([^"']+)["']/)?.[1]
    if (!name || Object.hasOwn(result, name) || ['__proto__', 'prototype', 'constructor'].includes(name)) throw new Error('DSML 参数名无效或重复')
    const stringFlag = match[1]!.match(/(?:^|\s)string=["'](true|false)["']/)?.[1]
    const value = match[2]!
    if (stringFlag === 'true') result[name] = value
    else {
      try { result[name] = JSON.parse(value) as unknown }
      catch {
        if (stringFlag === 'false') {
          // Preserve the parameter bytes for the central repair/validator stage.
          if (Object.keys(result).length === 0 && ['brief', 'args'].includes(name) && rest.slice(match[0].length).trim() === '') return value
          throw new Error('DSML 参数不是完整 JSON')
        }
        result[name] = value
      }
    }
    rest = rest.slice(match[0].length).trim()
  }
  if (!Object.keys(result).length) throw new Error('DSML 未返回概要参数')
  const packed = Object.keys(result).length === 1 ? (result.brief ?? result.args) : undefined
  if (packed !== undefined) {
    if (typeof packed === 'string') return packed
    return JSON.stringify(packed)
  }
  return JSON.stringify(result)
}
