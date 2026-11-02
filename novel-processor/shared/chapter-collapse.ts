import type { ReadingState } from './reading'

/** 取连续已读前缀，保留首个未读完 episode 前的两话；全读时保留最后两话。 */
export function readEpisodePrefix<T extends { index: number }>(
  episodes: readonly T[],
  states: ReadonlyMap<number, ReadingState>,
): T[] {
  const firstPending = episodes.findIndex(episode => states.get(episode.index) !== 'read')
  const end = Math.max(0, (firstPending < 0 ? episodes.length : firstPending) - 2)
  return episodes.slice(0, end)
}

/** 只投影目录视图；不改原始章/话对象，移除已收进临时分组的话和因此变空的章。 */
export function withoutReadPrefix<T extends { index: number }, G extends { episodes: readonly T[] }>(
  groups: readonly G[],
  prefixIndices: ReadonlySet<number>,
): G[] {
  return groups.map(group => ({ ...group, episodes: group.episodes.filter(episode => !prefixIndices.has(episode.index)) }))
    .filter(group => group.episodes.length > 0)
}
