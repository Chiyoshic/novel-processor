import type { TranslationInitialization, TranslationTaskEvent } from '../../../shared/translation'

/** NDJSON is decoded incrementally: UTF-8 characters and events may cross transport chunks. */
export async function readTranslationStream(response: Response, onEvent: (event: TranslationTaskEvent) => void): Promise<TranslationInitialization> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error ?? `请求失败（${response.status}）`)
  }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson') || !response.body) throw new Error('后端尚未支持任务流，请更新并重启后端服务')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let result: TranslationInitialization | undefined
  function consume(line: string): void {
    if (!line.trim()) return
    const event = JSON.parse(line) as TranslationTaskEvent
    if (event.type === 'error') { onEvent(event); throw new Error(event.message) }
    onEvent(event)
    if (event.type === 'completed') result = event.saved
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        consume(pending.slice(0, end))
        pending = pending.slice(end + 1)
      }
      if (pending.length > 4 * 1024 * 1024) throw new Error('任务事件超过大小限制')
      if (result) return result
      if (done) break
    }
    if (pending.trim()) consume(pending)
    if (!result) throw new Error('任务连接已断开，未收到保存成功的确认；请重新读取已保存材料后再决定是否重试')
    return result
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
