/**
 * 统一领域模型（Domain Model）
 *
 * 设计原则：
 * 1. 与具体站点解耦——任何站点解析出的数据都必须归一化到这里的结构；
 * 2. 时间统一为带时区偏移的 ISO 8601 字符串（站点原始时区信息不丢失）；
 * 3. 可空字段用 `null` 而非 `undefined`，便于 JSON 序列化后语义稳定。
 */

/** 站点标识。新增站点只需扩展这个字符串字面量联合即可。 */
export type SiteId = 'syosetu' | (string & {})

/** 作品在某个站点内的定位信息。 */
export interface NovelRef {
  /** 站点标识，例如 'syosetu' */
  site: SiteId
  /** 站点内作品唯一 ID，例如 'n4703ix' */
  novelId: string
  /** 规范化后的作品主页 URL */
  canonicalUrl: string
  /** 站点内的分区/变体，例如 R18 分站 'novel18' */
  variant: string | null
}

/** 连载状态。 */
export type NovelStatus = 'ongoing' | 'completed' | 'hiatus' | 'short' | 'unknown'

/** 作品形态。 */
export type WorkType = 'serial' | 'short' | 'unknown'

/** 作者信息。 */
export interface AuthorRef {
  name: string
  /** 作者主页 URL（若站点提供） */
  url: string | null
  /** 站点内作者 ID（若站点提供） */
  siteUserId: string | null
}

/** 内容分级 / 警示标记。 */
export interface ContentFlags {
  r15: boolean
  r18: boolean
  zankoku: boolean
  bl: boolean
  gl: boolean
}

/** 作品级元数据。 */
export interface NovelMeta {
  title: string
  author: AuthorRef
  /** 简介纯文本，保留原始换行与日式缩进（全角空格） */
  summary: string
  status: NovelStatus
  /** 站点原始状态文案，例如「完結済」「連載中」 */
  statusLabel: string | null
  workType: WorkType
  /** 总话数（章节条目数） */
  episodeCount: number | null
  /** 总「章」数（分部/大章，可能为 0 表示未分章） */
  chapterCount: number | null
  /** 总字数 */
  wordCount: number | null
  /** 首话发布时间 */
  firstPublishedAt: string | null
  /** 最终话发布时间（= 作者最后一更的时间） */
  lastEpisodeAt: string | null
  /** 完结时间。仅当状态为 completed/short 时有值 */
  completedAt: string | null
  /** 标签 / 关键词 */
  tags: string[]
  /** 大类题材（站点原始分类名） */
  genre: string | null
  /** 大类题材编码（站点原始数值） */
  genreCode: number | null
  flags: ContentFlags
  /** 站点侧数据更新时间 */
  sourceUpdatedAt: string | null
}

/** 「章」——由站点目录中的分节标题形成。 */
export interface Chapter {
  /** 从 1 开始的章序号 */
  index: number
  title: string
  /** 该章包含的话序号区间（闭区间） */
  episodeStart: number
  episodeEnd: number
  episodeCount: number
}

/** 「话」——可阅读的最小单元。 */
export interface Episode {
  /** 从 1 开始的全書连续序号 */
  index: number
  title: string
  /** 目录接口附带的中文译文标题；未翻译或不可用时为 null。 */
  translatedTitle?: string | null
  /** 绝对 URL */
  url: string
  /** 站点内路径，例如 '/n4703ix/1/' */
  path: string
  /** 所属章序号；未分章时为 null */
  chapterIndex: number | null
  chapterTitle: string | null
  /** 首次发布时间 */
  publishedAt: string | null
  /** 最近改稿时间（若有） */
  revisedAt: string | null
  /** 是否改稿过 */
  isRevised: boolean
}

/** 正文内容（单话）。 */
export interface EpisodeContent {
  /** Optional Chinese translation; original fields are never replaced. */
  translation?: import('./episode-translation').StoredEpisodeTranslation
  index: number
  title: string
  /** 前言（まえがき），无则为空串 */
  preface: string
  /** 正文纯文本 */
  body: string
  /** 正文 HTML（保留原始段落结构，供后续渲染/清洗） */
  bodyHtml: string
  /** 后记（あとがき），无则为空串 */
  afterword: string
  /** 站点标注的总话数（如 '1/159' 中的 159） */
  totalEpisodes: number | null
}

