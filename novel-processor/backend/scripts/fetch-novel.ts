#!/usr/bin/env node
/**
 * 调试用命令行壳。
 *
 * 这里**不含任何业务逻辑**——所有能力都在 `NovelLibrary` 的方法里，
 * 本文件只做「参数解析 → 调用方法 → 打印结果」。
 * 前端用的是同一批方法，删掉本文件不影响库。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNovelLibrary, resolveTarget } from '../src/lib/index'
import { describeError, isNovelError } from '../src/lib/errors'
import { formatEpisodeRange, parseEpisodeRange } from '../src/lib/range'
import type { NovelRecord } from '../src/lib/types'
import { FsEpisodeStore } from '../src/storage/fs-store'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULT_INTERVAL_MS = 800
const MIN_INTERVAL_MS = 150

interface CliOptions {
  input: string
  out: string | null
  enrich: boolean
  indices: number[] | null
  all: boolean
  overwrite: boolean
  maxPages: number
  concurrency: number
  intervalMs: number | null
  quiet: boolean
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
    else if (arg === '--episode' || arg === '-e') opts.indices = parseEpisodeRange(String(argv[++i] ?? ''))
    else if (arg === '--range' || arg === '-r') opts.indices = parseEpisodeRange(String(argv[++i] ?? ''))
    else if (arg === '--all' || arg === '-a') opts.all = true
    else if (arg === '--overwrite') opts.overwrite = true
    else if (arg === '--concurrency' || arg === '-c') opts.concurrency = parsePositiveInt(argv[++i], '--concurrency')
    else if (arg === '--interval') opts.intervalMs = parseNonNegativeInt(argv[++i], '--interval')
    else if (arg === '--max-pages') opts.maxPages = parsePositiveInt(argv[++i], '--max-pages')
    else if (arg === '--quiet' || arg === '-q') opts.quiet = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('-')) throw new Error(`未知参数：${arg}`)
    else positional.push(arg)
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
  抓取作品元数据 + 章 + 话列表 → data/novels/<site>/<id>.json

正文模式:
  -e, --episode <spec>  抓指定话，如 3 或 1-5 或 1,3,7-9
  -r, --range <spec>    同 --episode
  -a, --all             抓全部话
      --overwrite       已存在的也重抓（默认跳过）

并发控制:
  -c, --concurrency <n> 并发请求数（默认 1）
      --interval <ms>   请求间隔（默认 800；并发>1 时自动 800/n，下限 150）

通用:
  -o, --out <path>      自定义输出（目录模式=文件，正文模式=目录）
      --no-enrich       跳过官方 API 富化
      --max-pages <n>   目录页上限（默认 50）
  -q, --quiet           不打印进度`)
}

function resolveInterval(concurrency: number, explicit: number | null): number {
  if (explicit !== null) return Math.max(0, explicit)
  if (concurrency <= 1) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.round(DEFAULT_INTERVAL_MS / concurrency))
}

function formatNumber(n: number | null): string {
  return n === null ? '-' : n.toLocaleString('en-US')
}

function printCatalog(record: NovelRecord, outPath: string, rateNote: string): void {
  const { meta, source, fetch } = record
  const lines = [
    '',
    `✔ ${meta.title}`,
    `  站点      ${source.siteName} (${source.site}) / ${source.novelId}`,
    `  作者      ${meta.author.name || '-'}`,
    `  状态      ${meta.statusLabel ?? meta.status}   ${formatNumber(meta.episodeCount)} 话 / ${formatNumber(meta.chapterCount)} 章 / ${formatNumber(meta.wordCount)} 字`,
    `  首发      ${meta.firstPublishedAt ?? '-'}`,
    `  最终话    ${meta.lastEpisodeAt ?? '-'}`,
    `  完结日    ${meta.completedAt ?? '-'}`,
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

  const { adapter, ref } = resolveTarget(opts.input)
  const episodeRoot = isEpisodeMode && opts.out ? resolve(ROOT, opts.out) : resolve(ROOT, 'data/episodes')

  const library = createNovelLibrary({
    concurrency,
    minIntervalMs: intervalMs,
    store: new FsEpisodeStore(episodeRoot),
  })

  // ---------- 正文模式 ----------
  if (isEpisodeMode) {
    const result = await library.downloadEpisodes(opts.input, {
      indices: opts.indices ?? undefined,
      overwrite: opts.overwrite,
      enrich: opts.enrich,
      maxPages: opts.maxPages,
      concurrency,
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

    const dir = resolve(episodeRoot, adapter.id, ref.novelId)
    console.log(
      [
        '',
        `✔ 正文下载完成  ${adapter.name} / ${ref.novelId}`,
        `  计划      ${result.total} 话`,
        `  新抓      ${result.fetched} 话`,
        `  跳过      ${result.skipped} 话`,
        `  失败      ${result.failed.length} 话`,
        `  已有      ${result.manifest.have} 话`,
        `  耗时      ${(result.durationMs / 1000).toFixed(1)}s`,
        `  并发      ${rateNote}`,
        `  输出      ${dir}`,
      ].join('\n'),
    )
    if (result.failed.length > 0) {
      for (const item of result.failed.slice(0, 10)) console.log(`            · 第 ${item.index} 话：${item.error}`)
      process.exitCode = 2
    }
    return
  }

  // ---------- 目录模式 ----------
  const record = await library.fetchCatalog(opts.input, {
    enrich: opts.enrich,
    maxPages: opts.maxPages,
    concurrency,
    onProgress: opts.quiet ? undefined : (p) => console.error(`  · ${p.message}`),
  })

  const outPath = resolve(ROOT, opts.out ?? `data/novels/${adapter.id}/${ref.novelId}.json`)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')

  const status = await library.getDownloadStatus(opts.input, record)
  printCatalog(record, outPath, rateNote)
  console.log(
    status.complete
      ? '  正文      已全部下载'
      : `  正文      ${status.downloaded}/${status.total} 话，缺 ${status.missing.length} 话（${formatEpisodeRange(status.missing.slice(0, 20))}${status.missing.length > 20 ? ' …' : ''}）`,
  )
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
