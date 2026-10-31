/**
 * 小説家になろう（syosetu）适配器。
 *
 * 负责三件事：
 * 1. 输入归一化：URL / 裸 ncode → NovelRef
 * 2. 目录页解析：标题、作者、简介、分节、话列表、时间、分页
 * 3. 正文页解析：前言 / 正文 / 后记
 *
 * 元数据富化（完结状态、总字数等）委托给 api.ts。
 */
import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type {
  AdapterCapabilities,
  EpisodeContent,
  HttpClient,
  IndexItem,
  IndexPageResult,
  NovelMeta,
  NovelRef,
  SiteAdapter,
} from '../../types'
import { cleanInline, htmlToParagraphText, htmlToText, normalizeLines } from '../../text'
import { parseSiteDate, parseSiteDateTime } from '../../time'
import { fetchSyosetuMeta } from './api'
import {
  SYOSETU_MAIN_HOST,
  SYOSETU_NCODE_RE,
  SYOSETU_R18_HOST,
  SYOSETU_SELECTORS as SEL,
} from './selectors'

const PARSER_VERSION = 'syosetu/1.0.0'

/** 目录页单页最多 100 话，用于在拿不到分页链接时兜底推算。 */
const EPISODES_PER_PAGE = 100

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/** 把容器内的 `<p>` 段落拼成多行纯文本。 */
function blockText($: CheerioAPI, selector: string): string {
  const $el = $(selector).first()
  if ($el.length === 0) return ''

  const paragraphs = $el.find('p')
  if (paragraphs.length === 0) {
    return normalizeLines(htmlToText($el.html() ?? ''))
  }

  const parts: string[] = []
  paragraphs.each((_, el) => {
    const raw = htmlToText($(el).html() ?? '')
    // `<p><br /></p>` 这类纯空行段落：去掉行尾换行后保留为空串，占一行
    parts.push(raw.replace(/[ \t\r\n\u00a0]+$/, ''))
  })
  return normalizeLines(parts.join('\n'))
}

export class SyosetuAdapter implements SiteAdapter {
  readonly id = 'syosetu'
  readonly name = '小説家になろう'
  readonly hosts = [SYOSETU_MAIN_HOST, SYOSETU_R18_HOST, 'syosetu.com'] as const
  readonly capabilities: AdapterCapabilities = {
    episodeContent: true,
    paginated: true,
    metaApi: true,
  }

  match(url: string): boolean {
    try {
      const host = new URL(url).hostname
      return this.hosts.some((h) => host === h || host.endsWith(`.${h}`))
    } catch {
      return false
    }
  }

  resolve(input: string): NovelRef | null {
    const raw = input.trim()
    if (!raw) return null

    let ncode: string | null = null
    let variant: string | null = null

    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) {
      let url: URL
      try {
        url = new URL(raw.startsWith('//') ? `https:${raw}` : raw)
      } catch {
        return null
      }
      if (!this.match(url.toString())) return null
      if (url.hostname === SYOSETU_R18_HOST) variant = 'novel18'
      ncode = SYOSETU_NCODE_RE.exec(url.pathname)?.[1] ?? null
    } else {
      ncode = SYOSETU_NCODE_RE.exec(raw)?.[1] ?? null
    }

    if (!ncode) return null
    const novelId = ncode.toLowerCase()
    const host = variant === 'novel18' ? SYOSETU_R18_HOST : SYOSETU_MAIN_HOST

