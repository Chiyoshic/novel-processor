import type { TranslationTaskEvent } from '@shared/translation'

export type TaskStatus = 'connecting' | 'reading' | 'preparing' | 'waiting' | 'thinking' | 'streaming' | 'retrying' | 'validating' | 'saving' | 'completed' | 'failed' | 'cancelled'
export interface TaskAttempt { number: number; startedAt: number; finishedAt?: number; firstTokenAt?: number; characters: number; output: string; status: string }
export interface TranslationTaskState {
  status: TaskStatus; startedAt: number; finishedAt?: number; lastEventAt: number
  modelName: string; model: string; apiType: string; reasoningLevel: string; episodeCount: number
  limits?: { totalTimeoutMs: number; idleTimeoutMs: number }
  maxAttempts: number; attempts: TaskAttempt[]; retryAt?: number; jsonRepaired: boolean
  logs: Array<{ at: number; message: string; warning?: boolean }>; error?: string
}
export const taskStatusLabels: Record<TaskStatus, string> = {
  connecting: '连接任务服务', reading: '读取材料', preparing: '准备提示词', waiting: '等待模型响应', thinking: '模型思考中', streaming: '正在接收输出', retrying: '等待重试', validating: '校验与修复 JSON', saving: '写入 SQLite', completed: '已完成并保存', failed: '任务失败', cancelled: '已停止',
}
export function newTranslationTask(input: Pick<TranslationTaskState, 'modelName' | 'model' | 'apiType' | 'reasoningLevel' | 'episodeCount'>): TranslationTaskState {
  const now = Date.now()
  return { ...input, status: 'connecting', startedAt: now, lastEventAt: now, maxAttempts: 3, attempts: [], jsonRepaired: false, logs: [{ at: now, message: '已提交初始化任务' }] }
}
export function finishTranslationTask(task: TranslationTaskState, status: 'failed' | 'cancelled', message: string): void {
  if (task.finishedAt) return
  task.status = status
  task.finishedAt = Date.now()
  task.error = message
  const attempt = task.attempts.at(-1)
  if (attempt && !attempt.finishedAt) { attempt.finishedAt = task.finishedAt; attempt.status = status === 'cancelled' ? '已停止' : '失败' }
  task.logs.push({ at: task.finishedAt, message, warning: true })
}
export function applyTranslationEvent(task: TranslationTaskState, event: TranslationTaskEvent): void {
  task.lastEventAt = event.at
  const log = (message: string, warning = false) => { task.logs.push({ at: event.at, message, warning }); if (task.logs.length > 100) task.logs.shift() }
  const current = task.attempts.at(-1)
  switch (event.type) {
    case 'heartbeat': return
    case 'started':
      Object.assign(task, { limits: event.limits, modelName: event.modelName, model: event.model, apiType: event.apiType, reasoningLevel: event.reasoningLevel, episodeCount: event.episodeCount })
      log(`任务已连接 · ${event.episodeCount} 话材料`); break
    case 'phase': task.status = event.phase; log(taskStatusLabels[event.phase]); break
    case 'attempt':
      task.status = 'waiting'; task.maxAttempts = event.maxAttempts; task.retryAt = undefined
      task.attempts.push({ number: event.attempt, startedAt: event.at, output: '', characters: 0, status: '等待响应' })
      log(`第 ${event.attempt}/${event.maxAttempts} 次调用开始`); break
    case 'activity': task.status = 'thinking'; if (current) current.status = '模型思考中'; log('模型正在思考，等待正文输出'); break
    case 'delta':
      if (!current || current.number !== event.attempt) return
      if (!current.firstTokenAt) { current.firstTokenAt = event.at; log('已收到首段正文输出') }
      current.characters += event.text.length
      // Keep rendering/memory bounded without changing the full backend output used for validation.
      current.output = (current.output + event.text).slice(-120000)
      current.status = '接收输出'; task.status = 'streaming'; break
    case 'validating': task.status = 'validating'; if (current) current.status = '校验中'; log('正文接收完成，检查 JSON 格式与字段类型'); break
    case 'validated':
      task.jsonRepaired = event.jsonRepaired
      if (current) { current.finishedAt = event.at; current.status = '校验通过' }
      log(event.jsonRepaired ? 'JSON 已本地修复并通过校验' : 'JSON 格式与字段类型检查通过'); break
    case 'retry':
      task.status = 'retrying'; task.retryAt = event.at + event.delayMs
      if (current) { current.finishedAt = event.at; current.status = '失败 · 待重试' }
      log(`第 ${event.attempt} 次调用失败${event.status ? `（HTTP ${event.status}）` : ''}：${event.reason}；${(event.delayMs / 1000).toFixed(1)} 秒后重试`, true); break
    case 'completed':
      task.status = 'completed'; task.finishedAt = event.at
      log('翻译材料已保存至 SQLite'); break
    case 'error': finishTranslationTask(task, 'failed', event.message); break
  }
}
