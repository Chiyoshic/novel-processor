/**
 * SQLite 索引层（辅助存储）。
 *
 * 定位：**SQLite 不是正文存储，而是索引**。
 * - 正文与目录仍是磁盘 JSON（`data/novels` / `data/episodes`）：可读、可备份；
 * - SQLite 只存可查询的骨架：作品、章、话、是否有正文、标签。
 *
 * 由此得到一个重要性质：**DB 是磁盘的投影，可随时整库重建**。
 * 所以 schema 升级不需要写迁移脚本——版本不符就 drop 重建，再 `syncFromDisk()`。
 *
 * 设计要点（v2）：
 * 1. `novels.id` 用整型代理主键 + `UNIQUE(site, novel_id)`：
 *    外键与标签关联都只需一个整数，比复合主键省空间、join 更快。
 * 2. 标签从 JSON 字符串拆成 `novel_tags` 关联表：
 *    可 GROUP BY 做「分类统计」，可按标签精确筛选，而不是 LIKE '%tag%'。
 * 3. `downloaded_count` 冗余列 + 触发器维护：
 *    列表页不再对每一行跑 `SELECT COUNT(*)` 子查询（原来最热的 N+1）。
 * 4. 索引按真实查询建：`(status, last_episode_at)`、`(site, ...)`、
 *    以及 `episodes(novel_id) WHERE has_content = 1` 的部分索引。
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { NovelRecord } from '../src/lib/types'

const SCHEMA_VERSION = 3

export interface DbNovelRow {
  site: string
  novelId: string
  title: string
  author: string
  status: string
  statusLabel: string | null
  genre: string | null
  episodeCount: number
  chapterCount: number
  wordCount: number | null
  downloaded: number
  lastEpisodeAt: string | null
  completedAt: string | null
  importedAt: string
  /** 非空表示在回收站中 */
  deletedAt: string | null
  tags: string[]
}

export type ProgressFilter = 'all' | 'none' | 'partial' | 'complete'
export type NovelSort = 'recent' | 'imported' | 'title' | 'progress'

export interface NovelQuery {
  q?: string
  site?: string
  status?: string
  genre?: string
  tag?: string
  progress?: ProgressFilter
  sort?: NovelSort
  /** true = 只看回收站，false/缺省 = 只看正常作品 */
  trashed?: boolean
  limit?: number
  offset?: number
}

export interface FacetBucket {
  value: string
  label: string
  count: number
}

export interface LibraryFacets {
  total: number
  /** 回收站条目数 */
  trashed: number
  status: FacetBucket[]
  site: FacetBucket[]
  genre: FacetBucket[]
  tags: FacetBucket[]
}

