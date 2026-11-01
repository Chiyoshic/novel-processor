import type { TranslationBrief } from '../../../shared/translation'

export type ReaderCharacter = TranslationBrief['characters'][number]
export interface CharacterTextPart { text: string; characterIndices?: number[] }
// Only derive short forms from explicitly separated names, never arbitrary prefixes
// (e.g. 诺艾尔·布朗 -> 诺艾尔 / 布朗; 李明 does not become 李 / 明).
const nameSeparator = /[·・･•‧\s]+/u
const nonNameParts = new Set(['de', 'del', 'der', 'van', 'von', 'da', 'di', 'la', 'le', 'of', 'the', 'jr', 'sr', 'ii', 'iii', '先生', '女士', '小姐', '夫人', '殿下', '陛下', '公爵', '侯爵', '伯爵', '子爵', '男爵', '王子', '公主'])
function nameVariants(raw: string): string[] {
  const name = raw.trim()
  if (!name) return []
  const parts = name.split(nameSeparator).filter(Boolean)
  const shortNames = parts.length > 1 ? parts.filter((part) => Array.from(part).length >= 2 && !nonNameParts.has(part.toLowerCase())) : []
  return [...new Set([name, ...shortNames])]
}
/** Exact and derived short names: longest match first; ambiguous names retain all candidates. */
export function createCharacterMatcher(characters: ReaderCharacter[], translated: boolean) {
  const names = new Map<string, number[]>()
  characters.forEach((character, index) => {
    for (const raw of [translated ? character.chinese_name : character.original_name, ...character.aliases]) {
      for (const name of nameVariants(raw)) {
        const indices = names.get(name) ?? []
        if (!indices.includes(index)) indices.push(index)
        names.set(name, indices)
      }
    }
  })
  const entries = [...names].sort(([a], [b]) => b.length - a.length)
  const first = new Map<string, typeof entries>()
  for (const entry of entries) first.set(entry[0][0]!, [...(first.get(entry[0][0]!) ?? []), entry])
  const latinWord = (char: string | undefined) => !!char && /[\p{Script=Latin}\p{N}_]/u.test(char)
  return (text: string): CharacterTextPart[] => {
    if (!entries.length) return [{ text }]
    const parts: CharacterTextPart[] = []
    let plain = 0
    for (let offset = 0; offset < text.length;) {
      const found = first.get(text[offset]!)?.find(([name]) => text.startsWith(name, offset)
        && !(latinWord(name[0]) && latinWord(text[offset - 1]))
        && !(latinWord(name.at(-1)) && latinWord(text[offset + name.length])))
      if (!found) { offset++; continue }
      if (offset > plain) parts.push({ text: text.slice(plain, offset) })
      parts.push({ text: found[0], characterIndices: found[1] })
      offset += found[0].length; plain = offset
    }
    if (plain < text.length) parts.push({ text: text.slice(plain) })
    return parts.length ? parts : [{ text }]
  }
}
