/**
 * なろう 官方 API 富化层。
 *
 * 目录页 HTML 不包含「完結/連載」「総文字数」「総話数」等元数据，
 * 这些字段由官方 API（api.syosetu.com/novelapi）补齐，比爬页面稳定得多。
 *
 * 注意：API 只用于「补字段」，不替代 HTML 解析——
 * 因为章节列表与时间仍只能从 HTML 拿到。
 */
import type { ContentFlags, HttpClient, NovelMeta, NovelStatus, WorkType } from '../../types'
import { parseSiteDateTime, toDatePart } from '../../time'

const NOVEL_API = 'https://api.syosetu.com/novelapi/api/'

/** 大类题材编码 → 名称（对应 API 的 biggenre 字段） */
const BIG_GENRE_LABEL: Record<number, string> = {
  1: '恋愛',
  2: 'ファンタジー',
  3: '文芸',
  4: 'SF',
  5: 'その他',
  6: 'ノンジャンル',
}

/** API 原始记录（只声明用到的字段） */
interface NarouApiRecord {
  title?: string
  ncode?: string
  userid?: number
  writer?: string
  story?: string
  biggenre?: number
  genre?: number
  keyword?: string
  general_firstup?: string
  general_lastup?: string
  novel_type?: number
  /** 0: 已完结（含短編） 1: 连载中 —— 实测取值，非官方文档字面语义 */
  end?: number
  general_all_no?: number
  length?: number
  isstop?: number
  isr15?: number
  isbl?: number
  isgl?: number
  iszankoku?: number
  novelupdated_at?: string
  updated_at?: string
}

function toWorkType(novelType: number | undefined): WorkType {
  if (novelType === 2) return 'short'
  if (novelType === 1) return 'serial'
  return 'unknown'
}

function toStatus(record: NarouApiRecord): NovelStatus {
  if (record.isstop === 1) return 'hiatus'
  const workType = toWorkType(record.novel_type)
  if (workType === 'short') return 'short'
  // 实测：end=1 为连载中，end=0 为已完结
  if (record.end === 1) return 'ongoing'
  if (record.end === 0) return 'completed'
  return 'unknown'
}

function toStatusLabel(status: NovelStatus): string {
  switch (status) {
    case 'ongoing':
      return '連載中'
    case 'completed':
      return '完結済'
    case 'short':
      return '短編'
    case 'hiatus':
      return '休載中'
    default:
      return '不明'
  }
}

/**
 * 拉取单部作品的 API 元数据。
 * 作品不存在（如刚发布尚未进索引、或 ID 非法）时返回 null。
 */
export async function fetchSyosetuMeta(http: HttpClient, ncode: string): Promise<Partial<NovelMeta> | null> {
  const url = `${NOVEL_API}?ncode=${encodeURIComponent(ncode)}&out=json&lim=1`
  const res = await http.get(url)

  let parsed: unknown
  try {
    parsed = JSON.parse(res.body)
  } catch {
    return null
  }

  if (!Array.isArray(parsed) || parsed.length < 2) return null
  const record = parsed[1] as NarouApiRecord
  if (!record || typeof record !== 'object') return null

  const status = toStatus(record)
  const workType = toWorkType(record.novel_type)
  const lastup = parseSiteDateTime(record.general_lastup)
  const flags: ContentFlags = {
    r15: record.isr15 === 1,
    r18: false,
    zankoku: record.iszankoku === 1,
    bl: record.isbl === 1,
    gl: record.isgl === 1,
  }

  const tags = (record.keyword ?? '')
    .split(/[\s\u3000]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)

  const meta: Partial<NovelMeta> = {
    status,
    statusLabel: toStatusLabel(status),
    workType,
    episodeCount: record.general_all_no ?? null,
    wordCount: record.length ?? null,
    firstPublishedAt: parseSiteDateTime(record.general_firstup),
    lastEpisodeAt: lastup,
    completedAt: status === 'completed' || status === 'short' ? toDatePart(lastup) : null,
    tags,
    genre: record.biggenre ? (BIG_GENRE_LABEL[record.biggenre] ?? null) : null,
    genreCode: record.biggenre ?? null,
    flags,
    sourceUpdatedAt: parseSiteDateTime(record.novelupdated_at) ?? parseSiteDateTime(record.updated_at),
  }

  return meta
}