    return {
      site: this.id,
      novelId,
      canonicalUrl: `https://${host}/${novelId}/`,
      variant,
    }
  }

  indexUrl(ref: NovelRef, page: number): string {
    const base = ref.canonicalUrl.replace(/\/+$/, '/')
    return page > 1 ? `${base}?p=${page}` : base
  }

  episodeUrl(ref: NovelRef, index: number): string {
    const base = ref.canonicalUrl.replace(/\/+$/, '/')
    return `${base}${index}/`
  }

  parseIndexPage(html: string, ref: NovelRef, page: number): IndexPageResult {
    const $ = cheerio.load(html)
    const warnings: string[] = []

    const title = cleanInline($(SEL.title).first().text())
    if (!title) warnings.push('未解析到作品标题，页面结构可能已变更')

    const $author = $(SEL.authorLink).first()
    const authorHref = $author.attr('href') ?? null
    const authorName = cleanInline($author.text())
    const authorUserId = authorHref ? (/mypage\.syosetu\.com\/(\d+)/.exec(authorHref)?.[1] ?? null) : null
    if (!authorName) warnings.push('未解析到作者名')

    const $summary = $(SEL.summary).first()
    const summary = $summary.length > 0 ? htmlToParagraphText($summary.html() ?? '') : ''
    if (summary === '') warnings.push('未解析到简介')

    // 目录页只给到「日」精度；精确到秒的时间由官方 API 补齐
    const lastEpisodeDate = parseSiteDate($(SEL.lastEpisodeDate).first().text())

    const items = this.parseEpisodeList($, ref)
    const episodeCount = items.filter((item) => item.kind === 'episode').length
    if (items.length === 0) warnings.push('未解析到任何话，页面结构可能已变更')

    const pagination = this.parsePagination($, page, episodeCount)

    const meta: Partial<NovelMeta> = {
      title,
      author: {
        name: authorName,
        url: authorHref ? absoluteUrl(ref.canonicalUrl, authorHref) : null,
        siteUserId: authorUserId,
      },
      summary,
      lastEpisodeAt: lastEpisodeDate ? `${lastEpisodeDate}T00:00:00+09:00` : null,
    }

    return { meta, items, pagination, warnings }
  }

  parseEpisodePage(html: string, _ref: NovelRef, index: number): EpisodeContent {
    const $ = cheerio.load(html)

    const title = cleanInline($(SEL.title).first().text())
    const numberText = $(SEL.episodeNumber).first().text().trim()
    const totalMatch = /\/\s*(\d+)/.exec(numberText)
    const totalEpisodes = totalMatch ? Number(totalMatch[1]) : null

    const bodySelector = `${SEL.episodeBody}:not(${SEL.episodePreface}):not(${SEL.episodeAfterword})`
    const $body = $(bodySelector).first()

    return {
      index,
      title: title || `第${index}話`,
      preface: blockText($, SEL.episodePreface),
      body: $body.length > 0 ? blockText($, bodySelector) : '',
      bodyHtml: $body.html() ?? '',
      afterword: blockText($, SEL.episodeAfterword),
      totalEpisodes,
    }
  }

  async fetchMeta(ref: NovelRef, http: HttpClient): Promise<Partial<NovelMeta> | null> {
    try {
      return await fetchSyosetuMeta(http, ref.novelId)
    } catch {
      // 富化失败不应让整个抓取失败
      return null
    }
  }

  /** 解析 `.p-eplist` 下的有序条目流（章标题 + 话交替）。 */
  private parseEpisodeList($: CheerioAPI, ref: NovelRef): IndexItem[] {
    const items: IndexItem[] = []
    const $list = $(SEL.episodeList).first()
    if ($list.length === 0) return items

    $list.children().each((_, el) => {
      const $el = $(el)

      if ($el.hasClass(SEL.chapterTitleClass)) {
        const chapterTitle = cleanInline($el.text())
        if (chapterTitle) items.push({ kind: 'chapter', title: chapterTitle })
        return
      }

      if (!$el.hasClass(SEL.episodeItemClass)) return

      const $link = $el.find(SEL.episodeTitleLink).first()
      const href = $link.attr('href')
      if (!href) return

      const $update = $el.find(SEL.episodeUpdate).first()
      const updateText = $update.text()
      // 第一个时间即首次发布；「（改）」span 的 title 里是最近改稿时间
      const publishedRaw = /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/.exec(updateText)?.[1] ?? null
      const revisedRaw =
        /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/.exec($update.find('span[title]').first().attr('title') ?? '')?.[1] ??
        null

      const indexFromUrl = /\/(\d+)\/?$/.exec(href)?.[1]

      items.push({
        kind: 'episode',
        episode: {
          index: indexFromUrl ? Number(indexFromUrl) : null,
          title: cleanInline($link.text()),
          url: absoluteUrl(ref.canonicalUrl, href),
          path: href,
          publishedAt: parseSiteDateTime(publishedRaw),
          revisedAt: parseSiteDateTime(revisedRaw),
          isRevised: revisedRaw !== null,
        },
      })
    })

    return items
  }

  /** 从分页控件推断总页数与总话数。 */
  private parsePagination($: CheerioAPI, page: number, pageItemCount: number): IndexPageResult['pagination'] {
    const statsText = $(SEL.pagerStats).first().text().replace(/\u00a0/g, ' ')
    const range = /エピソード\s*([\d,]+)\s*[～~〜]\s*([\d,]+)/.exec(statsText)
    const rangeEnd = range ? Number(range[2].replace(/,/g, '')) : null

    let totalPages = 1
    const lastHref = $(SEL.pagerLast).attr('href')
    const lastPage = lastHref ? /[?&]p=(\d+)/.exec(lastHref)?.[1] : null
    if (lastPage) {
      totalPages = Math.max(1, Number(lastPage))
    } else if (pageItemCount >= EPISODES_PER_PAGE) {
      // 没有分页链接但本页塞满：保守地认为还有下一页，交由上层校验
      totalPages = page + 1
    }

    return {
      page,
      totalPages,
      totalEpisodes: page === totalPages ? rangeEnd : null,
    }
  }
}

export const SYOSETU_PARSER_VERSION = PARSER_VERSION
