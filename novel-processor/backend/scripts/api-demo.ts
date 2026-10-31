#!/usr/bin/env node
/**
 * 可运行的 API 用法示例 / 冒烟测试。
 *
 * 与前端调用方式完全一致，唯一差别是它跑在 Node 里。
 *   npx tsx scripts/api-demo.ts n4703ix
 */
import { createNovelLibrary } from '../src/lib/index'

async function main(): Promise<void> {
  const input = process.argv[2] ?? 'n4703ix'

  // 1) 创建实例（浏览器里不需要任何 Node 依赖）
  const library = createNovelLibrary({ concurrency: 2, minIntervalMs: 400 })

  // 2) 站点能力自省
  console.log('支持站点：', library.sites.map((s) => `${s.name}(${s.id})`).join('、'))
  console.log('识别结果：', library.detectSite(input)?.name ?? '未识别')

  // 3) 解析引用
  const ref = library.resolve(input)
  console.log('作品引用：', `${ref.site}:${ref.novelId} → ${ref.canonicalUrl}`)

  // 4) 抓目录
  const catalog = await library.fetchCatalog(input, {
    onProgress: (p) => console.log('  [目录]', p.message),
  })
  console.log('目录：', catalog.meta.title, `| ${catalog.episodes.length} 话 / ${catalog.chapters.length} 章`)

  // 5) 单话正文
  const first = await library.fetchEpisode(input, 1)
  console.log('第 1 话：', first.title, `| ${first.body.length} 字`)

  // 6) 批量下载（区间 + 进度 + 断点续传）
  const result = await library.downloadEpisodes(input, {
    range: '1-3',
    onProgress: (p) => process.stdout.write(`\r  [正文] ${p.message}   `),
    onEpisode: (content) => {
      process.stdout.write(`\r  [正文] 已保存第 ${content.index} 话：${content.title}\n`)
    },
  })
  console.log(
    `\n下载结果：计划 ${result.total} / 新抓 ${result.fetched} / 跳过 ${result.skipped} / 失败 ${result.failed.length}`,
  )

  // 7) 本地状态
  const status = await library.getDownloadStatus(input, catalog)
  console.log('进度：', `${status.downloaded}/${status.total}`, status.complete ? '(完整)' : `缺 ${status.missing.length} 话`)

  const saved = await library.readEpisode(input, 2)
  console.log('读回第 2 话：', saved?.title ?? '(未下载)')

  const manifest = await library.getManifest(input)
  console.log('清单：', manifest ? `have=${manifest.have}, 上次新抓 ${manifest.lastRun.fetched}` : '无')
}

main().catch((err: unknown) => {
  console.error('✘', err instanceof Error ? `${err.name}: ${err.message}` : String(err))
  process.exit(1)
})
