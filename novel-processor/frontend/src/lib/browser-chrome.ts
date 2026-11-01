export type ResolvedTheme = 'light' | 'dark'
export interface BrowserAppearance { background: string; colorScheme: ResolvedTheme }
/** Shared by reader paper tokens and browser UI to avoid mismatched light/dark detection. */
export function isDarkColor(hex: string): boolean {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
  const luminance = channels.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0)
  return luminance < .18
}
export function resolveBrowserAppearance(theme: ResolvedTheme, background: string | null): BrowserAppearance {
  const color = background && /^#[0-9a-f]{6}$/i.test(background) ? background : theme === 'dark' ? '#111b21' : '#f5f8f9'
  return { background: color, colorScheme: isDarkColor(color) ? 'dark' : 'light' }
}
export function applyBrowserAppearance(document: Document, appearance: BrowserAppearance): void {
  // Chrome/older Safari use theme-color; modern Safari also samples the actual page background.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
  meta.content = appearance.background
  document.documentElement.style.backgroundColor = appearance.background
  document.documentElement.style.colorScheme = appearance.colorScheme
  if (document.body) document.body.style.backgroundColor = appearance.background
  // Do not force deprecated black/black-translucent modes: let iOS derive its status bar from the page.
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.remove()
}
