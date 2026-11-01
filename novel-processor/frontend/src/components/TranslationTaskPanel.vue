<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { taskStatusLabels, type TranslationTaskState } from '@/lib/translationTask'
const props = withDefaults(defineProps<{ task: TranslationTaskState; title?: string }>(), { title: '初始化任务' })
defineEmits<{ cancel: [] }>()
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
watch(() => props.task.finishedAt, (finished) => {
  if (timer) clearInterval(timer)
  now.value = Date.now()
  if (!finished) timer = setInterval(() => { now.value = Date.now() }, 250)
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
const active = computed(() => !props.task.finishedAt)
const selected = ref(0)
const follow = ref(true)
const outputBox = ref<HTMLElement>()
watch(() => props.task.attempts.length, (length) => { selected.value = Math.max(0, length - 1) }, { immediate: true })
const attempt = computed(() => props.task.attempts[selected.value])
const elapsed = computed(() => Math.max(0, (props.task.finishedAt ?? now.value) - props.task.startedAt))
const retryIn = computed(() => Math.max(0, Math.ceil(((props.task.retryAt ?? 0) - now.value) / 1000)))
const received = computed(() => props.task.attempts.reduce((sum, item) => sum + item.characters, 0))
function duration(ms: number): string { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function time(value?: number): string { return value ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '—' }
function exportDiagnostics(): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(props.task, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `translation-task-${props.task.startedAt}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

let scrollTimer: ReturnType<typeof setTimeout> | undefined
watch([() => attempt.value?.output, follow, selected], () => {
  if (scrollTimer) return
  scrollTimer = setTimeout(() => { scrollTimer = undefined; void nextTick(() => { if (follow.value && outputBox.value) outputBox.value.scrollTop = outputBox.value.scrollHeight }) }, 80)
})
onUnmounted(() => { if (scrollTimer) clearTimeout(scrollTimer) })
</script>

<template>
  <section class="task-panel" :class="{ 'is-error': task.status === 'failed', 'is-active': active }" aria-labelledby="task-title">
    <header class="task-head"><div><p class="task-eyebrow">{{ title }}</p><h3 id="task-title"><span class="status-dot" :class="{ pulse: active }" aria-hidden="true" />{{ taskStatusLabels[task.status] }}<span v-if="task.status === 'retrying'" class="retry-countdown">{{ retryIn }} 秒</span></h3></div><button v-if="active" class="pill pill--ghost pill--small" type="button" @click="$emit('cancel')">停止任务</button></header>
    <p class="model-line">{{ task.modelName }} <span>{{ task.model }}</span></p>
    <div class="task-metrics"><div><span>总耗时</span><strong>{{ duration(elapsed) }}</strong></div><div><span>调用次数</span><strong>{{ task.attempts.length }}<small> / {{ task.maxAttempts }}</small></strong></div><div><span>已重试</span><strong>{{ Math.max(0, task.attempts.length - 1) }}<small> 次</small></strong></div><div><span>已接收字符</span><strong>{{ received.toLocaleString() }}</strong></div></div>
    <dl class="task-info"><div><dt>任务开始</dt><dd>{{ time(task.startedAt) }}</dd></div><div><dt>最近活动</dt><dd>{{ time(task.lastEventAt) }}</dd></div><div><dt>请求协议</dt><dd>{{ task.apiType === 'responses' ? 'Responses' : 'Chat Completions' }}</dd></div><div><dt>材料 / 思考等级</dt><dd>{{ task.episodeCount }} 话 · {{ task.reasoningLevel }}</dd></div><div v-if="task.referenceEpisodeIndices !== undefined"><dt>上下文参考</dt><dd>{{ task.referenceEpisodeIndices.length ? `第 ${task.referenceEpisodeIndices.join('、')} 话译文` : '未载入参考译文' }}<template v-if="task.referenceEpisodeCount !== undefined">（{{ task.referenceEpisodeIndices.length }} / {{ task.referenceEpisodeCount }} 话）</template></dd></div><div v-else-if="task.referenceEpisodeIndex"><dt>文风参考</dt><dd>第 {{ task.referenceEpisodeIndex }} 话译文</dd></div><div v-if="task.limits"><dt>总任务时限</dt><dd>{{ task.limits.totalTimeoutMs / 60000 }} 分钟</dd></div><div v-if="task.limits"><dt>流式空闲超时</dt><dd>{{ task.limits.idleTimeoutMs / 1000 }} 秒无上游事件</dd></div><div v-if="task.finishedAt"><dt>任务结束</dt><dd>{{ time(task.finishedAt) }}</dd></div></dl>
    <div class="stream-shell">
      <header class="stream-head"><h4>实时输出 <span class="live-label">{{ active ? 'LIVE' : '任务已结束' }}</span></h4><label><input v-model="follow" type="checkbox" />自动跟随</label></header>
      <div v-if="task.attempts.length" class="attempt-tabs tab-selector" aria-label="调用记录"><button v-for="(item, index) in task.attempts" :key="item.number" type="button" :class="{ selected: selected === index }" :aria-pressed="selected === index" @click="selected = index">第 {{ item.number }} 次调用<span>{{ item.status }}</span></button></div>
      <div v-if="attempt" class="attempt-info"><span>调用于 {{ time(attempt.startedAt) }}</span><span>耗时 {{ duration((attempt.finishedAt ?? now) - attempt.startedAt) }}</span><span>首段响应 {{ attempt.firstTokenAt ? `${((attempt.firstTokenAt - attempt.startedAt) / 1000).toFixed(1)}s` : '等待中' }}</span></div>
      <div ref="outputBox" class="stream-output" tabindex="0" aria-label="模型实时正文输出" :aria-busy="active"><pre v-if="attempt?.output">{{ attempt.characters > attempt.output.length ? '…仅展示最近 120,000 字符，完整输出在后端校验。\n\n' : '' }}{{ attempt.output }}</pre><p v-else class="output-placeholder">{{ task.status === 'thinking' ? '模型正在思考，尚未返回正文…' : task.status === 'retrying' ? '等待下一次调用…' : active ? '等待模型返回正文，输出将实时显示在这里…' : '本次调用未收到正文输出。' }}</p></div>
      <footer class="stream-foot"><span>原始输出预览 · 通过校验后保存</span><span v-if="task.jsonRepaired">JSON 已修复</span></footer>
    </div>
    <div class="diagnostic-actions"><button class="pill pill--ghost pill--small" type="button" @click="exportDiagnostics">导出任务诊断</button></div>
    <details class="task-log" open><summary>任务记录 <span>{{ task.logs.length }}</span></summary><ol><li v-for="(entry, index) in task.logs" :key="index" :class="{ warning: entry.warning }"><time>{{ time(entry.at) }}</time><span>{{ entry.message }}</span></li></ol></details>
  </section>
</template>

<style scoped>
.task-panel { margin-top: 24px; padding: 24px; border: 1px solid var(--blue-line); border-radius: 24px; background: var(--paper); min-width: 0; overflow-wrap: anywhere; }
.task-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.task-head > div { min-width: 0; }.task-head button { flex-shrink: 0; }
.task-eyebrow { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; font-size: 19px; line-height: 1.6; }
.status-dot { width: 9px; height: 9px; flex-shrink: 0; border-radius: 50%; background: var(--blue-dark); }.pulse { animation: task-pulse 1.5s ease-in-out infinite; }.is-error .status-dot { background: #cb7373; }
.retry-countdown { padding: 3px 10px; border-radius: 999px; font-size: 12px; background: var(--blue-soft); color: var(--blue-dark); }
.model-line { font-size: 13px; color: var(--ink); margin: 14px 0 20px; line-height: 1.8; }.model-line > span { color: var(--muted); margin-left: 8px; }
.task-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }.task-metrics > div { border: 1px solid var(--line); border-radius: 16px; background: var(--white); padding: 14px 16px; min-width: 0; }.task-metrics span { display: block; color: var(--muted); font-size: 12px; }.task-metrics strong { display: block; margin-top: 7px; font-size: 24px; font-variant-numeric: tabular-nums; line-height: 1.5; }.task-metrics small { color: var(--muted); font-size: 12px; font-weight: 500; }
.task-info { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; padding: 20px 0; margin: 0; }.task-info > div { display: flex; gap: 12px; justify-content: space-between; font-size: 12px; line-height: 1.7; }dt { color: var(--muted); flex-shrink: 0; }dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.stream-shell { border: 1px solid var(--line); border-radius: 20px; overflow: hidden; background: var(--white); }.stream-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--line); }h4 { font-size: 14px; display: flex; align-items: center; gap: 10px; }.live-label { font-size: 10px; color: var(--blue-dark); background: var(--blue-soft); padding: 3px 8px; border-radius: 999px; letter-spacing: .04em; }.stream-head label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; min-height: 24px; }.stream-head input { accent-color: var(--blue-dark); }
.attempt-tabs { display: flex; gap: 8px; padding: 12px 16px 0; overflow-x: auto; }.attempt-tabs button { flex-direction: column; padding: 8px 12px; border: 0; border-radius: 12px; color: var(--muted); background: var(--paper); font-size: 12px; line-height: 1.6; white-space: nowrap; cursor: pointer; }.attempt-tabs .selected { color: var(--blue-dark); background: var(--blue-soft); }.attempt-tabs button span { display: block; font-size: 10px; }
.attempt-info { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 12px 18px 0; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.stream-output { height: 320px; overflow: auto; overscroll-behavior: contain; padding: 18px; scrollbar-gutter: stable; }.stream-output pre { margin: 0; color: var(--ink-soft); font: 12px/1.85 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2; }.output-placeholder { color: var(--muted); font-size: 13px; line-height: 1.9; }
.stream-foot { padding: 11px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.diagnostic-actions { display: flex; justify-content: flex-end; margin-top: 14px; }.task-log { margin-top: 12px; }summary { cursor: pointer; font-size: 13px; color: var(--ink); padding: 8px 0; }summary > span { color: var(--muted); margin-left: 6px; }ol { list-style: none; padding: 0; margin: 6px 0 0; max-height: 210px; overflow: auto; }li { display: grid; grid-template-columns: 68px minmax(0, 1fr); gap: 12px; padding: 6px 0; font-size: 12px; line-height: 1.8; }li time { color: var(--muted); font-variant-numeric: tabular-nums; }li.warning span { color: var(--blue-dark); }
@keyframes task-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
@media (max-width: 1000px) { .task-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.task-info { grid-template-columns: 1fr; } }
@media (max-width: 580px) { .task-panel { padding: 16px 12px; border-radius: 20px; }.task-head { align-items: flex-start; }h3 { font-size: 17px; }.task-metrics { gap: 8px; }.task-metrics > div { padding: 12px; }.task-metrics strong { font-size: 22px; }.stream-head { padding: 12px; }.stream-output { height: 280px; padding: 12px; }.stream-foot { padding-inline: 12px; }.attempt-info { padding-inline: 12px; }.attempt-tabs { padding-inline: 12px; } }
</style>
