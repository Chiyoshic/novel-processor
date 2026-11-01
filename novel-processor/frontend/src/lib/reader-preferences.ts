import { computed, reactive, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { isDarkColor } from './browser-chrome'

const storageKey = 'novel-processor.reader-preferences.v1'
export const readerDefaults = { fontSize: 18, letterSpacing: 0.035, lineHeight: 2.15, paragraphSpacing: 0.85, characterHints: true, background: '', textColor: '' }
export const readerPresets = [
  { label: '跟随模式', background: '', textColor: '', accent: '' },
  { label: '暖纸', background: '#f7f3eb', textColor: '#3e372e', accent: '#87613d' },
  { label: '素白', background: '#fafafa', textColor: '#303030', accent: '#526b7c' },
  { label: '青笺', background: '#e9efe5', textColor: '#34402f', accent: '#58704a' },
  { label: '夜读', background: '#191c1b', textColor: '#d7d2c8', accent: '#c9af86' },
] as const
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
function readPreferences(): typeof readerDefaults {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (!stored || typeof stored !== 'object') return { ...readerDefaults }
    return {
      fontSize: bounded(stored.fontSize, 14, 32, readerDefaults.fontSize),
      letterSpacing: bounded(stored.letterSpacing, 0, 0.2, readerDefaults.letterSpacing),
      lineHeight: bounded(stored.lineHeight, 1.4, 3, readerDefaults.lineHeight),
      paragraphSpacing: bounded(stored.paragraphSpacing, 0, 2.5, readerDefaults.paragraphSpacing),
      characterHints: typeof stored.characterHints === 'boolean' ? stored.characterHints : true,
      background: hex(stored.background) ? stored.background : '',
      textColor: hex(stored.textColor) ? stored.textColor : '',
    }
  } catch { return { ...readerDefaults } }
}
export const readerPreferences = reactive(readPreferences())
watch(readerPreferences, (value) => { try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Reading remains usable if storage is blocked/full. */ } })
export function resetReaderPreferences(): void { Object.assign(readerPreferences, readerDefaults) }
export const readerStyle = computed<CSSProperties>(() => {
  const value = readerPreferences
  const preset = readerPresets.find((preset) => preset.background === value.background && preset.textColor === value.textColor)
  const style: CSSProperties = {
    '--reader-font-size': `${value.fontSize}px`,
    '--reader-letter-spacing': `${value.letterSpacing}em`,
    '--reader-line-height': value.lineHeight,
    '--reader-paragraph-spacing': `${value.paragraphSpacing}em`,
    '--reader-text': value.textColor || 'var(--ink-soft)',
    // 预设配色独立使用强调色，避免两段品牌都变成近乎相同的正文墨色。
    '--reader-brand': preset ? preset.accent || 'var(--reader-accent)' : value.textColor || 'var(--reader-accent)',
  }
  if (value.background) {
    const dark = isDarkColor(value.background)
    Object.assign(style, {
      '--paper': value.background,
      '--ink': dark ? '#e7e2d8' : '#302b24',
      '--ink-soft': dark ? '#d7d2c8' : '#3e372e',
      '--muted': dark ? '#b2ac9f' : '#756b5f',
      '--faint': dark ? '#a49d90' : '#887d6f',
      '--line': dark ? '#56594f' : '#c9c0b1',
      '--reader-accent': dark ? '#c9af86' : '#87613d',
      '--blue-dark': dark ? '#c0d3dd' : '#3f6071',
      colorScheme: dark ? 'dark' : 'light',
    })
  }
  return style
})
