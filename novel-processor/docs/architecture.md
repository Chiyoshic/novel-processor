# 小说库架构规划

> 架构更新：后端现已独立为 Node HTTP 服务，部署与配置请参见项目 README。本文中 Vite 中间件、浏览器直调采集库及旧路径的描述仅保留作历史参考。

> 目标：把「多个小说站点的作品」归一化成同一套结构，供后续的整理、检索、去重、导出、翻译等能力复用。
> 当前已落地站点：`syosetu`（小説家になろう）。

---

## 1. 定位与边界

整个系统按「**站点适配**」与「**业务逻辑**」严格分层：

| 层 | 职责 | 是否感知具体站点 |
| --- | --- | --- |
| 采集层（Adapter） | 输入归一化、HTML 解析、站点 API 调用 | 是（唯一允许出现站点知识的地方） |
| 流水线层（Pipeline） | 翻页、合并、编号、归章、富化、产出 | 否 |
| 领域模型（Types） | 统一数据结构 | 否 |
| 消费层（CLI / Vue UI / 后续 API 服务） | 展示、入库、导出 | 否 |

**核心约束**：流水线层不允许出现任何站点特有的选择器、URL 规则或字段名。
一旦发现需要在流水线里写 `if (site === 'syosetu')`，说明抽象漏了，应回到适配器接口补能力。

---

## 2. 分层架构

```
┌──────────────────────────────────────────────────────────┐
│ 消费层                                                    │
│   Vue 组件   调试 CLI (scripts/fetch-novel.ts)  HTTP API   │
└───────────────────────────┬──────────────────────────────┘
                            │ 方法调用（fetchCatalog / downloadEpisodes …）
┌───────────────────────────▼──────────────────────────────┐
│ 门面层  NovelLibrary (src/lib/library.ts)                 │
│   站点自省 · 目录 · 单话 · 批量下载 · 本地库读取            │
│   组合 Fetcher + EpisodeStore，对外只暴露方法               │
└──────────────┬───────────────────────────┬───────────────┘
               │                           │
┌──────────────▼─────────────┐  ┌──────────▼───────────────┐
│ 流水线层 NovelFetcher       │  │ 存储层 EpisodeStore       │
│  翻页→合并→编号→富化→校验   │  │  内存 / 文件系统 / 自定义  │
└──────────────┬─────────────┘  └──────────────────────────┘
               │ SiteAdapter 契约
┌──────────────▼───────────────────────────────────────────┐
│ 适配层                                                    │
│   registry.ts ──► syosetu/ (adapter + selectors + api)    │
│                   kakuyomu/ (预留)                        │
└───────────────────────────┬──────────────────────────────┘
                            │ HttpClient（并发/节奏/重试/超时）
┌───────────────────────────▼──────────────────────────────┐
│ IO 层  FetchHttpClient (src/lib/http.ts)                  │
│        并发信号量 · 请求节奏 · 重试 · 超时                   │
└──────────────────────────────────────────────────────────┘
```

### 2.1 门面层的意义

`NovelLibrary` 不是简单的转发器，它解决了三个跨层问题：

1. **存储与采集解耦**：流水线只产出数据，落盘交给 `EpisodeStore`。
   同一套下载逻辑，Node 用 `FsEpisodeStore`，浏览器用 `MemoryEpisodeStore`，后端可换成数据库。
2. **组合而非继承**：UI 只依赖一个实例，不需要同时持有 Fetcher、HttpClient、Store 三件套。
3. **取消与进度统一**：所有长任务方法都接受 `AbortSignal` 与 `onProgress`，签名一致。

---

## 3. 核心抽象：SiteAdapter

所有站点差异收敛到一个接口（`src/lib/types.ts`）：

```ts
interface SiteAdapter {
  readonly id: SiteId
  readonly name: string
  readonly hosts: readonly string[]
  readonly capabilities: { episodeContent: boolean; paginated: boolean; metaApi: boolean }

  match(url: string): boolean                       // URL 是否属于本站
  resolve(input: string): NovelRef | null           // URL / 裸ID → 规范引用
  indexUrl(ref: NovelRef, page: number): string     // 第 N 页目录地址
  episodeUrl?(ref: NovelRef, index: number): string // 第 N 话正文地址
  parseIndexPage(html, ref, page): IndexPageResult  // 目录页解析
  parseEpisodePage?(html, ref, index): EpisodeContent
  fetchMeta?(ref, http): Promise<Partial<NovelMeta> | null>
}
```

