<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { api, type AiApiType, type AiModelConfig } from '@/api'
import { notify } from '@/stores/toast'
import { reasoningLevels, type ReasoningDialect, type ReasoningLevel, type ResponseProfile } from '@shared/ai'

const models = ref<AiModelConfig[]>([])
const loading = ref(true)
const saving = ref(false)
const testing = ref<number | null>(null)
const editingId = ref<number | null>(null)
const headersText = ref('{}')
const extraBodyText = ref('{}')
function defaults() {
  return { name: '', provider: 'openai-compatible', apiType: 'responses' as AiApiType, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '', windowTokens: 1050000, inputTokens: 922000, outputTokens: 128000, reasoningDialect: 'none' as ReasoningDialect, reasoningLevel: 'default' as ReasoningLevel, responseProfile: 'auto' as ResponseProfile, enabled: true }
}
const form = reactive(defaults())
watch(() => form.reasoningDialect, () => {
  if (!reasoningLevels(form.reasoningDialect).includes(form.reasoningLevel)) form.reasoningLevel = 'default'
}, { flush: 'sync' })

function resetForm(): void {
  editingId.value = null
  Object.assign(form, defaults())
  headersText.value = '{}'
  extraBodyText.value = '{}'
}

function edit(model: AiModelConfig): void {
  editingId.value = model.id
  Object.assign(form, model)
  headersText.value = JSON.stringify(model.headers, null, 2)
  extraBodyText.value = JSON.stringify(model.extraBody, null, 2)
}

function applyPreset(): void {
  if (form.provider === 'opencode') {
    form.baseUrl = 'https://opencode.ai/zen/go/v1'
    form.apiType = 'chat-completions'
  } else if (form.provider === 'deepseek') {
    form.baseUrl = 'https://api.deepseek.com'
    form.apiType = 'chat-completions'
    form.reasoningDialect = 'deepseek'
    form.responseProfile = 'deepseek'
  } else {
    form.baseUrl = 'https://api.openai.com/v1'
    form.apiType = 'responses'
    form.reasoningDialect = 'openai'
    form.responseProfile = 'generic'
  }
}

async function load(): Promise<void> {
  loading.value = true
  try { models.value = await api.aiModels() } catch (err) { notify(err instanceof Error ? err.message : '读取模型失败', 'error') }
  finally { loading.value = false }
}

async function save(): Promise<void> {
  let headers: Record<string, string>
  let extraBody: Record<string, unknown>
  try { headers = JSON.parse(headersText.value || '{}') as Record<string, string>; extraBody = JSON.parse(extraBodyText.value || '{}') as Record<string, unknown> } catch { notify('自定义请求头必须是合法 JSON', 'error'); return }
  saving.value = true
  try {
    await api.saveAiModel({ ...form, id: editingId.value ?? undefined, headers, extraBody })
    await load(); resetForm(); notify('模型已保存')
  } catch (err) { notify(err instanceof Error ? err.message : '保存模型失败', 'error') }
  finally { saving.value = false }
}

async function remove(model: AiModelConfig): Promise<void> {
  if (!window.confirm(`确定删除「${model.name}」吗？`)) return
  try { await api.deleteAiModel(model.id); await load(); if (editingId.value === model.id) resetForm(); notify('模型已删除') }
  catch (err) { notify(err instanceof Error ? err.message : '删除模型失败', 'error') }
}

async function test(model: AiModelConfig): Promise<void> {
  testing.value = model.id
  try { const result = await api.testAiModel(model.id, '请只回复：连接成功'); notify(`测试成功：${result.text || '模型已返回空文本'}`) }
  catch (err) { notify(err instanceof Error ? err.message : '模型测试失败', 'error') }
  finally { testing.value = null }
}

onMounted(() => void load())
</script>