/** 抓取元信息，便于增量更新与问题排查。 */
export interface FetchReport {
  fetchedAt: string
  parserVersion: string
  /** 实际抓取的目录页数量 */
  pagesFetched: number
  durationMs: number
  /** 使用的富化数据源，例如 ['narou-api'] */
  enrichedBy: string[]
  warnings: string[]
}

/** 解析产出的完整作品记录，即最终 JSON 的根结构。 */
export interface NovelRecord {
  schemaVersion: string
  source: {
    site: SiteId
    siteName: string
    novelId: string
    url: string
  }
  meta: NovelMeta
  chapters: Chapter[]
  episodes: Episode[]
  fetch: FetchReport
}

/* ------------------------------------------------------------------ */
/* 适配器契约                                                          */
/* ------------------------------------------------------------------ */

/** 目录页中的有序条目流：分节标题与话交替出现，顺序即阅读顺序。 */
export type IndexItem =
  | { kind: 'chapter'; title: string }
  | { kind: 'episode'; episode: RawEpisode }

/** 适配器解析出的「话」原始数据（尚未分配全书序号与所属章）。 */
export interface RawEpisode {
  /** 站点自带的序号（若 URL 中含序号）；缺省时由流水线顺序编号 */
  index: number | null
  title: string
  url: string
  path: string
  publishedAt: string | null
  revisedAt: string | null
  isRevised: boolean
}

/** 目录页分页信息。 */
export interface Pagination {
  /** 当前页码，从 1 开始 */
  page: number
  /** 总页数，至少为 1 */
  totalPages: number
  /** 总话数（仅当本页能确定时给出） */
  totalEpisodes: number | null
}

/** 单页目录的解析结果。 */
export interface IndexPageResult {
  meta: Partial<NovelMeta>
  items: IndexItem[]
  pagination: Pagination
  warnings: string[]
}

/** 适配器能力声明，供上层 UI 决定是否展示对应功能。 */
export interface AdapterCapabilities {
  /** 是否支持抓取正文 */
  episodeContent: boolean
  /** 目录是否分页 */
  paginated: boolean
  /** 是否有官方元数据 API 可富化 */
  metaApi: boolean
}

/** 站点适配器：所有站点差异都被收敛到这个接口内。 */
export interface SiteAdapter {
  readonly id: SiteId
  readonly name: string
  readonly capabilities: AdapterCapabilities
  /** 该适配器声明的域名列表，用于 URL 路由 */
  readonly hosts: readonly string[]

  /** 判断一个 URL 是否属于本站点 */
  match(url: string): boolean

  /**
   * 把用户输入（URL、裸 ID、站内短链）解析成规范化引用。
   * 无法识别时返回 null。
   */
  resolve(input: string): NovelRef | null

  /** 构造第 page 页（从 1 开始）的目录页 URL */
  indexUrl(ref: NovelRef, page: number): string

  /** 构造第 index 话的正文页 URL（可选；缺省时按 `${canonicalUrl}${index}/` 推断） */
  episodeUrl?(ref: NovelRef, index: number): string

  /** 解析目录页 HTML */
  parseIndexPage(html: string, ref: NovelRef, page: number): IndexPageResult

  /** 解析正文页 HTML（可选能力） */
  parseEpisodePage?(html: string, ref: NovelRef, index: number): EpisodeContent

  /** 通过官方 API 富化元数据（可选能力） */
  fetchMeta?(ref: NovelRef, http: HttpClient): Promise<Partial<NovelMeta> | null>
}

/* ------------------------------------------------------------------ */
/* HTTP 抽象                                                          */
/* ------------------------------------------------------------------ */

export interface HttpResponse {
  /** 最终 URL（可能因重定向而变化） */
  url: string
  status: number
  body: string
}

/** 最小 HTTP 契约：Node 与浏览器各自实现，解析层不关心运行时。 */
export interface HttpClient {
  get(url: string, init?: { signal?: AbortSignal }): Promise<HttpResponse>
}

/** 抓取进度事件。 */
export interface FetchProgress {
  phase: 'index' | 'episode' | 'enrich'
  page: number
  totalPages: number
  message: string
}

/** Site capability metadata exposed by the backend API. */
export interface SiteInfo {
  id: SiteId
  name: string
  hosts: readonly string[]
  capabilities: AdapterCapabilities
}
