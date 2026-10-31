/**
 * 内容语言判定。
 *
 * 为什么需要：CJK 汉字在中文字体与日文字体里字形不同（如「直」「骨」「今」），
 * 浏览器不会自动按语义选字体——必须显式设置 `lang`，再让 CSS 的 `:lang()` 切换。
 *
 * 判定方式：出现平假名 / 片假名即视为日文。日文正文必然含假名，
 * 而中文文本（含繁体）不会出现假名，所以这个启发式足够可靠且无需额外数据。
 */
const KANA = /[\u3040-\u309f\u30a0-\u30ff]/

export type ContentLang = 'ja' | 'zh-CN'

/** 从若干段文本中推断内容语言，默认中文。 */
export function detectLang(...texts: Array<string | null | undefined>): ContentLang {
  for (const text of texts) {
    if (text && KANA.test(text)) return 'ja'
  }
  return 'zh-CN'
}
