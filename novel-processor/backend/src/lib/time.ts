/**
 * 时间归一化。
 *
 * 站点给出的时间几乎都是「本地时间」字符串（なろう 为 JST / UTC+9），
 * 不带时区信息。这里统一补上偏移量，输出 ISO 8601，
 * 避免下游把它当 UTC 处理导致 9 小时误差。
 */

/** 站点默认时区偏移。目前所有内置适配器均为 JST。 */
export const SITE_TZ_OFFSET = '+09:00'

const DATE_ONLY = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/
const DATE_TIME = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/

function pad(n: string | number, len = 2): string {
  return String(n).padStart(len, '0')
}

/**
 * 解析站点日期时间，返回带 +09:00 偏移的 ISO 字符串。
 * 支持 `2024/04/18 06:00`、`2024-04-18 06:00:50`。
 */
export function parseSiteDateTime(input: string | null | undefined, offset = SITE_TZ_OFFSET): string | null {
  if (!input) return null
  const m = DATE_TIME.exec(input.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s ?? '00')}${offset}`
}

/** 解析纯日期，返回 `YYYY-MM-DD`。 */
export function parseSiteDate(input: string | null | undefined): string | null {
  if (!input) return null
  const m = DATE_ONLY.exec(input.trim())
  if (!m) return null
  const [, y, mo, d] = m
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}`
}

/** 取 ISO 字符串的日期部分（`YYYY-MM-DD`）。 */
export function toDatePart(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? m[1] : null
}

/** 当前时刻的 ISO 字符串。 */
export function nowIso(): string {
  return new Date().toISOString()
}
