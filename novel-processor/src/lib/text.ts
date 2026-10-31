/**
 * 文本归一化工具。
 *
 * 目标：把站点 HTML 里「为了排版而产生的空白」清掉，
 * 但保留对日文正文有语义的全角空格（U+3000，段首缩进）。
 */
import * as cheerio from 'cheerio'

/** 仅匹配 ASCII 空白，刻意排除 U+3000 全角空格。 */
const ASCII_WS = /^[ \t\r\n\u00a0\f\v]+|[ \t\r\n\u00a0\f\v]+$/g
const ASCII_WS_RUN = /[ \t\r\n\u00a0\f\v]+/g

/** 把 HTML 中的 `<br>` 变成换行符。 */
export function brToNewline(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n')
}

/** 去标签并解码 HTML 实体。 */
export function stripTags(html: string): string {
  if (!html) return ''
  return cheerio.load(html).root().text()
}

/** HTML 片段 → 纯文本（`<br>` 保留为换行）。 */
export function htmlToText(html: string): string {
  return stripTags(brToNewline(html))
}

/**
 * 单行标题清洗：把连续 ASCII 空白折叠成单个空格并去掉首尾空白。
 * 注意保留 U+3000——日文标题/人名常以全角空格分词（如「陽七　葵」）。
 */
export function cleanInline(text: string): string {
  return text.replace(ASCII_WS_RUN, ' ').replace(ASCII_WS, '')
}

/**
 * 多行文本归一化：
 * - 逐行去掉首尾 ASCII 空白（保留行首全角空格缩进）
 * - 连续空行压缩为一行
 * - 去掉整体首尾空行
 */
export function normalizeLines(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(ASCII_WS, ''))

  const out: string[] = []
  for (const line of lines) {
    if (line === '' && out.length > 0 && out[out.length - 1] === '') continue
    out.push(line)
  }
  while (out.length > 0 && out[0] === '') out.shift()
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** HTML 片段 → 归一化多行纯文本（简介、前言、后记都用它）。 */
export function htmlToParagraphText(html: string): string {
  return normalizeLines(htmlToText(html))
}

/** 从任意文本中提取第一个整数，支持千分位逗号。 */
export function firstInt(text: string | null | undefined): number | null {
  if (!text) return null
  const m = /([\d,]+)/.exec(text)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 去重并保序。 */
export function uniq<T>(items: T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}
