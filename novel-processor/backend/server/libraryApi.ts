/** 独立 Node HTTP 服务的书库 API，保持既有 JSON 契约。 */
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NovelLibrary } from '../src/lib/library'
import type { EpisodeStore } from '../src/lib/store'
import type { NovelRef, NovelRecord } from '../src/lib/types'
import { LibraryDb } from './db'
import type { NovelQuery, NovelSort, ProgressFilter } from './db'

export interface LibraryApiDeps {
  library: NovelLibrary
  store: EpisodeStore
  db: LibraryDb
  auditLogPath: string
  novelsDir: string
  episodesDir: string
  parseRange: (spec: string) => number[]
  /** 识别输入属于哪个站点；无法识别返回 null */
  detectSite: (input: string) => string | null
  /** 从磁盘重建索引 */
  syncFromDisk: () => Promise<{ novels: number; episodes: number }>
  defaultConcurrency: number
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * 删除类操作的审计日志。
 *
 * 回收站状态只存在 DB 里（磁盘上没有对应文件），一旦索引被外部清掉就无从追溯。
 * 这里按行追加 JSONL，便于事后确认「是谁、什么时候」改了状态。
 */
async function audit(auditLogPath: string, action: string, detail: Record<string, unknown>): Promise<void> {
  const line = `${JSON.stringify({ at: new Date().toISOString(), action, ...detail })}\n`
  try {
    await mkdir(dirname(auditLogPath), { recursive: true })
    await appendFile(auditLogPath, line, 'utf8')
  } catch {
    // 审计失败不影响主流程
  }
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function readCatalogFile(novelsDir: string, site: string, novelId: string): Promise<NovelRecord | null> {
  try {
    const raw = await readFile(join(novelsDir, site, `${novelId}.json`), 'utf8')
    return JSON.parse(raw) as NovelRecord
  } catch {
    return null
  }
}

export function createLibraryApiHandler(deps: LibraryApiDeps) {
  const { library, store, db, auditLogPath, novelsDir, episodesDir, parseRange, detectSite, syncFromDisk, defaultConcurrency } = deps

  /**
   * 下载任务的内存进度表。
   *
   * 为什么不靠 DB 统计：`has_content` 只有在每话落盘后才有值，
   * 而「本次任务计划多少话、已完成多少」是任务级信息，DB 里没有。
   * 进程重启会丢，但那时任务也中止了，正好一致。
   */
  interface DownloadJob {
    total: number
    done: number
    failed: number
    running: boolean
    startedAt: number
    finishedAt: number | null
  }
  const jobs = new Map<string, DownloadJob>()

  const readCatalog = (site: string, novelId: string) => readCatalogFile(novelsDir, site, novelId)

  return async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const segments = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    try {
      if (segments.length === 1 && segments[0] === 'sites' && method === 'GET') {
        sendJson(res, 200, library.sites)
        return
      }

      if (segments.length === 1 && segments[0] === 'stats' && method === 'GET') {
        sendJson(res, 200, db.stats())
        return
      }

      // GET /api/facets —— 分类统计（状态 / 站点 / 题材 / 标签）
      if (segments.length === 1 && segments[0] === 'facets' && method === 'GET') {
        sendJson(res, 200, db.facets())
        return
      }

      // GET /api/library?q=&site=&status=&genre=&tag=&progress=&sort=&page=&limit=&trashed=1
      if (segments.length === 1 && segments[0] === 'library' && method === 'GET') {
        const read = (key: string): string | undefined => url.searchParams.get(key)?.trim() || undefined
        const page = Math.max(1, Number(read('page') ?? 1) || 1)
        const limit = Math.min(Math.max(Number(read('limit') ?? 60) || 60, 1), 200)

        const query: NovelQuery = {
          q: read('q'),
          site: read('site'),
          status: read('status'),
          genre: read('genre'),
          tag: read('tag'),
          progress: (read('progress') as ProgressFilter | undefined) ?? undefined,
          sort: (read('sort') as NovelSort | undefined) ?? undefined,
          trashed: read('trashed') === '1',
          limit,
          offset: (page - 1) * limit,
        }

        const result = db.listNovels(query)
        sendJson(res, 200, { ...result, page, limit })
        return
      }

      // POST /api/trash/empty —— 清空回收站（永久删除所有回收站作品及其文件）
      if (segments.length === 2 && segments[0] === 'trash' && segments[1] === 'empty' && method === 'POST') {
        const removed = db.purgeAllTrashed()
        for (const item of removed) {
          await rm(join(novelsDir, item.site, `${item.novelId}.json`), { force: true })
          await rm(join(episodesDir, item.site, item.novelId), { recursive: true, force: true })
        }
        await audit(auditLogPath, 'empty-trash', { removed: removed.map((item) => `${item.site}/${item.novelId}`) })
        sendJson(res, 200, { removed: removed.length, stats: db.stats() })
        return
      }

      // POST /api/sync —— 从磁盘重建索引
      if (segments.length === 1 && segments[0] === 'sync' && method === 'POST') {
        const result = await syncFromDisk()
        sendJson(res, 200, { ...result, stats: db.stats() })
        return
      }

      // POST /api/import  { input, site? }
      if (segments.length === 1 && segments[0] === 'import' && method === 'POST') {
        const body = await readBody(req)
        const input = String(body.input ?? '').trim()
        const site = String(body.site ?? '').trim()
        if (!input) {
          sendJson(res, 400, { error: '缺少 input 参数' })
          return
        }

        const detected = detectSite(input)
        if (!detected) {
          sendJson(res, 400, { error: '无法识别该地址所属站点' })
          return
        }
        if (site && site !== detected) {
          sendJson(res, 400, { error: `该地址属于「${detected}」，与所选数据来源「${site}」不一致` })
          return
        }

        const record = await library.fetchCatalog(input)
        const target = join(novelsDir, record.source.site, `${record.source.novelId}.json`)
        await mkdir(join(novelsDir, record.source.site), { recursive: true })
        await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        db.upsertCatalog(record)
        sendJson(res, 200, record)
        return
      }

      if (segments[0] === 'library' && segments.length >= 3) {
        const site = segments[1]
        const novelId = segments[2]
        const ref: NovelRef = { site, novelId, canonicalUrl: '', variant: null }

        if (segments.length === 3 && method === 'GET') {
          const record = await readCatalog(site, novelId)
          if (!record) {
            // 索引里有记录但文件不在：明确告诉前端「可以重新抓」，而不是笼统的 404
            const known = db.hasNovel(site, novelId)
            sendJson(
              res,
              known ? 409 : 404,
              { error: known ? '目录文件缺失，请重新抓取目录' : '作品不存在' },
            )
            return
          }
          sendJson(res, 200, record)
          return
        }

        // DELETE /api/library/:site/:id            → 一级删除：移入回收站
        // DELETE /api/library/:site/:id?permanent=1 → 二级删除：连文件一起永久删除
        if (segments.length === 3 && method === 'DELETE') {
          const permanent = url.searchParams.get('permanent') === '1'

          if (!permanent) {
            if (!db.trashNovel(site, novelId)) {
              sendJson(res, 404, { error: '作品不存在或已在回收站' })
              return
            }
            await audit(auditLogPath, 'trash', { site, novelId })
            sendJson(res, 200, { ok: true, mode: 'trash' })
            return
          }

          if (!db.hasNovel(site, novelId)) {
            sendJson(res, 404, { error: '作品不存在' })
            return
          }
          await rm(join(novelsDir, site, `${novelId}.json`), { force: true })
          await rm(join(episodesDir, site, novelId), { recursive: true, force: true })
          db.purgeNovel(site, novelId)
          await audit(auditLogPath, 'purge', { site, novelId })
          sendJson(res, 200, { ok: true, mode: 'purge' })
          return
        }

        // POST /api/library/:site/:id/restore —— 从回收站恢复
        if (segments[3] === 'restore' && method === 'POST') {
          if (!db.restoreNovel(site, novelId)) {
            sendJson(res, 404, { error: '作品不在回收站中' })
            return
          }
          await audit(auditLogPath, 'restore', { site, novelId })
          sendJson(res, 200, { ok: true })
          return
        }

        // POST /api/library/:site/:id/refresh —— 重新抓取目录（更新元数据与话列表）
        if (segments[3] === 'refresh' && method === 'POST') {
          const current = await readCatalog(site, novelId)
          // 目录 JSON 丢失时回退到索引里记录的原始地址，避免「文件没了就彻底救不回来」
          const sourceUrl = current?.source.url ?? db.getSourceUrl(site, novelId)
          if (!sourceUrl) {
            sendJson(res, 404, { error: '作品不存在' })
            return
          }
          const record = await library.fetchCatalog(sourceUrl)
          await mkdir(join(novelsDir, site), { recursive: true })
          await writeFile(
            join(novelsDir, site, `${novelId}.json`),
            `${JSON.stringify(record, null, 2)}\n`,
            'utf8',
          )
          const rowId = db.upsertCatalog(record)
          db.setContentFlags(rowId, await store.list(ref))
          sendJson(res, 200, record)
          return
        }

        // GET /api/library/:site/:id/status
        if (segments[3] === 'status' && method === 'GET') {
          const record = await readCatalog(site, novelId)
          const downloaded = db.contentFlags(site, novelId)
          sendJson(res, 200, {
            downloaded: downloaded.length,
            total: record?.episodes.length ?? 0,
            indices: downloaded,
            job: jobs.get(`${site}/${novelId}`) ?? null,
          })
          return
        }

        // GET /api/library/:site/:id/episodes/:index
        if (segments[3] === 'episodes' && segments.length === 5 && method === 'GET') {
          const content = await store.read(ref, Number(segments[4]))
          if (!content) {
            sendJson(res, 404, { error: '该话尚未下载' })
            return
          }
          sendJson(res, 200, content)
          return
        }

        // POST /api/library/:site/:id/fetch  { range?, all?, overwrite?, concurrency? }
        if (segments[3] === 'fetch' && method === 'POST') {
          const body = await readBody(req)
          const record = await readCatalog(site, novelId)
          if (!record) {
            sendJson(res, 404, { error: '作品不存在，请先导入' })
            return
          }
          if (db.isTrashed(site, novelId)) {
            sendJson(res, 409, { error: '作品在回收站中，请先恢复后再下载' })
            return
          }

          const range = typeof body.range === 'string' && body.range.trim() ? body.range : undefined
          const all = body.all === true
          const overwrite = body.overwrite === true
          const concurrency = Number(body.concurrency ?? defaultConcurrency)

          let indices: number[] | undefined
          if (range) {
            try {
              indices = parseRange(range)
            } catch (err) {
              sendJson(res, 400, { error: err instanceof Error ? err.message : '区间格式错误' })
              return
            }
          } else if (!all) {
            // 默认：只补缺失的话（用索引查，不扫文件）
            const have = new Set(db.contentFlags(site, novelId))
            indices = record.episodes.map((episode) => episode.index).filter((i) => !have.has(i))
          }

          const jobKey = `${site}/${novelId}`
          const existing = jobs.get(jobKey)
          if (existing?.running) {
            sendJson(res, 409, { error: '该作品已有下载任务在进行中' })
            return
          }

          jobs.set(jobKey, {
            total: indices?.length ?? record.episodes.length,
            done: 0,
            failed: 0,
            running: true,
            startedAt: Date.now(),
            finishedAt: null,
          })

          const result = await library.downloadEpisodes(record.source.url, {
            indices,
            overwrite,
            concurrency,
            // 每抓完一话立刻写索引：否则 /status 在整批结束前都返回旧值，
            // 前端轮询拿不到任何变化，进度条等于不动。
            onEpisode: (content) => {
              const job = jobs.get(jobKey)
              if (job) job.done += 1
              const rowId = db.findId(site, novelId)
              if (rowId !== null) db.markContent(site, novelId, [content.index])
            },
          })

          // 用磁盘真实状态回写索引，修正增量标记的偏差（例如中断、手动删文件）
          const novelRowId = db.findId(site, novelId)
          if (novelRowId !== null) db.setContentFlags(novelRowId, await store.list(ref))

          const job = jobs.get(jobKey)
          if (job) {
            job.running = false
            job.failed = result.failed.length
            job.finishedAt = Date.now()
          }

          sendJson(res, 200, {
            total: result.total,
            fetched: result.fetched,
            skipped: result.skipped,
            failed: result.failed,
            durationMs: result.durationMs,
            manifest: result.manifest,
          })
          return
        }
      }

      next()
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }
}