### 3.1 为什么目录页返回「有序条目流」而不是两个数组

站点目录页里，分节标题（章）与话是**混排**的：

```
[章标题] 第一章　幼少期
[话] わたし、転生者なの
[话] ご機嫌よう
[章标题] 第二章　冒険の始まり
[话] 親の許可
```

如果解析器分别返回 `chapters[]` 和 `episodes[]`，就丢失了「哪一话属于哪一章」的顺序信息，
只能在适配器里就地归类——但分页会切断这个关系（第 6 章可能横跨第 1、2 页）。

因此适配器只负责**忠实还原顺序**：

```ts
type IndexItem =
  | { kind: 'chapter'; title: string }
  | { kind: 'episode'; episode: RawEpisode }
```

归章由流水线的 `assembleStructure()` 在**所有页合并之后**统一完成。
这样「章跨页」问题自动消解，且换站点时无需重写归类逻辑。

### 3.2 能力声明的作用

`capabilities` 让上层在**不写站点判断**的前提下决定行为：

- `episodeContent: false` → UI 隐藏「下载正文」按钮；
- `metaApi: false` → 流水线跳过富化步骤，不产生「富化失败」告警；
- `paginated: false` → 跳过翻页循环。

---

## 4. 数据模型

最终产物是 `NovelRecord`（见 `src/lib/types.ts`），JSON 结构：

```jsonc
{
  "schemaVersion": "1.0.0",
  "source": { "site": "syosetu", "siteName": "小説家になろう",
              "novelId": "n4703ix", "url": "https://ncode.syosetu.com/n4703ix/" },
  "meta": {
    "title": "…", "author": { "name": "陽七　葵", "url": "…", "siteUserId": "2608337" },
    "summary": "简介纯文本，保留换行与全角缩进",
    "status": "completed",          // ongoing | completed | hiatus | short | unknown
    "statusLabel": "完結済",         // 站点原始文案
    "workType": "serial",           // serial | short | unknown
    "episodeCount": 159, "chapterCount": 8, "wordCount": 387175,
    "firstPublishedAt": "2024-04-18T06:00:50+09:00",
    "lastEpisodeAt":    "2024-09-13T20:30:47+09:00",
    "completedAt":      "2024-09-13",
    "tags": ["R15", "ボーイズラブ", "…"],
    "genre": "ファンタジー", "genreCode": 2,
    "flags": { "r15": true, "r18": false, "zankoku": true, "bl": true, "gl": false },
    "sourceUpdatedAt": "…"
  },
  "chapters": [{ "index": 1, "title": "第一章　幼少期",
                 "episodeStart": 1, "episodeEnd": 13, "episodeCount": 13 }],
  "episodes": [{ "index": 1, "title": "わたし、転生者なの",
                 "url": "https://ncode.syosetu.com/n4703ix/1/", "path": "/n4703ix/1/",
                 "chapterIndex": 1, "chapterTitle": "第一章　幼少期",
                 "publishedAt": "2024-04-18T06:00:00+09:00",
                 "revisedAt": null, "isRevised": false }],
  "fetch": { "fetchedAt": "…", "parserVersion": "0.1.0", "pagesFetched": 2,
             "durationMs": 6288, "enrichedBy": ["syosetu-api"], "warnings": [] }
}
```

### 4.1 三条硬性约定

1. **时间一律带时区偏移**。站点给出的是本地时间（なろう 为 JST），直接当 UTC 会整体偏 9 小时。
   只有日期精度时补 `T00:00:00+09:00`，并由 API 富化覆盖为精确值。
2. **可空字段用 `null` 而非省略**。JSON 消费方不必区分「字段不存在」和「值为空」。
3. **`chapterIndex` 可为 `null`**。大量作品不分章，此时不伪造章结构。

### 4.2 `fetch.warnings` 是一等公民

解析器不因局部异常而整体失败，而是降级 + 记录：