<template>
  <main class="settings section-wrap">
    <div class="settings-head">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>设置</h1>
      </div>
      <RouterLink class="pill pill--ghost pill--small" to="/">返回书架</RouterLink>
    </div>

    <div class="settings-layout">
      <aside class="settings-tabs" aria-label="设置分类">
        <button class="settings-tab active" type="button">模型管理</button>
      </aside>

      <section class="settings-panel">
        <div class="panel-head">
          <div><h2>模型管理</h2><p>配置 OpenAI 或兼容 OpenAI 协议的自定义 LLM。</p></div>
          <button class="pill pill--small" type="button" @click="resetForm">新增模型</button>
        </div>

        <div v-if="!loading && models.length" class="model-list">
          <article v-for="model in models" :key="model.id" class="model-card">
            <div class="model-info"><span class="status-dot" :class="{ 'status-dot--live': model.enabled }" /><div><h3>{{ model.name }}</h3><p>{{ model.model }} · {{ model.apiType === 'responses' ? 'Responses API' : 'Chat Completions API' }}</p></div></div>
            <div class="model-actions"><button class="text-btn" type="button" @click="edit(model)">编辑</button><button class="text-btn" type="button" :disabled="testing === model.id" @click="test(model)">{{ testing === model.id ? '测试中…' : '测试' }}</button><button class="text-danger" type="button" @click="remove(model)">删除</button></div>
          </article>
        </div>
        <p v-else-if="!loading" class="empty-models">还没有模型配置。</p>

        <form class="model-form" @submit.prevent="save">
          <div class="form-grid">
            <label><span>名称</span><input v-model="form.name" required placeholder="例如：OpenAI 主模型" /></label>
            <label><span>提供方</span><input v-model="form.provider" list="providers" placeholder="openai-compatible / opencode / deepseek" /></label><datalist id="providers"><option value="openai-compatible" /><option value="opencode" /><option value="deepseek" /></datalist>
            <label><span>协议</span><select v-model="form.apiType"><option value="responses">Responses API</option><option value="chat-completions">Chat Completions API</option></select></label>
            <label><span>思考方言</span><select v-model="form.reasoningDialect"><option value="none">无</option><option value="openai">OpenAI reasoning</option><option value="deepseek">DeepSeek thinking</option></select></label>
            <label><span>默认思考等级</span><select v-model="form.reasoningLevel"><option v-for="level in reasoningLevels(form.reasoningDialect)" :key="level" :value="level">{{ level === 'default' ? '默认（不指定）' : level === 'off' ? '关闭' : level }}</option></select></label>
            <label><span>响应适配</span><select v-model="form.responseProfile"><option value="auto">自动</option><option value="generic">通用</option><option value="deepseek">DeepSeek / DSML</option><option value="off">关闭</option></select></label>
            <div class="wide"><button class="pill pill--ghost pill--small" type="button" @click="applyPreset">应用提供方预设</button></div>
            <label class="wide"><span>Base URL</span><input v-model="form.baseUrl" required placeholder="https://api.openai.com/v1" /></label>
            <label><span>模型</span><input v-model="form.model" required placeholder="实际模型 ID" /></label>
            <label><span>上下文窗口 tokens</span><input v-model.number="form.windowTokens" type="number" min="1" required /></label>
            <label><span>输入 tokens 上限</span><input v-model.number="form.inputTokens" type="number" min="1" required /></label>
            <label><span>输出 tokens 上限</span><input v-model.number="form.outputTokens" type="number" min="1" required /></label>
            <label><span>API Key</span><input v-model="form.apiKey" type="password" autocomplete="off" placeholder="sk-…" /></label>
            <label class="wide"><span>自定义请求头 JSON</span><textarea v-model="headersText" rows="4" spellcheck="false" placeholder='{"X-Provider": "custom"}' /></label>
            <label class="wide"><span>扩展请求参数 JSON</span><textarea v-model="extraBodyText" rows="3" spellcheck="false" placeholder="{}" /><small>显式思考等级优先于扩展参数；model、input、messages、stream 和输出上限由调用封装管理。</small></label>
          </div>
          <label class="enabled"><input v-model="form.enabled" type="checkbox" /> 启用此模型</label>
          <div class="form-actions"><button class="pill pill--ghost pill--small" type="button" @click="resetForm">清空</button><button class="pill pill--small" type="submit" :disabled="saving">{{ saving ? '保存中…' : editingId ? '保存修改' : '添加模型' }}</button></div>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings { flex: 1; padding-bottom: 56px; }
.settings .pill { justify-content: center; padding-inline: 16px; text-align: center; }
.settings-head, .panel-head, .model-card, .model-info, .model-actions, .form-actions { display: flex; align-items: center; }
.settings-head, .panel-head, .model-card { justify-content: space-between; gap: 20px; }
.settings-head { margin: 28px 0 22px; }
.settings h1 { margin-top: 8px; font-size: 30px; }
.settings-layout { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 16px; align-items: start; }
.settings-tabs, .settings-panel { border-radius: var(--radius-lg); background: var(--surface-muted); }
.settings-tabs { padding: 8px; }
.settings-tab { width: 100%; padding: 12px 14px; border-radius: 14px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; }
.settings-tab.active { background: var(--blue); color: #fff; font-weight: 600; }
.settings-panel { padding: 24px; }
.panel-head h2 { font-size: 20px; }
.panel-head p { margin-top: 6px; color: var(--muted); font-size: 12px; }
.model-list { display: grid; gap: 8px; margin-top: 22px; }
.model-card { padding: 13px 14px; border-radius: var(--radius-md); background: var(--surface-soft); }
.model-info { min-width: 0; gap: 10px; }.model-info h3 { font-size: 13px; }.model-info p { margin-top: 4px; color: var(--muted); font-size: 11px; }
.model-actions { gap: 12px; flex: none; }.text-btn, .text-danger { border: 0; background: none; padding: 6px 0; color: var(--muted); cursor: pointer; font-size: 11px; }.text-danger { color: #b4544f; }
.empty-models { margin-top: 22px; padding: 28px; border-radius: var(--radius-md); background: var(--surface-soft); color: var(--muted); text-align: center; font-size: 12px; }
.model-form { margin-top: 24px; padding-top: 22px; border-top: 1px solid var(--line); }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }.form-grid label { display: grid; gap: 7px; color: var(--muted); font-size: 11px; }.form-grid .wide { grid-column: 1 / -1; }.form-grid input, .form-grid select, .form-grid textarea { width: 100%; padding: 11px 13px; border-radius: 13px; background: var(--white); color: var(--ink); outline: none; resize: vertical; }.enabled { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: var(--muted); font-size: 12px; }.enabled input { accent-color: var(--blue); }.form-actions { justify-content: flex-end; gap: 8px; margin-top: 18px; }
@media (max-width: 720px) { .settings { padding-bottom: 36px; }.settings-head { margin: 20px 0 16px; }.settings h1 { font-size: 26px; }.settings-layout { grid-template-columns: 1fr; }.settings-tabs { display: flex; }.settings-tab { text-align: center; }.settings-panel { padding: 18px 14px; }.panel-head { align-items: flex-start; }.panel-head .pill { flex: none; }.model-card { align-items: flex-start; flex-direction: column; }.model-actions { width: 100%; justify-content: flex-end; }.form-grid { grid-template-columns: 1fr; }.form-grid .wide { grid-column: auto; }.form-actions .pill { flex: 1; justify-content: center; } }
</style>

