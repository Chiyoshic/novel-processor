# API 参考

前端只需要一个入口：`NovelLibrary`。所有能力都是它的方法，不含 CLI 依赖。

```ts
import { createNovelLibrary } from '@/lib'

const library = createNovelLibrary({ concurrency: 4 })
```

---

## 1. 方法一览

| 方法 | 说明 | 是否落盘 |
| --- | --- | --- |
| `sites` | 已支持站点列表（含能力声明） | — |
| `detectSite(input)` | 判断输入属于哪个站点，不抛错 | — |
| `resolve(input)` | 输入 → `NovelRef`（`site` / `novelId` / `canonicalUrl`） | — |
| `fetchCatalog(input, opts?)` | 抓目录：元数据 + 章 + 话 | 否 |
| `fetchEpisode(input, index, opts?)` | 抓单话正文 | 否 |
| `downloadEpisodes(input, opts?)` | 批量下载正文（自动续传） | 是 |
| `listDownloaded(input)` | 已下载的话序号 | 读 |
| `readEpisode(input, index)` | 读回某话，不存在返回 `null` | 读 |
| `getManifest(input)` | 最近一次下载清单 | 读 |
| `getDownloadStatus(input, catalog)` | 下载进度（缺哪些话） | 读 |

`input` 接受三种形态，方法内部统一归一化：

```ts
library.resolve('n4703ix')                                  // 裸 ID
library.resolve('https://ncode.syosetu.com/n4703ix/')       // 作品主页
library.resolve('https://ncode.syosetu.com/n4703ix/12/')    // 某一话（会归一到作品）
```

---

## 2. 典型流程

### 2.1 抓目录并展示

```ts
const catalog = await library.fetchCatalog(url, {
  onProgress: (p) => (loadingText.value = p.message),
})

catalog.meta.title          // 作品名
catalog.meta.author.name    // 作者
catalog.meta.status         // 'ongoing' | 'completed' | 'hiatus' | 'short' | 'unknown'
catalog.meta.completedAt    // '2024-09-13'
catalog.chapters            // [{ index, title, episodeStart, episodeEnd, episodeCount }]
catalog.episodes            // [{ index, title, url, chapterIndex, publishedAt, revisedAt }]
catalog.fetch.warnings      // 解析告警，建议在 UI 上提示
```

### 2.2 批量下载

```ts
const controller = new AbortController()

const result = await library.downloadEpisodes(url, {
  range: '1-20',            // 或 indices: [1, 3, 5]，都不传 = 全部
  overwrite: false,         // 默认 false：已存在的自动跳过（断点续传）
  concurrency: 4,
  signal: controller.signal, // 绑定「取消」按钮
  onProgress: (p) => (progress.value = p.page / p.totalPages),
  onEpisode: (ep) => list.value.push(ep), // 每话落盘后回调，可实时刷新列表
})

result.fetched      // 新抓话数
result.skipped      // 跳过话数
result.failed       // [{ index, error }]，单话失败不影响整批
result.manifest     // { have, lastRun: {...} }
```

### 2.3 展示下载进度

```ts
const status = await library.getDownloadStatus(url, catalog)
// { total: 159, downloaded: 99, missing: [100, 101, ...], complete: false }
```

---

## 3. 存储

采集内核不碰文件系统，落盘方式由 `EpisodeStore` 决定。

| 实现 | 场景 |
| --- | --- |
| `MemoryEpisodeStore` | 浏览器 / 预览 / 单元测试（默认） |
| `FsEpisodeStore` | Node 侧写本地文件（`scripts/fs-store.ts`） |
| 自定义 | 写数据库 / 对象存储 / 远端接口 |

自定义只需实现四个核心方法：

```ts
interface EpisodeStore {
  has(ref, index): Promise<boolean>
  read(ref, index): Promise<EpisodeContent | null>
  write(ref, content): Promise<void>
  list(ref): Promise<number[]>
  // 可选：remove / readManifest / writeManifest
}
```

接入方式：

```ts
const library = createNovelLibrary({ store: new MyStore() })
```

---

## 4. 浏览器直连站点

站点不返回 CORS 头，浏览器直连会被拦。两条路：

### 4.1 开发期：Vite 同源代理（已配置）

`vite.config.ts` 已配好 `/api/syosetu` 与 `/api/narou` 两个代理，配合 `rewriteUrl` 使用：

```ts
import { createNovelLibrary, FetchHttpClient } from '@/lib'

const toProxy = (url: string) =>
  url
    .replace('https://ncode.syosetu.com', '/api/syosetu')
    .replace('https://api.syosetu.com', '/api/narou')

const library = createNovelLibrary({
  http: new FetchHttpClient({ rewriteUrl: toProxy, concurrency: 4, minIntervalMs: 200 }),
})
```