- 未解析到标题 / 简介 / 任何话 → 继续产出，附告警；
- API 话数与目录页话数不一致 → 继续产出，附告警；
- 目录页数超上限被截断 → 继续产出，附告警；
- 话序号重复 / 不连续 → 继续产出，附告警。

理由：小说库是长期累积的数据，**残缺记录 + 明确告警**远比「整本抓取失败」有价值。

### 4.3 存储分层：JSON 真源 + SQLite 索引

引入 SQLite 时最容易犯的错是「把正文塞进数据库」。这里刻意不做：

| 层 | 存什么 | 为什么 |
| --- | --- | --- |
| JSON 文件 | 目录、单话正文 | 真源。可读、可 diff、可单独备份；单文件损坏只影响一话 |
| SQLite | 作品 / 章 / 话 / `has_content` | 索引。列表、搜索、筛选、统计走 SQL，不必扫上百个 JSON |

**关键性质：DB 可从磁盘完整重建。** `syncFromDisk()` 读所有目录 JSON 并 upsert，
再用 `EpisodeStore.list()` 覆盖 `has_content`，整个过程幂等。

带来的三个好处：

1. **DB 丢了不心疼** —— 删掉 `library.db`，启动时自动重建；
2. **没有一致性死结** —— 磁盘永远是对的，DB 只是它的投影；
3. **查询变快** —— 「按状态筛选 + 标题搜索 + 统计已存话数」从 O(文件数) 变成一条 SQL。

同步时机：启动时全量对齐一次（毫秒级）；导入 / 下载后增量更新；
`POST /api/sync` 可手动强制重建。

> 注：`has_content` 由磁盘真实状态回写（下载后用 `store.list()` 覆盖），
> 而不是靠「下载了几话」累加——避免中断、手动删文件导致索引漂移。

### 4.4 索引层的表设计（v2）

| 决策 | 做法 | 理由 |
| --- | --- | --- |
| 主键 | `novels.id` 整型代理键 + `UNIQUE(site, novel_id)` | 章/话/标签的外键只需一个整数；复合主键字符串重复存储代价更高 |
| 标签 | 独立 `novel_tags(novel_id, tag)` 关联表 | 原来 tags 存 JSON 字符串，只能 `LIKE '%tag%'`；拆表后可 `GROUP BY` 做分类统计、可按标签精确筛选 |
| 下载数 | `novels.downloaded_count` 冗余列 + 触发器维护 | 列表页原来每行跑一次 `SELECT COUNT(*)` 子查询（N+1），现在直接读列 |
| 索引 | `(status, last_episode_at)`、`(site, …)`、`(genre_code)`、`(title)` | 按真实查询建，不做无差别加索引 |
| 部分索引 | `episodes(novel_id) WHERE has_content = 1` | 「已下载的话」查询只索引需要的行，体积更小 |
| 外键 | `ON DELETE CASCADE` + `foreign_keys = ON` | 删作品时章/话/标签自动清理，不用写三条 DELETE |
| PRAGMA | WAL / `synchronous=NORMAL` / `mmap_size=128MB` / `cache_size≈16MB` | 读多写少场景下的常规调优 |

**为什么不用 FTS5 全文检索**：作品量级在千级以内，`LIKE '%kw%'` 全表扫描是微秒级；
而 FTS5 处理 CJK 需要 `trigram` 分词器，对「無職」这类 2 字查询不友好，
收益不抵复杂度。等数据量到万级再上，届时也只需替换 `listNovels` 里的一段 SQL。

**Schema 升级不需要迁移脚本**：DB 是投影，`user_version` 不符时直接 `DROP` 重建，
再由 `syncFromDisk()` 灌回。这是「索引层」定位带来的直接收益。

---

## 5. 抓取流程

```
resolve(input) ──► NovelRef
      │
      ├─ GET 第 1 页目录 ──► parseIndexPage
      │      └─ 得到 totalPages / 首页条目 / 部分元数据
      │
      ├─ GET 第 2..N 页（串行，HttpClient 保证 ≥800ms 间隔）
      │      └─ 追加条目流
      │
      ├─ assembleStructure(items) ──► chapters[] + episodes[]
      │      └─ 分配全书序号、归章、丢弃空章并重排章号
      │
      ├─ fetchMeta(ref) ──► 官方 API 富化（状态/字数/总话数/标签/分级）
      │
      └─ 一致性校验 ──► NovelRecord
```

