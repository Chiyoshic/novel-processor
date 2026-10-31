import { createHash } from 'node:crypto'
import type { EpisodeContent } from './lib/types'
export function hashEpisodeSource(content: EpisodeContent): string {
  return createHash('sha256').update(JSON.stringify([content.index, content.title, content.preface, content.body, content.afterword])).digest('hex')
}