> 已验证：同一份库代码经代理可完整抓取目录与正文（159 话 / 8 章 / 零告警）。

### 4.2 生产：Node 侧采集

代理只适合开发。线上建议把 `NovelLibrary` 挂在 Node 服务里（直接用 `FsEpisodeStore`），
前端只读接口返回的 JSON——避免把抓取压力转嫁给用户浏览器，也便于集中限速。

---

## 5. 并发与取消

```ts
createNovelLibrary({
  concurrency: 4,       // 同时在途请求数，默认 1
  minIntervalMs: 200,   // 相邻请求最小间隔，默认 800
})
```

两者是独立约束：只提并发不放宽间隔，吞吐不会提升。
实测 20 话：`c=1` 28.4s → `c=4` 6.6s → `c=8` 5.7s，**建议 4**。

取消：

```ts
const controller = new AbortController()
library.downloadEpisodes(url, { signal: controller.signal })
controller.abort()   // 已抓完的话已落盘，不会丢
```

---

## 6. 错误处理

所有异常都是 `NovelError`，带 `code` 与 `detail`：

```ts
import { isNovelError } from '@/lib'

try {
  await library.fetchCatalog(url)
} catch (err) {
  if (isNovelError(err)) {
    switch (err.code) {
      case 'UNSUPPORTED_SITE': /* 输入框提示「暂不支持该站点」 */ break
      case 'NOT_FOUND':        /* 提示「作品不存在或已删除」 */ break
      case 'RATE_LIMITED':     /* 提示「请求过于频繁，请降低并发」 */ break
      case 'PARSE_ERROR':      /* 页面结构变化，提示反馈 */ break
    }
  }
}
```

| code | 含义 |
| --- | --- |
| `UNSUPPORTED_SITE` | 输入无法识别或站点未接入 |
| `INVALID_INPUT` | 参数非法（如话序号 ≤ 0） |
| `NOT_FOUND` | 作品/话不存在（404） |
| `RATE_LIMITED` | 被站点限流（429） |
| `HTTP_ERROR` | 其他 HTTP 或网络异常（可重试） |
| `PARSE_ERROR` | 页面结构解析失败 |
| `ABORTED` | 被 `AbortSignal` 取消 |

> 批量下载**不会**因单话失败抛错，失败项在 `result.failed[]` 里。

---

## 7. Vue 组件示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { createNovelLibrary, isNovelError, type NovelRecord, type DownloadStatus } from '@/lib'

const library = createNovelLibrary({ concurrency: 4 })
const input = ref('https://ncode.syosetu.com/n4703ix/')
const catalog = ref<NovelRecord | null>(null)
const status = ref<DownloadStatus | null>(null)
const progress = ref('')
const busy = ref(false)
let controller: AbortController | null = null

async function loadCatalog() {
  busy.value = true
  try {
    catalog.value = await library.fetchCatalog(input.value, {
      onProgress: (p) => (progress.value = p.message),
    })
    status.value = await library.getDownloadStatus(input.value, catalog.value)
  } catch (err) {
    progress.value = isNovelError(err) ? `失败：${err.message}` : String(err)
  } finally {
    busy.value = false
  }
}

async function download() {
  if (!catalog.value) return
  controller = new AbortController()
  busy.value = true
  const result = await library.downloadEpisodes(input.value, {
    overwrite: false,
    signal: controller.signal,
    onProgress: (p) => (progress.value = `${p.page}/${p.totalPages}`),
  })
  status.value = await library.getDownloadStatus(input.value, catalog.value)
  progress.value = `完成：新抓 ${result.fetched}，跳过 ${result.skipped}，失败 ${result.failed.length}`
  busy.value = false
}

function cancel() {
  controller?.abort()
}
</script>
```

---

## 8. 底层 API（可选）

需要更细粒度控制时可直接用 `NovelFetcher`（无存储、无门面）：

```ts
import { NovelFetcher, FetchHttpClient } from '@/lib'