interface RawNovelRow {
  id: number
  site: string
  novel_id: string
  title: string
  author: string
  status: string
  status_label: string | null
  genre: string | null
  episode_count: number
  chapter_count: number
  word_count: number | null
  downloaded_count: number
  last_episode_at: string | null
  completed_at: string | null
  imported_at: string
  deleted_at: string | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS novels (
  id                INTEGER PRIMARY KEY,
  site              TEXT NOT NULL,
  novel_id          TEXT NOT NULL,
  title             TEXT NOT NULL,
  author            TEXT NOT NULL DEFAULT '',
  author_url        TEXT,
  status            TEXT NOT NULL DEFAULT 'unknown',
  status_label      TEXT,
  work_type         TEXT NOT NULL DEFAULT 'unknown',
  genre             TEXT,
  genre_code        INTEGER,
  episode_count     INTEGER NOT NULL DEFAULT 0,
  chapter_count     INTEGER NOT NULL DEFAULT 0,
  word_count        INTEGER,
  downloaded_count  INTEGER NOT NULL DEFAULT 0,
  first_published_at TEXT,
  last_episode_at   TEXT,
  completed_at      TEXT,
  source_url        TEXT NOT NULL DEFAULT '',
  imported_at       TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  -- 二级删除：NULL = 正常，非空 = 在回收站（软删除时间）
  deleted_at        TEXT,
  UNIQUE (site, novel_id)
);

CREATE TABLE IF NOT EXISTS novel_tags (
  novel_id INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (novel_id, tag)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS chapters (
  novel_id      INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  episode_start INTEGER NOT NULL DEFAULT 0,
  episode_end   INTEGER NOT NULL DEFAULT 0,
  episode_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (novel_id, idx)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS episodes (
  novel_id     INTEGER NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  path         TEXT NOT NULL DEFAULT '',
  chapter_idx  INTEGER,
  published_at TEXT,
  revised_at   TEXT,
  is_revised   INTEGER NOT NULL DEFAULT 0,
  has_content  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (novel_id, idx)
) WITHOUT ROWID;

-- downloaded_count 由触发器维护，避免列表页逐行子查询
CREATE TRIGGER IF NOT EXISTS trg_episodes_insert AFTER INSERT ON episodes
WHEN new.has_content = 1
BEGIN
  UPDATE novels SET downloaded_count = downloaded_count + 1 WHERE id = new.novel_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_episodes_delete AFTER DELETE ON episodes
WHEN old.has_content = 1
BEGIN
  UPDATE novels SET downloaded_count = downloaded_count - 1 WHERE id = old.novel_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_episodes_update AFTER UPDATE OF has_content ON episodes
WHEN old.has_content <> new.has_content
BEGIN
  UPDATE novels
     SET downloaded_count = downloaded_count + (new.has_content - old.has_content)
   WHERE id = new.novel_id;
END;

CREATE INDEX IF NOT EXISTS idx_novels_status ON novels (status, last_episode_at DESC);
CREATE INDEX IF NOT EXISTS idx_novels_site   ON novels (site, last_episode_at DESC);
CREATE INDEX IF NOT EXISTS idx_novels_genre  ON novels (genre_code);
CREATE INDEX IF NOT EXISTS idx_novels_updated ON novels (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_novels_title   ON novels (title);
CREATE INDEX IF NOT EXISTS idx_tags_tag       ON novel_tags (tag);
`

/**
 * 索引必须**在补列之后**创建。
 * 早期版本的坑：CREATE TABLE IF NOT EXISTS 会跳过已存在的表，
 * 若新版本加了列而旧表没有，这里对缺失列建索引会直接抛 `no such column`。
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_novels_trash   ON novels (deleted_at);
CREATE INDEX IF NOT EXISTS idx_episodes_content ON episodes (novel_id) WHERE has_content = 1;
`

/** 需要补齐的列（老库升级用，只加不删）。 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: 'novels', column: 'deleted_at', ddl: 'ALTER TABLE novels ADD COLUMN deleted_at TEXT' },
]

/** 状态码 → 中文标签（用于 facets 展示）。 */
const STATUS_LABEL: Record<string, string> = {
  ongoing: '连载中',
  completed: '已完结',
  hiatus: '休载',
  short: '短篇',
  unknown: '未知',
}

export class LibraryDb {
  private readonly db: Database.Database

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new Database(file)

    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('cache_size = -16000') // 约 16MB 页缓存
    this.db.pragma('mmap_size = 134217728') // 128MB 内存映射，减少 read syscall

    // 建表（已存在则跳过）→ 补齐新增列 → 建索引（依赖列，必须在补列之后）
    this.db.exec(SCHEMA)
    this.ensureColumns()
    this.db.exec(INDEXES)

    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version !== SCHEMA_VERSION) this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }

  /**
   * 补齐缺失的列（只加不删）。
   *
   * 这里刻意**不再**「版本不符就 DROP 重建」：
   * `deleted_at`（回收站状态）是用户意图，磁盘上没有对应文件，属于 DB 独有数据。
   * 一旦整库重建，回收站会静默清空——这个代价远高于写几行 ALTER TABLE。
   */
  private ensureColumns(): void {
    for (const item of REQUIRED_COLUMNS) {
      const columns = this.db.prepare(`PRAGMA table_info(${item.table})`).all() as Array<{ name: string }>
      if (!columns.some((column) => column.name === item.column)) {
        this.db.exec(item.ddl)
      }
    }
  }

  /** 写入/更新一部作品的骨架（幂等）。 */
  upsertCatalog(record: NovelRecord): number {
    const now = new Date().toISOString()
    const { source, meta } = record

    const write = this.db.transaction((): number => {
      this.db
        .prepare(
          `INSERT INTO novels (
             site, novel_id, title, author, author_url, status, status_label, work_type,
             genre, genre_code, episode_count, chapter_count, word_count,
             first_published_at, last_episode_at, completed_at, source_url, imported_at, updated_at
           ) VALUES (
             @site, @novelId, @title, @author, @authorUrl, @status, @statusLabel, @workType,
             @genre, @genreCode, @episodeCount, @chapterCount, @wordCount,
             @firstPublishedAt, @lastEpisodeAt, @completedAt, @sourceUrl, @now, @now
           )
           ON CONFLICT(site, novel_id) DO UPDATE SET
             title = excluded.title,
             author = excluded.author,
             author_url = excluded.author_url,
             status = excluded.status,
             status_label = excluded.status_label,
             work_type = excluded.work_type,
             genre = excluded.genre,
             genre_code = excluded.genre_code,
             episode_count = excluded.episode_count,
             chapter_count = excluded.chapter_count,
             word_count = excluded.word_count,
             first_published_at = excluded.first_published_at,
             last_episode_at = excluded.last_episode_at,
             completed_at = excluded.completed_at,
             source_url = excluded.source_url,
             updated_at = excluded.updated_at`,
        )
        .run({
          site: source.site,
          novelId: source.novelId,
          title: meta.title,
          author: meta.author.name,
          authorUrl: meta.author.url,
          status: meta.status,
          statusLabel: meta.statusLabel,
          workType: meta.workType,
          genre: meta.genre,
          genreCode: meta.genreCode,
          episodeCount: record.episodes.length,
          chapterCount: record.chapters.length,
          wordCount: meta.wordCount,
          firstPublishedAt: meta.firstPublishedAt,
          lastEpisodeAt: meta.lastEpisodeAt,
          completedAt: meta.completedAt,
          sourceUrl: source.url,
          now,
        })

      const novelId = (
        this.db.prepare('SELECT id FROM novels WHERE site = ? AND novel_id = ?').get(source.site, source.novelId) as {
          id: number
        }
      ).id

      // 标签：整体替换
      this.db.prepare('DELETE FROM novel_tags WHERE novel_id = ?').run(novelId)
      const insertTag = this.db.prepare('INSERT OR IGNORE INTO novel_tags (novel_id, tag) VALUES (?, ?)')
      for (const tag of meta.tags) insertTag.run(novelId, tag)

      // 章：整体替换
      this.db.prepare('DELETE FROM chapters WHERE novel_id = ?').run(novelId)
      const insertChapter = this.db.prepare(
        `INSERT INTO chapters (novel_id, idx, title, episode_start, episode_end, episode_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const chapter of record.chapters) {
        insertChapter.run(
          novelId,
          chapter.index,
          chapter.title,
          chapter.episodeStart,
          chapter.episodeEnd,
          chapter.episodeCount,
        )
      }

      // 话：upsert，且**不触碰 has_content**，避免重抓目录清掉下载状态
      const upsertEpisode = this.db.prepare(
        `INSERT INTO episodes (novel_id, idx, title, url, path, chapter_idx, published_at, revised_at, is_revised)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(novel_id, idx) DO UPDATE SET
           title = excluded.title,
           url = excluded.url,
           path = excluded.path,
           chapter_idx = excluded.chapter_idx,
           published_at = excluded.published_at,
           revised_at = excluded.revised_at,
           is_revised = excluded.is_revised`,
      )
      for (const episode of record.episodes) {
        upsertEpisode.run(
          novelId,
          episode.index,
          episode.title,
          episode.url,
          episode.path,
          episode.chapterIndex,
          episode.publishedAt,
          episode.revisedAt,
          episode.isRevised ? 1 : 0,
        )
      }

      // 清理作者已删除的话（触发器会同步扣减 downloaded_count）
      const maxIndex = record.episodes.reduce((max, e) => Math.max(max, e.index), 0)
      this.db.prepare('DELETE FROM episodes WHERE novel_id = ? AND idx > ?').run(novelId, maxIndex)

      return novelId
    })

    return write()
  }

  /** 用磁盘真实状态覆盖「是否有正文」。只写有差异的行。 */
  setContentFlags(novelId: number, indices: readonly number[]): void {
    const list = [...indices]
    const run = this.db.transaction(() => {
      if (list.length === 0) {
        this.db.prepare('UPDATE episodes SET has_content = 0 WHERE novel_id = ? AND has_content = 1').run(novelId)
        return
      }
      const placeholders = list.map(() => '?').join(',')
      this.db
        .prepare(
          `UPDATE episodes SET has_content = 0
            WHERE novel_id = ? AND has_content = 1 AND idx NOT IN (${placeholders})`,
        )
        .run(novelId, ...list)
      this.db
        .prepare(
          `UPDATE episodes SET has_content = 1
            WHERE novel_id = ? AND has_content = 0 AND idx IN (${placeholders})`,
        )
        .run(novelId, ...list)
    })
    run()
  }

  /**
   * 增量标记单话已下载。
   *
   * 下载过程中每抓完一话就调一次：这样 `/status` 能立刻反映进度，
   * 前端轮询才有东西可看。整批结束后再用 `setContentFlags` 做一次全量校准。
   */
  markContent(site: string, novelId: string, indices: readonly number[]): void {
    if (indices.length === 0) return
    const id = this.findId(site, novelId)
    if (id === null) return
    const mark = this.db.prepare(
      'UPDATE episodes SET has_content = 1 WHERE novel_id = ? AND idx = ? AND has_content = 0',
    )
    const run = this.db.transaction(() => {
      for (const index of indices) mark.run(id, index)
    })
    run()
  }

  /** 按 site + novelId 定位代理主键。 */
  findId(site: string, novelId: string): number | null {
    const row = this.db.prepare('SELECT id FROM novels WHERE site = ? AND novel_id = ?').get(site, novelId) as
      | { id: number }
      | undefined
    return row?.id ?? null
  }

  /** 一级删除：移入回收站（软删除，不碰磁盘文件）。 */
  trashNovel(site: string, novelId: string): boolean {
    const result = this.db
      .prepare(
        'UPDATE novels SET deleted_at = ? WHERE site = ? AND novel_id = ? AND deleted_at IS NULL',
      )
      .run(new Date().toISOString(), site, novelId)
    return result.changes > 0
  }

  /** 从回收站恢复。 */
  restoreNovel(site: string, novelId: string): boolean {
    const result = this.db
      .prepare('UPDATE novels SET deleted_at = NULL WHERE site = ? AND novel_id = ? AND deleted_at IS NOT NULL')
      .run(site, novelId)
    return result.changes > 0
  }

  /** 二级删除：永久移除索引（磁盘文件由调用方负责清理）。 */
  purgeNovel(site: string, novelId: string): boolean {
    const result = this.db.prepare('DELETE FROM novels WHERE site = ? AND novel_id = ?').run(site, novelId)
    return result.changes > 0
  }

  /** 清空回收站，返回被移除的作品列表（供调用方删文件）。 */
  purgeAllTrashed(): Array<{ site: string; novelId: string }> {
    const rows = this.db
      .prepare('SELECT site, novel_id FROM novels WHERE deleted_at IS NOT NULL')
      .all() as Array<{ site: string; novel_id: string }>
    this.db.prepare('DELETE FROM novels WHERE deleted_at IS NOT NULL').run()
    return rows.map((row) => ({ site: row.site, novelId: row.novel_id }))
  }

  /** 回收站条目数。 */
  trashCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM novels WHERE deleted_at IS NOT NULL').get() as {
      c: number
    }
    return row.c
  }

  /** 作品是否在回收站（不存在返回 false）。 */
  isTrashed(site: string, novelId: string): boolean {
    const row = this.db
      .prepare('SELECT deleted_at FROM novels WHERE site = ? AND novel_id = ?')
      .get(site, novelId) as { deleted_at: string | null } | undefined
    return row?.deleted_at != null
  }

  /** 取作品原始地址（目录 JSON 丢失时用于重新抓取）。 */
  getSourceUrl(site: string, novelId: string): string | null {
    const row = this.db
      .prepare('SELECT source_url FROM novels WHERE site = ? AND novel_id = ?')
      .get(site, novelId) as { source_url: string } | undefined
    return row?.source_url || null
  }

  hasNovel(site: string, novelId: string): boolean {
    return this.findId(site, novelId) !== null
  }

  /** 已下载的话序号（升序）。 */
  contentFlags(site: string, novelId: string): number[] {
    const id = this.findId(site, novelId)
    if (id === null) return []
    const rows = this.db
      .prepare('SELECT idx FROM episodes WHERE novel_id = ? AND has_content = 1 ORDER BY idx ASC')
      .all(id) as Array<{ idx: number }>
    return rows.map((row) => row.idx)
  }

  /** 分页 + 多维筛选的列表查询。默认只返回未删除的作品。 */
  listNovels(query: NovelQuery = {}): { items: DbNovelRow[]; total: number } {
    const where: string[] = [query.trashed ? 'n.deleted_at IS NOT NULL' : 'n.deleted_at IS NULL']
    const params: Record<string, unknown> = {}

    if (query.q) {
      // 作品量级在千级以内，LIKE 全表扫描是微秒级；
      // 用 FTS5 需要处理 CJK 分词（trigram 对 2 字查询不友好），收益不抵复杂度。
      where.push('(n.title LIKE @like OR n.author LIKE @like)')
      params.like = `%${query.q}%`
    }
    if (query.site) {
      where.push('n.site = @site')
      params.site = query.site
    }
    if (query.status) {
      where.push('n.status = @status')
      params.status = query.status
    }
    if (query.genre) {
      where.push('n.genre = @genre')
      params.genre = query.genre
    }
    if (query.tag) {
      where.push('EXISTS (SELECT 1 FROM novel_tags t WHERE t.novel_id = n.id AND t.tag = @tag)')
      params.tag = query.tag
    }
    switch (query.progress) {
      case 'none':
        where.push('n.downloaded_count = 0')
        break
      case 'partial':
        where.push('n.downloaded_count > 0 AND n.downloaded_count < n.episode_count')
        break
      case 'complete':
        where.push('n.episode_count > 0 AND n.downloaded_count >= n.episode_count')
        break
      default:
        break
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const orderSql = (() => {
      switch (query.sort) {
        case 'imported':
          return 'ORDER BY n.imported_at DESC'
        case 'title':
          return 'ORDER BY n.title ASC'
        case 'progress':
          return 'ORDER BY (CAST(n.downloaded_count AS REAL) / MAX(n.episode_count, 1)) DESC, n.title ASC'
        default:
          return query.trashed
            ? 'ORDER BY n.deleted_at DESC'
            : 'ORDER BY COALESCE(n.last_episode_at, n.updated_at) DESC'
      }
    })()

    const limit = Math.min(Math.max(query.limit ?? 60, 1), 200)
    const offset = Math.max(query.offset ?? 0, 0)

    const total = (this.db.prepare(`SELECT COUNT(*) AS c FROM novels n ${whereSql}`).get(params) as { c: number }).c

    const rows = this.db
      .prepare(
        `SELECT n.id, n.site, n.novel_id, n.title, n.author, n.status, n.status_label, n.genre,
                n.episode_count, n.chapter_count, n.word_count, n.downloaded_count,
                n.last_episode_at, n.completed_at, n.imported_at, n.deleted_at
           FROM novels n
           ${whereSql}
           ${orderSql}
           LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset }) as RawNovelRow[]

    // 标签单独一次查询，避免逐行子查询
    const tagsByNovel = this.tagsFor(rows.map((row) => row.id))

    return {
      total,
      items: rows.map((row) => ({
        site: row.site,
        novelId: row.novel_id,
        title: row.title,
        author: row.author,
        status: row.status,
        statusLabel: row.status_label,
        genre: row.genre,
        episodeCount: row.episode_count,
        chapterCount: row.chapter_count,
        wordCount: row.word_count,
        downloaded: row.downloaded_count,
        lastEpisodeAt: row.last_episode_at,
        completedAt: row.completed_at,
        importedAt: row.imported_at,
        deletedAt: row.deleted_at,
        tags: tagsByNovel.get(row.id) ?? [],
      })),
    }
  }

  /** 分类统计：状态 / 站点 / 题材 / 热门标签。只统计未删除的作品。 */
  facets(): LibraryFacets {
    const statusRows = this.db
      .prepare(
        'SELECT status AS value, COUNT(*) AS c FROM novels WHERE deleted_at IS NULL GROUP BY status ORDER BY c DESC',
      )
      .all() as Array<{ value: string; c: number }>

    const siteRows = this.db
      .prepare('SELECT site AS value, COUNT(*) AS c FROM novels WHERE deleted_at IS NULL GROUP BY site ORDER BY c DESC')
      .all() as Array<{ value: string; c: number }>

    const genreRows = this.db
      .prepare(
        `SELECT genre AS value, COUNT(*) AS c FROM novels
          WHERE deleted_at IS NULL AND genre IS NOT NULL AND genre <> ''
          GROUP BY genre ORDER BY c DESC`,
      )
      .all() as Array<{ value: string; c: number }>

    const tagRows = this.db
      .prepare(
        `SELECT t.tag AS value, COUNT(*) AS c
           FROM novel_tags t JOIN novels n ON n.id = t.novel_id
          WHERE n.deleted_at IS NULL
          GROUP BY t.tag ORDER BY c DESC, t.tag ASC LIMIT 24`,
      )
      .all() as Array<{ value: string; c: number }>

    const total = (this.db.prepare('SELECT COUNT(*) AS c FROM novels WHERE deleted_at IS NULL').get() as { c: number }).c

    return {
      total,
      trashed: this.trashCount(),
      status: statusRows.map((row) => ({
        value: row.value,
        label: STATUS_LABEL[row.value] ?? row.value,
        count: row.c,
      })),
      site: siteRows.map((row) => ({ value: row.value, label: row.value, count: row.c })),
      genre: genreRows.map((row) => ({ value: row.value, label: row.value, count: row.c })),
      tags: tagRows.map((row) => ({ value: row.value, label: row.value, count: row.c })),
    }
  }

  stats(): { novels: number; episodes: number; withContent: number; trashed: number } {
    const novels = this.db.prepare('SELECT COUNT(*) AS c FROM novels WHERE deleted_at IS NULL').get() as { c: number }
    const trashed = this.db.prepare('SELECT COUNT(*) AS c FROM novels WHERE deleted_at IS NOT NULL').get() as {
      c: number
    }
    const episodes = this.db.prepare('SELECT COUNT(*) AS c FROM episodes').get() as { c: number }
    const withContent = this.db.prepare('SELECT COUNT(*) AS c FROM episodes WHERE has_content = 1').get() as {
      c: number
    }
    return { novels: novels.c, episodes: episodes.c, withContent: withContent.c, trashed: trashed.c }
  }

  close(): void {
    this.db.close()
  }

  private tagsFor(ids: number[]): Map<number, string[]> {
    const map = new Map<number, string[]>()
    if (ids.length === 0) return map
    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .prepare(`SELECT novel_id, tag FROM novel_tags WHERE novel_id IN (${placeholders}) ORDER BY tag ASC`)
      .all(...ids) as Array<{ novel_id: number; tag: string }>
    for (const row of rows) {
      const list = map.get(row.novel_id)
      if (list) list.push(row.tag)
      else map.set(row.novel_id, [row.tag])
    }
    return map
  }
}