### 5.1 分页识别

- 优先读分页控件的「最後へ」链接 `?p=N` 得到总页数；
- 若无分页控件但本页条目数达到站点单页上限（なろう 为 100），保守判定还有下一页；
- `maxPages` 上限（默认 50）防止异常站点无限翻页。

### 5.2 双源策略（HTML + 官方 API）

なろう 的目录页 HTML **不含**「完結/連載」「総文字数」「総話数」——这些只存在于官方 API。

| 数据 | 来源 | 理由 |
| --- | --- | --- |
| 标题、作者、简介 | HTML | 页面即为唯一真源 |
| 章 / 话 / URL / 时间 | HTML | API 不提供章节列表 |
| 完结状态、字数、总话数、标签、分级 | API | 结构稳定，无需解析 DOM |

富化失败**不阻断**主流程：捕获异常后返回 `null`，流水线打告警继续。
API 与 HTML 的冲突（话数不一致）以 API 为准并记录告警，因为 API 是站点权威索引。

### 5.3 批量正文提取

`fetchEpisodes()` 与 `fetchNovel()` 共用同一个适配器与 HTTP 层，但有四个不同取舍：

| 决策 | 取值 | 理由 |
| --- | --- | --- |
| 并发 | 可配，默认 1 | 由 `HttpClient` 的信号量统一收敛；默认串行是对站点最友好的取值 |
| 失败处理 | 单话失败不中断整批 | 159 话里挂 1 话不应丢弃其余 158 话的成果 |
| 落盘时机 | 每话完成立即回调 `onEpisode` | 中途 Ctrl-C 或断网不丢已抓内容 |
| 续传 | `shouldSkip(index)` 由调用方判定 | 内核不碰存储；门面层用 `EpisodeStore.has()` 实现断点续传 |

失败项收集到 `EpisodeBatchResult.failed[]` 并写入 `_manifest.json`，
重跑同一条命令即可自动补齐——已成功的话因文件存在被跳过，不会重复请求。

正文文件按话拆分而非整本一个大 JSON，原因：
1. 断点续传的粒度就是「话」，文件即状态；
2. 后续做翻译/清洗时可按文件并行、可增量；
3. 单文件损坏只影响一话。

### 5.4 并发模型

并发是**两个独立约束**，必须分开建模，否则会出现「把并发调到 8 却毫无提速」的情况：

| 参数 | 语义 | 作用位置 |
| --- | --- | --- |
| `concurrency` | 同时在途的请求数上限 | `HttpClient` 信号量 + 流水线任务池 |
| `minIntervalMs` | 相邻两次请求**发起**的最小间隔 | `HttpClient.pace()` |

吞吐上限 = `min(concurrency / 平均延迟, 1 / minIntervalMs)`。
串行 800ms 时后者封顶 1.25 req/s；把并发提到 4 而节奏仍是 800ms，吞吐不会变——
必须同时把节奏放宽到 200ms，才能得到约 5 req/s。

**实现要点**

1. **信号量用「名额转交」而非计数增减**：`release()` 有等待者时直接把名额交给它，
   不先减再加，避免唤醒与归还之间的竞态。
2. **节奏用「先占时间槽再等待」**：同步计算 `nextStartAt` 后才 `await`，
   保证多并发下同一时间槽不会被重复分配。
3. **任务池保序**：目录页并发抓取后必须按页序合并，否则章会错位。
   `mapLimit` 按输入下标写回结果，天然保序；正文批量用 `forEachLimit`（无序，因为按话落盘）。
4. **两处并发数必须一致**：流水线并发 4 而 HTTP 层并发 1，任务会在 IO 层排队，
   表现为「设了并发但没变快」。CLI 用同一个 `--concurrency` 同时配置两者。

**调参建议**：4 并发性价比最高（实测 4.3×）；8 并发仅 5.0×，站点侧排队成为瓶颈，
且更容易触发风控。被限流时先降并发，再用 `--interval` 单独收紧节奏。

