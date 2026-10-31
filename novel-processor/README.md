# novel-processor

个人小说库处理工具。把多个小说站点的作品归一化成统一 JSON，供前端整理、检索、导出。

当前支持：**小説家になろう（syosetu）**

- 前端 API 参考：[`docs/api.md`](docs/api.md)
- 架构设计：[`docs/architecture.md`](docs/architecture.md)

## 界面

| 路由 | 页面 | 内容 |
| --- | --- | --- |
| `/` | 书架 | 搜索、状态 / 进度 / 题材 / 标签分类筛选、排序、卡片网格 |
| `/novel/:site/:id` | 作品 | 元数据、章节目录、区间下载与并发控制、更新目录、删除 |
| `/novel/:site/:id/episodes/:n` | 阅读 | 整页正文、上一话 / 下一话、键盘 ←/→ |
| `/trash` | 回收站 | 恢复 / 永久删除 / 清空 |

删除分两级：**删除 = 移入回收站**（不动文件，可恢复）；**永久删除**（在回收站内二次确认）才会移除磁盘文件。

```bash
npm run dev   # 打开 http://localhost:5173
```

## 前端用法（不经过界面，直接调方法）

所有能力都是 `NovelLibrary` 的方法，浏览器可直接调用（无需 Node）：

```ts
import { createNovelLibrary } from '@/lib'

const library = createNovelLibrary({ concurrency: 4 })

const catalog = await library.fetchCatalog('https://ncode.syosetu.com/n4703ix/')
const result = await library.downloadEpisodes('n4703ix', {
  range: '1-20',
  onProgress: (p) => console.log(`${p.page}/${p.totalPages}`),
})
```

| 方法 | 说明 |
| --- | --- |
| `sites` / `detectSite(input)` | 站点能力自省 |
| `resolve(input)` | 输入 → 规范引用 |
| `fetchCatalog(input, opts?)` | 抓目录（元数据 + 章 + 话） |
| `fetchEpisode(input, index, opts?)` | 抓单话正文 |
| `downloadEpisodes(input, opts?)` | 批量下载（自动续传） |
| `listDownloaded` / `readEpisode` / `getManifest` | 本地库读取 |
| `getDownloadStatus(input, catalog)` | 下载进度 |

浏览器直连站点会被 CORS 拦下，开发期用已配好的 Vite 代理 + `rewriteUrl`，
详见 [`docs/api.md`](docs/api.md) 第 4 节。

## 调试用 CLI

CLI 只是这些方法的一层壳，用于本地验证与批量灌数据，删除它不影响库。

```bash
npm install

npm run fetch -- n4703ix                 # 抓目录
npm run fetch -- n4703ix --all -c 4      # 抓全部正文（4 并发）
npm run fetch -- n4703ix --range 1-20    # 抓指定区间
```

输出：

```
data/novels/<site>/<id>.json             # 目录：元数据 + 章 + 话（真源）
data/episodes/<site>/<id>/<n>.json       # 单话正文（真源）
data/episodes/<site>/<id>/_manifest.json # 下载清单
data/library.db                          # SQLite 索引（可随时重建）
```

## 数据存储

| 层 | 内容 | 说明 |
| --- | --- | --- |
| JSON 文件 | 目录、单话正文 | **真源**。可读、可备份、单文件损坏只影响一话 |
| SQLite | 作品 / 章 / 话 / 是否有正文 | **索引**。列表、搜索、筛选、统计走 DB，不扫文件 |

两者是「索引 ↔ 真源」关系：DB 可从磁盘完整重建（`POST /api/sync`），
启动时也会自动对齐一次，所以删掉 `library.db` 不会丢任何数据。

CLI 参数：`-e/--episode`、`-r/--range`、`-a/--all`、`-c/--concurrency`、`--interval`、
`--overwrite`、`-o/--out`、`--no-enrich`、`--max-pages`、`-q/--quiet`。

## 并发

并发数与请求节奏是独立约束：只提并发不放宽间隔，吞吐不会提升。
实测 20 话：`c=1` 28.4s → `c=4` 6.6s → `c=8` 5.7s，**建议 4**。

```ts
createNovelLibrary({ concurrency: 4, minIntervalMs: 200 })
```

## 开发

```bash
npm run dev        # 前端（Vue 3 + Vite）
npm run typecheck  # 类型检查
npm run build      # 构建
npx tsx scripts/api-demo.ts n4703ix   # 可运行的 API 示例 / 冒烟测试
```

采集内核在 `src/lib/`，与 Vue 无关；新增站点见架构文档第 9 节。

> 采集仅供个人阅读整理使用，请遵守各站点使用条款。
