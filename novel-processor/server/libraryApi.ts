/**
 * 本地数据 API（Vite 插件）。
 *
 * 为什么放在 dev server 里而不是独立服务：
 * 前端要读的是磁盘上的 `data/`，浏览器没有文件系统权限；
 * 挂一个中间件就能直接复用 `NovelLibrary` + `FsEpisodeStore`，
 * 不需要额外进程，也不需要把抓取逻辑复制一份到服务端。
 *
 * 所有业务逻辑都在 `src/lib` 里，这里只做「路由 + 序列化」。
 *
 * 注：对 `src/lib` 的依赖使用**动态 import**，
 * 这样 Vite 的配置文件加载器不会去解析这些源码模块
 * （否则会触发 "config uses features unsupported by configLoader: native" 警告）。
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { NovelLibrary } from '../src/lib/library'
import type { EpisodeStore } from '../src/lib/store'
import type { NovelRef, NovelRecord } from '../src/lib/types'

interface LibraryEntry {
  site: string
  novelId: string
  title: string
  author: string
  status: string
  statusLabel: string | null
  episodeCount: number
  chapterCount: number
  wordCount: number | null
  downloaded: number
  lastEpisodeAt: string | null
  completedAt: string | null
  tags: string[]
}

interface Deps {
  library: NovelLibrary
  store: EpisodeStore
  novelsDir: string
  episodesDir: string
  parseRange: (spec: string) => number[]
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
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

function createHandler(deps: Deps) {
  const { library, store, novelsDir, episodesDir, parseRange } = deps

  async function readCatalog(site: string, novelId: string): Promise<NovelRecord | null> {
    try {
      const raw = await readFile(join(novelsDir, site, `${novelId}.json`), 'utf8')
      return JSON.parse(raw) as NovelRecord
    } catch {
      return null
    }
  }

  async function listLibrary(): Promise<LibraryEntry[]> {
    let sites: string[] = []
    try {
      sites = await readdir(novelsDir)
    } catch {
      return []
    }

    const entries: LibraryEntry[] = []
    for (const site of sites) {
      let files: string[] = []
      try {
        files = await readdir(join(novelsDir, site))
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const record = await readCatalog(site, file.slice(0, -5))
        if (!record) continue
        const ref: NovelRef = {
          site,
          novelId: record.source.novelId,
          canonicalUrl: record.source.url,
          variant: null,
        }
        const downloaded = await store.list(ref)
        entries.push({
          site,
          novelId: record.source.novelId,
          title: record.meta.title,
          author: record.meta.author.name,
          status: record.meta.status,
          statusLabel: record.meta.statusLabel,
          episodeCount: record.meta.episodeCount ?? record.episodes.length,
          chapterCount: record.meta.chapterCount ?? record.chapters.length,
          wordCount: record.meta.wordCount,
          downloaded: downloaded.length,
          lastEpisodeAt: record.meta.lastEpisodeAt,
          completedAt: record.meta.completedAt,
          tags: record.meta.tags.slice(0, 6),
        })
      }
    }
    return entries.sort((a, b) => (b.lastEpisodeAt ?? '').localeCompare(a.lastEpisodeAt ?? ''))
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const segments = url.pathname.split('/').filter(Boolean)
    const method = req.method ?? 'GET'

    try {
      if (segments.length === 1 && segments[0] === 'sites' && method === 'GET') {
        sendJson(res, 200, library.sites)
        return
      }

      if (segments.length === 1 && segments[0] === 'library' && method === 'GET') {
        sendJson(res, 200, await listLibrary())
        return
      }

      // POST /api/import  { input }
      if (segments.length === 1 && segments[0] === 'import' && method === 'POST') {
        const body = await readBody(req)
        const input = String(body.input ?? '').trim()
        if (!input) {
          sendJson(res, 400, { error: '缺少 input 参数' })
          return
        }
        const record = await library.fetchCatalog(input)
        const target = join(novelsDir, record.source.site, `${record.source.novelId}.json`)
        await mkdir(join(novelsDir, record.source.site), { recursive: true })
        await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
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
            sendJson(res, 404, { error: '作品不存在' })
            return
          }
          sendJson(res, 200, record)
          return
        }

        if (segments.length === 3 && method === 'DELETE') {
          await rm(join(novelsDir, site, `${novelId}.json`), { force: true })
          await rm(join(episodesDir, site, novelId), { recursive: true, force: true })
          sendJson(res, 200, { ok: true })
          return
        }

        // GET /api/library/:site/:id/status
        if (segments[3] === 'status' && method === 'GET') {
          const record = await readCatalog(site, novelId)
          const downloaded = await store.list(ref)
          sendJson(res, 200, {
            downloaded: downloaded.length,
            total: record?.episodes.length ?? 0,
            indices: downloaded,
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

          const range = typeof body.range === 'string' && body.range.trim() ? body.range : undefined
          const all = body.all === true
          const overwrite = body.overwrite === true
          const concurrency = Number(body.concurrency ?? 4)

          let indices: number[] | undefined
          if (range) {
            try {
              indices = parseRange(range)
            } catch (err) {
              sendJson(res, 400, { error: err instanceof Error ? err.message : '区间格式错误' })
              return
            }
          } else if (!all) {
            // 默认：只补缺失的话
            const have = new Set(await store.list(ref))
            indices = record.episodes.map((episode) => episode.index).filter((i) => !have.has(i))
          }

          const result = await library.downloadEpisodes(record.source.url, {
            indices,
            overwrite,
            concurrency,
          })
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

export function libraryApiPlugin(projectRoot: string): Plugin {
  const dataDir = resolve(projectRoot, 'data')
  const novelsDir = join(dataDir, 'novels')
  const episodesDir = join(dataDir, 'episodes')

  return {
    name: 'novel-library-api',
    async configureServer(server) {
      const [{ createNovelLibrary }, { parseEpisodeRange }, { FsEpisodeStore }] = await Promise.all([
        import('../src/lib/library'),
        import('../src/lib/range'),
        import('../scripts/fs-store'),
      ])

      const store = new FsEpisodeStore(episodesDir)
      const library = createNovelLibrary({ store, concurrency: 4 })
      const handler = createHandler({ library, store, novelsDir, episodesDir, parseRange: parseEpisodeRange })

      server.middlewares.use('/api', (req, res, next) => {
        void handler(req, res, next)
      })
    },
  }
}