---

## 6. 站点差异的三类归口

| 差异类型 | 例子 | 归口位置 |
| --- | --- | --- |
| URL 形态 | `ncode.syosetu.com/n4703ix/`、`novel18` 分站、短链 | `resolve()` / `indexUrl()` / `episodeUrl()` |
| DOM 结构 | `.p-eplist__sublist` vs 别的站点的列表结构 | `selectors.ts` + `parseIndexPage()` |
| 元数据可得性 | 有的站点有 API，有的只有 HTML | `capabilities.metaApi` + `fetchMeta()` |

**选择器必须集中在 `selectors.ts`**，站点改版时只改一个文件，业务代码零改动。

---

## 7. 可靠性与合规

1. **限速**：并发数与请求节奏双约束（见 5.4）。默认串行 + 800ms 间隔，可按需放宽。
2. **重试**：仅对 408/425/429/5xx 与网络异常重试，指数退避（800ms × 2ⁿ + 抖动），最多 3 次。
3. **超时**：单请求 20s，超时视为可重试错误。
4. **UA 标识**：使用带工具名的 User-Agent，不伪装成普通浏览器做高频请求。
5. **404 不重试**：直接抛 `NOT_FOUND`，避免无意义放大请求。
6. **R18 分站**：适配器已预留 `novel18` 变体与自定义 `Cookie` 头注入点，默认不启用。

> 采集仅用于个人阅读与整理，请遵守各站点使用条款；不要高频抓取或二次分发全文。

---

## 8. 目录结构

```
novel-processor/
├─ src/
│  ├─ main.ts                    # 挂载 + 注册路由
│  ├─ router.ts                  # 三条路由：书架 / 作品 / 阅读
│  ├─ api.ts                     # 本地数据 API 的类型化客户端
│  ├─ stores/sites.ts            # 站点列表的一次性缓存
│  ├─ views/
│  │  ├─ ShelfView.vue           # 书架：搜索 + 分类筛选 + 卡片网格
│  │  ├─ NovelView.vue           # 作品：元数据 + 目录 + 下载控制
│  │  └─ ReaderView.vue          # 阅读：整页正文 + 上下话
│  ├─ components/
│  │  ├─ AppHeader.vue / AppSelect.vue / FilterChips.vue
│  │  ├─ ImportPanel.vue / NovelCard.vue / NovelDetail.vue
│  │  └─ select-option.ts
│  └─ lib/                       # 与框架无关的采集内核（Node / 浏览器通用）
│     ├─ index.ts                # 公共 API 入口（只从这里导入）
│     ├─ library.ts              # NovelLibrary 门面
│     ├─ store.ts                # EpisodeStore 契约 + MemoryEpisodeStore
│     ├─ types.ts                # 领域模型 + 适配器契约 + HTTP 契约
│     ├─ errors.ts / time.ts / text.ts / range.ts / concurrency.ts
│     ├─ http.ts                 # FetchHttpClient（并发信号量/节奏/重试/超时）
│     ├─ pipeline.ts             # NovelFetcher 流水线
│     └─ sites/
│        ├─ registry.ts          # 输入路由
│        └─ syosetu/
│           ├─ adapter.ts        # 站点实现
│           ├─ selectors.ts      # 选择器集中管理
│           └─ api.ts            # 官方 API 富化
├─ scripts/                      # 调试壳（删掉不影响库）
│  ├─ fetch-novel.ts             # CLI：只做参数解析 → 调方法 → 打印
│  ├─ api-demo.ts                # 可运行的 API 示例 / 冒烟测试
│  └─ fs-store.ts                # FsEpisodeStore（Node 专用，依赖 node:fs）
├─ server/                       # 本地服务端（Vite 插件，Node 专用）
│  ├─ libraryApi.ts              # REST 中间件：路由 + 序列化
│  └─ db.ts                      # SQLite 索引层（better-sqlite3）
├─ docs/
│  ├─ architecture.md            # 本文
│  └─ api.md                     # 前端方法参考
└─ data/
   ├─ novels/<site>/<id>.json            # 作品目录
   ├─ episodes/<site>/<id>/<n>.json      # 单话正文
   ├─ episodes/<site>/<id>/_manifest.json # 批量抓取清单
   └─ library.db                          # SQLite 索引（可删，可重建）
```

