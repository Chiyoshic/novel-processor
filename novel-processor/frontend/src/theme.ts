import { computed, ref, watch } from 'vue'
import { applyBrowserAppearance, resolveBrowserAppearance } from '@/lib/browser-chrome'

export type ThemePreference = 'system' | 'light' | 'dark'
function initialTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem('novel-processor-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch { return 'system' }
}
export const theme = ref<ThemePreference>(initialTheme())
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(systemTheme.matches)
export const resolvedTheme = computed(() => theme.value === 'system' ? systemDark.value ? 'dark' : 'light' : theme.value)
const browserBackground = ref<string | null>(null)
export function setBrowserBackground(color: string | null): void { browserBackground.value = color }
const browserAppearance = computed(() => resolveBrowserAppearance(resolvedTheme.value, browserBackground.value))
systemTheme.addEventListener('change', (event) => { systemDark.value = event.matches })
watch(resolvedTheme, (value) => { document.documentElement.dataset.theme = value }, { immediate: true, flush: 'sync' })
watch(browserAppearance, (value) => applyBrowserAppearance(document, value), { immediate: true, flush: 'sync' })
watch(theme, (value) => {
  try { localStorage.setItem('novel-processor-theme', value) } catch { /* Storage is optional. */ }
}, { immediate: true })