const fetcher = new NovelFetcher({ http: new FetchHttpClient({ concurrency: 2 }) })
const record = await fetcher.fetchNovel('n4703ix')
const content = await fetcher.fetchEpisode('n4703ix', 1)
```

新增站点见 `docs/architecture.md` 第 9 节。

---

## 9. 本地数据 API（HTTP 端点）

前端实际访问的是 Vite 中间件暴露的 REST 接口（`server/libraryApi.ts`），
查询走 SQLite 索引，正文仍从磁盘 JSON 读取。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sites` | 已支持站点及能力声明 |
| GET | `/api/stats` | `{ novels, episodes, withContent, trashed }` |
| GET | `/api/facets` | 分类统计：状态 / 站点 / 题材 / 热门标签及计数 |
| GET | `/api/library` | 列表查询，返回 `{ items, total, page, limit }` |
| POST | `/api/sync` | 从磁盘重建索引，返回 `{ novels, episodes, stats }` |
| POST | `/api/import` | `{ input, site? }` → 抓目录并写盘 + 建索引 |
| GET | `/api/library/:site/:id` | 完整目录（读 JSON 真源） |
| POST | `/api/library/:site/:id/refresh` | 重新抓取目录，更新元数据与话列表 |
| DELETE | `/api/library/:site/:id` | **一级删除**：移入回收站（软删除，不动文件） |
| DELETE | `/api/library/:site/:id?permanent=1` | **二级删除**：连磁盘文件一起永久删除 |
| POST | `/api/library/:site/:id/restore` | 从回收站恢复 |
| POST | `/api/trash/empty` | 清空回收站（永久删除全部） |
| GET | `/api/library/:site/:id/status` | `{ downloaded, total, indices, job }` —— `job` 为当前下载任务进度 |
| GET | `/api/library/:site/:id/episodes/:n` | 单话正文 |
| POST | `/api/library/:site/:id/fetch` | `{ range?, all?, overwrite?, concurrency? }` 批量下载 |

### 下载进度的实时性

`/status` 的 `job` 字段来自服务端内存的任务表：

```json
{ "total": 10, "done": 6, "failed": 0, "running": true, "startedAt": 1730000000000, "finishedAt": null }
```

配套两个关键实现，缺一不可：

1. **每抓完一话就 `markContent()` 写索引** —— 否则 `downloaded` 在整批结束前都是旧值，
   前端轮询拿到的永远是同一个数字，进度条等于不动。
2. **`job` 单独记录任务级信息** —— 「本次计划多少话、完成多少」是任务属性，DB 里没有，
   靠 `downloaded` 反推会把「之前就下载过的」算进来。

前端轮询间隔 600ms；整批结束后 `job.running` 置 false，`job` 保留最后一次结果。
同一作品同时只允许一个下载任务（并发请求返回 409）。

### 二级删除的设计

| 层级 | 操作 | 磁盘影响 | 可撤销 |
| --- | --- | --- | --- |
| 一级 | `DELETE`（无 `permanent`） | 不动文件，只写 `novels.deleted_at` | ✅ 回收站可恢复 |
| 二级 | `DELETE ?permanent=1` | 删除目录 JSON + 整话正文目录 | ❌ 不可恢复 |

软删除后：书架列表与 facets 自动排除，下载接口返回 409，但目录 JSON 仍在磁盘上，
所以恢复是零成本的。永久删除才会 `rm` 文件。

删除类操作会追加到 `data/audit.log`（JSONL，一行一次），
因为回收站状态只存在 DB 里、磁盘上没有对应文件，出问题时需要能追溯。

### 错误语义

| 状态码 | 场景 | 前端应如何处理 |
| --- | --- | --- |
| 404 | 作品确实不存在 | 提示并返回书架 |
| 409 | 目录 JSON 缺失但索引有记录 | 提示「重新抓取目录」并提供按钮 |
| 409 | 下载回收站中的作品 | 提示先恢复 |
| 500 | 抓取/解析失败 | 显示错误 + 重试 |

> 关键：**读取失败不能渲染成「空」**。回收站页与作品页都区分了「空」与「出错」，
> 否则服务重启瞬间的请求失败会被误读成「删了但没进回收站」。

### 列表查询参数

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `q` | 任意文本 | 匹配标题或作者 |
| `status` | `ongoing` / `completed` / `hiatus` / `short` | 连载状态 |
| `progress` | `none` / `partial` / `complete` | 下载进度：未开始 / 进行中 / 已完整 |
| `genre` | 题材名 | 大类题材 |
| `tag` | 标签名 | 精确匹配某个标签 |
| `site` | 站点 ID | 数据来源 |
| `sort` | `recent` / `imported` / `title` / `progress` | 排序，默认 `recent` |
| `trashed` | `1` | 只看回收站（缺省只看正常作品） |
| `page` / `limit` | 正整数 | 分页，`limit` 上限 200，默认 60 |

`site` 参数在导入时还有校验语义：地址与所选站点不一致时返回 400，
避免用户在下拉框选了 A 却粘贴 B 站链接。

错误统一为 `{ "error": "可读信息" }` + 对应状态码（400/404/500）。