**分层归属原则**：`src/lib` 里不允许出现 `node:*` 导入，否则前端打包会炸。
文件系统实现放在 `scripts/fs-store.ts`，通过 `EpisodeStore` 接口注入。

---

## 9. 新增站点 Checklist

以接入「カクヨム」为例，只需三步，**流水线零改动**：

```ts
// src/lib/sites/kakuyomu/adapter.ts
export class KakuyomuAdapter implements SiteAdapter {
  readonly id = 'kakuyomu'
  readonly name = 'カクヨム'
  readonly hosts = ['kakuyomu.jp'] as const
  readonly capabilities = { episodeContent: true, paginated: false, metaApi: false }

  match(url: string) { /* host 判断 */ }
  resolve(input: string): NovelRef | null { /* /works/<id> → NovelRef */ }
  indexUrl(ref: NovelRef) { return ref.canonicalUrl }
  parseIndexPage(html: string, ref: NovelRef, page: number): IndexPageResult {
    // 只做三件事：元数据、有序条目流、分页
  }
  parseEpisodePage(html: string, ref: NovelRef, index: number): EpisodeContent { /* … */ }
}
```

1. 新建 `sites/<site>/{adapter,selectors}.ts`；
2. 在 `sites/registry.ts` 的 `builtinAdapters` 注册；
3. 用 `npm run fetch -- <该站作品URL>` 验证，检查 `fetch.warnings` 是否为空。

**验收标准**：`episodeCount` 与站点显示一致、章区间连续无空洞、时间偏移正确、无告警。

---

## 10. 后续演进路线

| 阶段 | 能力 | 关键设计点 |
| --- | --- | --- |
| P1（已完成） | 目录解析 + 正文解析 + 批量提取 + 门面 API | 适配器契约、双源富化、断点续传、方法化封装 |
| P2 | 本地书库索引 | `data/` 为真源，生成 `index.json` 汇总；按 `(site, novelId)` 唯一键 |
| P3 | 增量更新 | 用 `meta.lastEpisodeAt` + 已有 `episodes.length` 做 diff，只抓新增页与新话 |
| P4 | 正文清洗与去广告 | 在 `EpisodeContent.body` 之上加可插拔清洗管道 |
| P5 | 多站点去重 | 同名/同作者 + 简介指纹（SimHash）跨站聚类 |
| P6 | Web UI / HTTP 服务 | 直接把 `src/lib` 挂到 Node 服务；浏览器直连需经同源代理绕开 CORS |
| P7 | 导出 | EPUB / TXT / Markdown，按 `chapters` 切分卷 |

### 关于浏览器直连

`src/lib` 不依赖 Node API（`HttpClient` 是接口、存储是 `EpisodeStore` 接口），
因此同一份代码可以直接在 Vue 里跑。唯一的障碍是站点不返回 CORS 头。

已提供解法：`FetchHttpClient` 支持 `rewriteUrl` 把绝对地址改写到同源代理前缀，
`vite.config.ts` 里已配好 `/api/syosetu` 与 `/api/narou` 两个开发代理，并已实测跑通。

但生产环境不建议让用户浏览器直连站点——更合理的形态是 **Node 侧采集 + 前端只读 JSON**，
这样限速策略集中可控，也不会把抓取压力转嫁给终端用户。

---

## 11. 已知限制

1. **`end` 字段语义非官方文档字面**。实测 `1 = 連載中`、`0 = 已完结（含短編）`，
   短編与完结连载通过 `novel_type`（1=連載, 2=短編）区分。已在 `api.ts` 注释标注，
   若站点调整需重新验证。
2. **目录页只给「日」精度**的最终话日期；精确到秒的时间依赖 API，API 缺失时退化为 `T00:00:00+09:00`。
3. **改稿时间只保留最近一次**（`revisedAt`），历史改稿记录站点不提供。
4. **R18 分站未实测**，仅预留了域名与 Cookie 注入点。
5. **正文 HTML 原样保留**（`bodyHtml`），未做 XSS 清洗——渲染到 Web 前必须过滤。
