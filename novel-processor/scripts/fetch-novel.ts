#!/usr/bin/env node
/**
 * 命令行入口。
 *
 * 目录模式（默认）：抓取作品目录，输出元数据 + 章 + 话。
 * 正文模式：抓取一话或全部话的正文。
 *
 * 用法：
 *   npm run fetch -- n4703ix
 *   npm run fetch -- n4703ix --episode 1
 *   npm run fetch -- n4703ix --all
 *   npm run fetch -- n4703ix --range 1-20
 *   npm run fetch -- n4703ix --range 1-5,10,20-25
 */
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NovelFetcher } from '../src/lib/pipeline'
import { FetchHttpClient } from '../src/lib/http'
import { describeError, isNovelError } from '../src/lib/errors'
import type { NovelRecord } from '../src/lib/types'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface CliOptions {
  input: string
  out: string | null
  enrich: boolean
  /** 要抓的话序号；null 表示只抓目录 */
  indices: number[] | null
  /** 抓取全部正文 */
  all: boolean
  overwrite: boolean
  maxPages: number
  /** 并发请求数 */
  concurrency: number
  /** 相邻请求最小间隔；null 表示按并发数自动推导 */
  intervalMs: number | null
  quiet: boolean
}

/** 默认节奏：串行时 800ms；并发时按倍数收紧，但不低于 150ms（约 6.7 req/s 上限）。 */
const DEFAULT_INTERVAL_MS = 800
const MIN_INTERVAL_MS = 150

function resolveInterval(concurrency: number, explicit: number | null): number {
  if (explicit !== null) return Math.max(0, explicit)
  if (concurrency <= 1) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.round(DEFAULT_INTERVAL_MS / concurrency))
}

function parsePositiveInt(raw: string | undefined, flag: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} 需要正整数，收到：${raw ?? '(空)'}`)
  return value
}

function parseNonNegativeInt(raw: string | undefined, flag: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} 需要非负整数，收到：${raw ?? '(空)'}`)
  return value
}

/** 解析 `1-20` / `1,3,5` / `1-3,7` 形式的序号表达式。 */
function parseIndexSpec(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',')) {
    const token = part.trim()
    if (!token) continue
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(token)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from <= 0 || to < from) throw new Error(`非法的序号区间：${token}`)
      for (let i = from; i <= to; i++) out.add(i)
      continue
    }
    const single = Number(token)
    if (!Number.isInteger(single) || single <= 0) throw new Error(`非法的序号：${token}`)
    out.add(single)
  }
  if (out.size === 0) throw new Error('未指定任何话序号')
  return [...out].sort((a, b) => a - b)
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    input: '',
    out: null,
    enrich: true,
    indices: null,
    all: false,
    overwrite: false,
    maxPages: 50,
    concurrency: 1,
    intervalMs: null,
    quiet: false,
  }

  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' || arg === '-o') opts.out = argv[++i] ?? null
    else if (arg === '--no-enrich') opts.enrich = false
    else if (arg === '--episode' || arg === '-e') opts.indices = parseIndexSpec(String(argv[++i] ?? ''))
    else if (arg === '--range' || arg === '-r') opts.indices = parseIndexSpec(String(argv[++i] ?? ''))
    else if (arg === '--all' || arg === '-a') opts.all = true
    else if (arg === '--overwrite') opts.overwrite = true
    else if (arg === '--concurrency' || arg === '-c') opts.concurrency = parsePositiveInt(argv[++i], '--concurrency')
    else if (arg === '--interval') opts.intervalMs = parseNonNegativeInt(argv[++i], '--interval')
    else if (arg === '--max-pages') opts.maxPages = parsePositiveInt(argv[++i], '--max-pages')
    else if (arg === '--quiet' || arg === '-q') opts.quiet = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`)
    } else positional.push(arg)
  }

  opts.input = positional[0] ?? ''
  if (!opts.input) {
    printHelp()
    process.exit(1)
  }
  return opts
}

function printHelp(): void {
  console.log(`用法: npm run fetch -- <作品ID或URL> [选项]

目录模式（默认）:
  抓取作品元数据 + 章 + 话列表，输出 data/novels/<site>/<id>.json

正文模式:
  -e, --episode <spec>  抓指定话，如 3 或 1-5 或 1,3,7-9
  -r, --range <spec>    同 --episode
  -a, --all             抓全部话（先自动抓目录确定总话数）
      --overwrite       已存在的正文文件也重新抓（默认跳过 = 断点续传）

并发控制:
  -c, --concurrency <n> 同时抓取的请求数（默认 1 = 串行）
      --interval <ms>   相邻请求最小间隔（默认 800；并发>1 时自动收紧为 800/n，下限 150）

通用选项:
  -o, --out <path>      自定义输出路径（目录模式为文件，正文模式为目录）
      --no-enrich       不调用站点 API 补全元数据
      --max-pages <n>   目录页抓取上限（默认 50）
  -q, --quiet           不打印进度
  -h, --help            显示帮助

示例:
  npm run fetch -- n4703ix --all -c 4          # 4 并发，间隔自动 200ms
  npm run fetch -- n4703ix --all -c 4 --interval 500   # 4 并发但保持 500ms 节奏（更保守）`)
}

