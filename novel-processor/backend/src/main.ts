import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createNovelLibrary } from './lib/library'
import { FetchHttpClient } from './lib/http'
import { parseEpisodeRange } from './lib/range'
import type { NovelRecord, NovelRef } from './lib/types'
import { resolveTarget } from './lib/sites/registry'
import { FsEpisodeStore } from './storage/fs-store'
import { LibraryDb } from '../server/db'
import { createLibraryApiHandler } from '../server/libraryApi'
import { appConfig } from './config'

async function readCatalogFile(novelsDir: string, site: string, novelId: string): Promise<NovelRecord | null> {
  try {
    const raw = await readFile(join(novelsDir, site, `${novelId}.json`), 'utf8')
    return JSON.parse(raw) as NovelRecord
  } catch {
    return null
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin
  if (!origin || appConfig.corsOrigins.length === 0) return false
  if (appConfig.corsOrigins.includes('*') || appConfig.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', appConfig.corsOrigins.includes('*') ? '*' : origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }
  return false
}

async function main(): Promise<void> {
  await mkdir(appConfig.dataDir, { recursive: true })
  const store = new FsEpisodeStore(appConfig.episodesDir)
  const http = new FetchHttpClient({
    concurrency: appConfig.fetchConcurrency,
    minIntervalMs: appConfig.fetchIntervalMs,
    timeoutMs: appConfig.fetchTimeoutMs,
    maxRetries: appConfig.fetchMaxRetries,
  })
  const library = createNovelLibrary({
    store,
    http,
    concurrency: appConfig.fetchConcurrency,
    minIntervalMs: appConfig.fetchIntervalMs,
  })
  const db = new LibraryDb(appConfig.dbPath)

  const detectSite = (input: string): string | null => {
    try {
      return resolveTarget(input).adapter.id
    } catch {
      return null
    }
  }

  const syncFromDisk = async (): Promise<{ novels: number; episodes: number }> => {
    let novels = 0
    let episodes = 0
    let sites: string[] = []
    try {
      sites = await readdir(appConfig.novelsDir)
    } catch {
      return { novels, episodes }
    }

    for (const site of sites) {
      let files: string[] = []
      try {
        files = await readdir(join(appConfig.novelsDir, site))
      } catch {
        continue
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const novelId = file.slice(0, -5)
        const record = await readCatalogFile(appConfig.novelsDir, site, novelId)
        if (!record) continue
        const ref: NovelRef = {
          site,
          novelId: record.source.novelId,
          canonicalUrl: record.source.url,
          variant: null,
        }
        const rowId = db.upsertCatalog(record)
        const indices = await store.list(ref)
        db.setContentFlags(rowId, indices)
        novels += 1
        episodes += indices.length
      }
    }
    return { novels, episodes }
  }

  await syncFromDisk()

  const handler = createLibraryApiHandler({
    library,
    store,
    db,
    auditLogPath: appConfig.auditLogPath,
    novelsDir: appConfig.novelsDir,
    episodesDir: appConfig.episodesDir,
    parseRange: parseEpisodeRange,
    detectSite,
    syncFromDisk,
    defaultConcurrency: appConfig.fetchConcurrency,
  })

  const server = createServer(async (req, res) => {
    if (applyCors(req, res)) return

    if (req.url === '/healthz' || req.url === '/healthz/') {
      sendJson(res, 200, { ok: true, service: 'novel-processor-api' })
      return
    }

    if (req.url?.startsWith('/api/')) {
      const originalUrl = req.url
      req.url = originalUrl.slice('/api'.length) || '/'
      await handler(req, res, () => sendJson(res, 404, { error: '接口不存在' }))
      req.url = originalUrl
      return
    }

    sendJson(res, 404, { error: '接口不存在' })
  })

  const close = () => {
    server.close(() => db.close())
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)

  server.listen(appConfig.port, appConfig.host, () => {
    console.log(
      `[novel-processor-api] listening on http://${appConfig.host}:${appConfig.port} ` +
        `(data=${appConfig.dataDir}, db=${appConfig.dbPath})`,
    )
  })
}

void main().catch((error) => {
  console.error('[novel-processor-api] startup failed', error)
  process.exitCode = 1
})
