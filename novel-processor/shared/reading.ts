export type ReadingProgressFilter = 'all' | 'unread' | 'reading' | 'read'
export const readingStates = ['unread', 'reading', 'read'] as const
export type ReadingState = typeof readingStates[number]
export const readingLabels: Record<ReadingState, string> = { unread: '未读', reading: '在读', read: '已读' }
export interface EpisodeReading { index: number; status: ReadingState; updatedAt: string | null }
export interface ReadingSummary {
  total: number; unread: number; reading: number; read: number; percent: number
  /** One digit per episode in directory order: 0 unread/red, 1 reading/yellow, 2 read/green. */
  states: string
}
export interface ReadingProgress extends ReadingSummary { episodes: EpisodeReading[] }
export type UpdateReading = { status: ReadingState } & (
  | { scope: 'episode'; index: number }
  | { scope: 'chapter'; chapterIndex: number | null }
  | { scope: 'book' }
)
export function summarizeReading(episodes: Pick<EpisodeReading, 'status'>[]): ReadingSummary {
  const read = episodes.filter((episode) => episode.status === 'read').length
  const reading = episodes.filter((episode) => episode.status === 'reading').length
  return { total: episodes.length, read, reading, unread: episodes.length - read - reading,
    percent: episodes.length ? Math.round(read / episodes.length * 10000) / 100 : 0,
    states: episodes.map((episode) => episode.status === 'read' ? '2' : episode.status === 'reading' ? '1' : '0').join('') }
}

/** Mixed read/unread episodes represent an in-progress chapter/book. */
export function aggregateReadingState(states: readonly ReadingState[]): ReadingState {
  if (states.length && states.every((state) => state === 'read')) return 'read'
  return states.some((state) => state !== 'unread') ? 'reading' : 'unread'
}