function formatNumber(n: number | null): string {
  return n === null ? '-' : n.toLocaleString('en-US')
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function printSummary(record: NovelRecord, outPath: string, rateNote: string): void {
  const { meta, source, fetch } = record
  const status = meta.statusLabel ?? meta.status
  const lines = [
    '',
    `✔ ${meta.title}`,
    `  站点      ${source.siteName} (${source.site}) / ${source.novelId}`,
    `  作者      ${meta.author.name || '-'}${meta.author.url ? `  ${meta.author.url}` : ''}`,
    `  状态      ${status}   ${formatNumber(meta.episodeCount)} 话 / ${formatNumber(meta.chapterCount)} 章 / ${formatNumber(meta.wordCount)} 字`,
    `  首发      ${meta.firstPublishedAt ?? '-'}`,
    `  最终话    ${meta.lastEpisodeAt ?? '-'}`,
    `  完结日    ${meta.completedAt ?? '-'}`,
    `  标签      ${meta.tags.length > 0 ? meta.tags.join(' / ') : '-'}`,
    `  目录页    ${fetch.pagesFetched} 页，耗时 ${(fetch.durationMs / 1000).toFixed(1)}s`,
    `  并发      ${rateNote}`,
    `  输出      ${outPath}`,
  ]
  if (fetch.warnings.length > 0) {
    lines.push(`  告警      ${fetch.warnings.length} 条`)
    for (const warning of fetch.warnings) lines.push(`            · ${warning}`)
  }
  console.log(lines.join('\n'))
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const isEpisodeMode = opts.all || opts.indices !== null

  const concurrency = Math.max(1, opts.concurrency)
  const intervalMs = resolveInterval(concurrency, opts.intervalMs)
  const rateNote = `并发 ${concurrency} / 间隔 ${intervalMs}ms`

  const http = new FetchHttpClient({
    minIntervalMs: intervalMs,
    concurrency,
    onRequest: opts.quiet || isEpisodeMode
      ? undefined
      : (url, attempt) => {
          console.error(`  → ${attempt > 0 ? `(重试 ${attempt}) ` : ''}${url}`)
        },
  })
  const fetcher = new NovelFetcher({ http })
  const { adapter, ref } = fetcher.resolve(opts.input)

  // ---------- 正文模式 ----------
  if (isEpisodeMode) {
    const outDir = resolve(ROOT, opts.out ?? `data/episodes/${adapter.id}/${ref.novelId}`)
    await mkdir(outDir, { recursive: true })
    const fileOf = (index: number) => join(outDir, `${index}.json`)

    const result = await fetcher.fetchEpisodes(opts.input, {
      http,
      enrich: opts.enrich,
      maxPages: opts.maxPages,
      concurrency,
      indices: opts.indices ?? undefined,
      shouldSkip: (index) => (opts.overwrite ? false : fileExists(fileOf(index))),
      onEpisode: async (content) => {
        const { ref: _ref, ...rest } = content
        await writeFile(fileOf(content.index), `${JSON.stringify(rest, null, 2)}\n`, 'utf8')
      },
      onProgress: opts.quiet
        ? undefined
        : (p) => {
            if (p.phase !== 'episode') {
              process.stderr.write(`\r  · ${p.message} …`)
              return
            }
            process.stderr.write(`\r  · 正文 ${Math.min(p.page, p.totalPages)}/${p.totalPages} …`)
          },
    })

    if (!opts.quiet) process.stderr.write('\n')

    // 清单：目录内现有正文数 + 本次运行结果（便于核对缺口与重试）
    const present = (await readdir(outDir)).filter((name) => /^\d+\.json$/.test(name))
    const manifest = {
      site: adapter.id,
      novelId: ref.novelId,
      updatedAt: new Date().toISOString(),
      /** 目录内已落盘的正文文件数 */
      have: present.length,
      lastRun: {
        total: result.total,
        fetched: result.fetched,
        skipped: result.skipped,
        failed: result.failed,
        durationMs: result.durationMs,
        concurrency,
        intervalMs,
      },
    }
    await writeFile(join(outDir, '_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    console.log(
      [
        '',
        `✔ 正文抓取完成  ${adapter.name} / ${ref.novelId}`,
        `  计划      ${result.total} 话`,
        `  新抓      ${result.fetched} 话`,
        `  跳过      ${result.skipped} 话（已存在；--overwrite 可强制重抓）`,
        `  失败      ${result.failed.length} 话`,
        `  已有      ${present.length} 话`,
        `  耗时      ${(result.durationMs / 1000).toFixed(1)}s`,
        `  并发      ${rateNote}`,
        `  输出      ${outDir}`,
      ].join('\n'),
    )
    if (result.failed.length > 0) {
      for (const item of result.failed.slice(0, 10)) console.log(`            · 第 ${item.index} 话：${item.error}`)
      if (result.failed.length > 10) console.log(`            · …另有 ${result.failed.length - 10} 条失败`)
      process.exitCode = 2
    }
    return
  }

  // ---------- 目录模式 ----------
  const record = await fetcher.fetchNovel(opts.input, {
    http,
    enrich: opts.enrich,
    maxPages: opts.maxPages,
    concurrency,
    onProgress: opts.quiet ? undefined : (p) => console.error(`  · ${p.message}`),
  })

  const outPath = resolve(ROOT, opts.out ?? `data/novels/${adapter.id}/${ref.novelId}.json`)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  printSummary(record, outPath, rateNote)
}

main().catch((err: unknown) => {
  if (isNovelError(err)) {
    console.error(`✘ [${err.code}] ${err.message}`)
    if (Object.keys(err.detail).length > 0) console.error(`  ${JSON.stringify(err.detail)}`)
  } else {
    console.error(`✘ ${describeError(err)}`)
  }
  process.exit(1)
})
