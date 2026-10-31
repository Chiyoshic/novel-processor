# 小说库架构规划

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
│   CLI (scripts/fetch-novel.ts)   Vue UI   HTTP API(待建)   │
└───────────────────────────┬──────────────────────────────┘
                            │ NovelRecord / EpisodeContent
┌───────────────────────────▼──────────────────────────────┐
│ 流水线层  NovelFetcher (src/lib/pipeline.ts)              │
│   翻页 → 合并有序条目流 → 编号/归章 → 元数据富化 → 校验告警  │
└───────────────────────────┬──────────────────────────────┘
                            │ SiteAdapter 契约
┌───────────────────────────▼──────────────────────────────┐
│ 适配层                                                    │
│   registry.ts ──► syosetu/ (adapter + selectors + api)    │
│                   kakuyomu/ (预留)                        │
└───────────────────────────┬──────────────────────────────┘
                            │ HttpClient（限速 / 重试 / 超时）
┌───────────────────────────▼──────────────────────────────┐
│ IO 层  FetchHttpClient (src/lib/http.ts)                  │
└──────────────────────────────────────────────────────────┘
```

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
| 并发 | 串行（1） | `HttpClient` 本身是全局串行限速队列，并发不提升吞吐，只会放大风控风险 |
| 失败处理 | 单话失败不中断整批 | 159 话里挂 1 话不应丢弃其余 158 话的成果 |
| 落盘时机 | 每话完成立即回调 `onEpisode` | 中途 Ctrl-C 或断网不丢已抓内容 |
| 续传 | `shouldSkip(index)` 由调用方判定 | 内核不碰文件系统；CLI 用「文件已存在」实现断点续传 |

失败项收集到 `EpisodeBatchResult.failed[]` 并写入 `_manifest.json`，
重跑同一条命令即可自动补齐——已成功的话因文件存在被跳过，不会重复请求。

正文文件按话拆分而非整本一个大 JSON，原因：
1. 断点续传的粒度就是「话」，文件即状态；
2. 后续做翻译/清洗时可按文件并行、可增量；
3. 单文件损坏只影响一话。

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

1. **限速**：同一 `HttpClient` 内请求串行排队，相邻请求间隔 ≥800ms（可配）。
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
├─ src/lib/                      # 与框架无关的采集内核（Node / 浏览器通用）
│  ├─ types.ts                   # 领域模型 + 适配器契约 + HTTP 契约
│  ├─ errors.ts                  # 统一错误码
│  ├─ time.ts                    # 站点本地时间 → 带偏移 ISO 8601
│  ├─ text.ts                    # HTML→文本、保留全角空格的归一化
│  ├─ http.ts                    # FetchHttpClient（限速/重试/超时）
│  ├─ pipeline.ts                # NovelFetcher 流水线
│  └─ sites/
│     ├─ registry.ts             # 输入路由
│     └─ syosetu/
│        ├─ adapter.ts           # 站点实现
│        ├─ selectors.ts         # 选择器集中管理
│        └─ api.ts               # 官方 API 富化
├─ scripts/fetch-novel.ts        # CLI 入口
└─ data/
   ├─ novels/<site>/<id>.json            # 作品目录
   └─ episodes/<site>/<id>/<n>.json      # 单话正文
      episodes/<site>/<id>/_manifest.json # 批量抓取清单
```

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
| P1（已完成） | 目录解析 + 正文解析 + 批量提取 + CLI | 适配器契约、双源富化、断点续传 |
| P2 | 本地书库索引 | `data/` 为真源，生成 `index.json` 汇总；按 `(site, novelId)` 唯一键 |
| P3 | 增量更新 | 用 `meta.lastEpisodeAt` + 已有 `episodes.length` 做 diff，只抓新增页与新话 |
| P4 | 正文清洗与去广告 | 在 `EpisodeContent.body` 之上加可插拔清洗管道 |
| P5 | 多站点去重 | 同名/同作者 + 简介指纹（SimHash）跨站聚类 |
| P6 | Web UI / HTTP 服务 | 直接把 `src/lib` 挂到 Node 服务；浏览器直连需经同源代理绕开 CORS |
| P7 | 导出 | EPUB / TXT / Markdown，按 `chapters` 切分卷 |

### 关于浏览器直连

`src/lib` 不依赖 Node API（`HttpClient` 是接口），理论上可直接在 Vue 里跑。
但站点不返回 CORS 头，浏览器端必须经**同源代理**（Vite `server.proxy` 或自建 Node 服务）。
因此推荐形态是：**Node 侧采集 + 前端只读 JSON**，而不是前端直连站点。

---

## 11. 已知限制

1. **`end` 字段语义非官方文档字面**。实测 `1 = 連載中`、`0 = 已完结（含短編）`，
   短編与完结连载通过 `novel_type`（1=連載, 2=短編）区分。已在 `api.ts` 注释标注，
   若站点调整需重新验证。
2. **目录页只给「日」精度**的最终话日期；精确到秒的时间依赖 API，API 缺失时退化为 `T00:00:00+09:00`。
3. **改稿时间只保留最近一次**（`revisedAt`），历史改稿记录站点不提供。
4. **R18 分站未实测**，仅预留了域名与 Cookie 注入点。
5. **正文 HTML 原样保留**（`bodyHtml`），未做 XSS 清洗——渲染到 Web 前必须过滤。
