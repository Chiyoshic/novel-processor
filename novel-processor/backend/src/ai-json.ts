import { jsonrepair } from 'jsonrepair'
import { AiOutputError } from './ai-errors'

export const MAX_MODEL_JSON_BYTES = 2 * 1024 * 1024
const MAX_DEPTH = 128

/** 修补语法前先确认完整根节点，禁止为截断半包补结尾或补字段值。 */
function assertCompleteContainer(text: string): void {
  if (text[0] !== '{' && text[0] !== '[') throw new AiOutputError('模型 JSON 必须是完整对象或数组')
  const stack: string[] = []
  let quote = ''
  let escaped = false
  let lineComment = false
  let blockComment = false
  let previous = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    const next = text[i + 1]
    if (lineComment) { if (c === '\n') lineComment = false; continue }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++ }; continue }
    if (quote) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === quote) { quote = ''; previous = 'value' }
      continue
    }
    if (/\s/.test(c)) continue
    if (c === '/' && next === '/') { lineComment = true; i++; continue }
    if (c === '/' && next === '*') { blockComment = true; i++; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if ((['u', 'N', 'I'].includes(c) && /^(?:undefined|NaN|Infinity)\b/.test(text.slice(i))) || (c === '.' && text.slice(i, i + 3) === '...')) throw new AiOutputError('模型 JSON 含占位或非 JSON 值，不进行补造')
    if (c === '{' || c === '[') {
      stack.push(c)
      if (stack.length > MAX_DEPTH) throw new AiOutputError('模型 JSON 嵌套过深')
    } else if (c === '}' || c === ']') {
      if (previous === ':') throw new AiOutputError('模型 JSON 缺少字段值，不进行补造')
      const opening = stack.pop()
      if (!opening || (c === '}' ? opening !== '{' : opening !== '[')) throw new AiOutputError('模型 JSON 括号不匹配')
      if (!stack.length && text.slice(i + 1).trim()) throw new AiOutputError('模型返回了多个 JSON 或多余尾部内容')
    } else if (c === ',' && (previous === ':' || previous === ',')) {
      throw new AiOutputError('模型 JSON 缺少字段值，不进行补造')
    }
    previous = c
  }
  if (quote || blockComment || stack.length) throw new AiOutputError('模型 JSON 被截断，不能修补半包')
}

export interface ParsedModelJson { value: unknown; repaired: boolean }

/** 只处理完整输出的围栏/BOM、注释、逗号、单引号、未加引号键等格式问题。 */
export function parseModelJson(raw: string): ParsedModelJson {
  if (Buffer.byteLength(raw, 'utf8') > MAX_MODEL_JSON_BYTES) throw new AiOutputError('模型 JSON 超过大小限制')
  const trimmed = raw.replace(/^\uFEFF/, '').trim()
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed)
  const candidate = fenced ? fenced[1]!.trim() : trimmed
  assertCompleteContainer(candidate)
  try { return { value: JSON.parse(candidate) as unknown, repaired: candidate !== trimmed || trimmed !== raw } }
  catch {
    try {
      const repaired = jsonrepair(candidate)
      if (Buffer.byteLength(repaired, 'utf8') > MAX_MODEL_JSON_BYTES) throw new Error('oversize')
      return { value: JSON.parse(repaired) as unknown, repaired: true }
    } catch { throw new AiOutputError('模型 JSON 本地修复失败') }
  }
}
