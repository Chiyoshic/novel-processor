/**
 * 话序号表达式解析。
 *
 * 前端常见的输入形态：`1-20`、`1,3,5`、`1-3,7-9`。
 * 统一在这里解析，避免 UI 各自实现一套。
 */

/** 解析序号表达式，返回升序去重的序号数组。非法输入抛错。 */
export function parseEpisodeRange(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const token = part.trim()
    if (!token) continue

    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from <= 0 || to < from) throw new Error(`非法的序号区间：${token}`)
      for (let i = from; i <= to; i++) out.add(i)
      continue
    }

    const single = Number(token)
    if (!Number.isInteger(single) || single <= 0) throw new Error(`非法的序号：${token}`)
    out.add(single)
  }

  if (out.size === 0) throw new Error('未指定任何话序号')
  return [...out].sort((a, b) => a - b)
}

/** 把序号数组压缩成表达式，便于回显（如 `1-3,7`）。 */
export function formatEpisodeRange(indices: readonly number[]): string {
  if (indices.length === 0) return ''
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = current
    prev = current
  }
  return parts.join(',')
}
