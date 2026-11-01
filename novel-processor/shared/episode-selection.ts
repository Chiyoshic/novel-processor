export function validEpisodeRange(start: unknown, end: unknown): boolean {
  return typeof start === 'number' && typeof end === 'number' && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start
}
export function selectEpisodeRange(indices: readonly number[], allowed: ReadonlySet<number>, start: number, end: number): number[] {
  if (!validEpisodeRange(start, end)) throw new Error('起止话号须为正整数，结束话号不能小于起始话号')
  return [...new Set(indices)].filter((index) => index >= start && index <= end && allowed.has(index)).sort((a, b) => a - b)
}
export function selectFirstUntranslated(indices: readonly number[], downloaded: ReadonlySet<number>, translated: ReadonlySet<number>, count: number): number[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error('请选择 1–1000 话')
  return [...new Set(indices)].filter((index) => downloaded.has(index) && !translated.has(index)).sort((a, b) => a - b).slice(0, count)
}
