/**
 * なろう（syosetu）页面选择器集中管理。
 *
 * 站点改版时只需改这一个文件，业务逻辑不受影响。
 * 当前对应 2024 年后的新版小说页面（p-novel / p-eplist 命名空间）。
 */
export const SYOSETU_SELECTORS = {
  /** 作品标题 */
  title: '.p-novel__title',
  /** 作者链接（含 mypage 用户 ID） */
  authorLink: '.p-novel__author a',
  /** 「最終エピソード掲載日：YYYY/MM/DD」 */
  lastEpisodeDate: '.p-novel__date-published',
  /** 简介容器 */
  summary: '#novel_ex',
  /** 目录列表容器 */
  episodeList: '.p-eplist',
  /** 分节（章）标题（class 名，供 hasClass 判断） */
  chapterTitleClass: 'p-eplist__chapter-title',
  /** 单话条目（class 名，供 hasClass 判断） */
  episodeItemClass: 'p-eplist__sublist',
  /** 分节（章）标题选择器 */
  chapterTitle: '.p-eplist__chapter-title',
  /** 单话条目选择器 */
  episodeItem: '.p-eplist__sublist',
  /** 单话标题链接 */
  episodeTitleLink: 'a.p-eplist__subtitle',
  /** 单话时间（含改稿 span） */
  episodeUpdate: '.p-eplist__update',
  /** 分页：跳到最后一页的链接 */
  pagerLast: '.c-pager__item--last',
  /** 分页：当前页条目范围文案 */
  pagerStats: '.c-pager__result-stats',
  /** 正文页：'1/159' 形式的序号 */
  episodeNumber: '.p-novel__number',
  /** 正文页：正文容器（排除前言/后记） */
  episodeBody: '.p-novel__text',
  /** 正文页：前言 */
  episodePreface: '.p-novel__text--preface',
  /** 正文页：后记 */
  episodeAfterword: '.p-novel__text--afterword',
} as const

/** 支持的作品 ID 形态：n + 4 位数字 + 1~2 位字母 */
export const SYOSETU_NCODE_RE = /(?:^|[^a-z0-9])(n\d{4}[a-z]{1,2})(?![a-z0-9])/i

/** 主页域名 */
export const SYOSETU_MAIN_HOST = 'ncode.syosetu.com'

/** R18 分站域名 */
export const SYOSETU_R18_HOST = 'novel18.syosetu.com'
