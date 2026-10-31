import { ref, watch } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'

function initialTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem('novel-processor-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

export const theme = ref<ThemePreference>(initialTheme())
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(): void {
  const resolved = theme.value === 'system' ? (systemTheme.matches ? 'dark' : 'light') : theme.value
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

systemTheme.addEventListener('change', applyTheme)

watch(
  theme,
  (value) => {
    applyTheme()
    try {
      localStorage.setItem('novel-processor-theme', value)
    } catch {
      // Storage is optional.
    }
  },
  { immediate: true },
)
