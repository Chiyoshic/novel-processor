# novel-processor

个人小说库处理工具。把多个小说站点的作品归一化成统一 JSON，供后续整理、检索、导出使用。

当前支持：**小説家になろう（syosetu）**

- 架构说明：[`docs/architecture.md`](docs/architecture.md)

## 快速开始

```bash
npm install

# 1) 抓取作品目录（可用作品 ID 或完整 URL）
npm run fetch -- n4703ix
npm run fetch -- https://ncode.syosetu.com/n4703ix/

# 2) 抓取正文
npm run fetch -- n4703ix --all            # 全部话
npm run fetch -- n4703ix --range 1-20     # 指定区间
npm run fetch -- n4703ix --episode 5      # 单话

# 已抓过的正文默认跳过（断点续传），强制重抓加 --overwrite
npm run fetch -- n4703ix --all --overwrite
```

输出：

```
data/novels/syosetu/n4703ix.json             # 目录：元数据 + 章 + 话
data/episodes/syosetu/n4703ix/1.json         # 第 1 话正文
data/episodes/syosetu/n4703ix/159.json       # 第 159 话正文
data/episodes/syosetu/n4703ix/_manifest.json # 本次抓取清单（成功/跳过/失败）
```

## 命令参数

| 参数 | 说明 |
| --- | --- |
| `-e, --episode <spec>` | 抓指定话，支持 `5`、`1-5`、`1,3,7-9` |
| `-r, --range <spec>` | 同 `--episode` |
| `-a, --all` | 抓全部话（自动先抓目录确定总话数） |
| `--overwrite` | 已存在的正文也重抓（默认跳过） |
| `-o, --out <path>` | 自定义输出路径（目录模式为文件，正文模式为目录） |
| `--no-enrich` | 跳过官方 API 富化 |
| `--max-pages <n>` | 目录页抓取上限（默认 50） |
| `-q, --quiet` | 不打印进度 |

> 批量抓取为**串行 + 800ms 间隔**，159 话约需 3 分钟。单话失败不会中断整批，失败项会写入
> `_manifest.json` 的 `failed[]`，重跑同一条命令即可自动补齐（已成功的不重复抓取）。

## 产出结构

```jsonc
{
  "source": { "site": "syosetu", "novelId": "n4703ix", "url": "…" },
  "meta": { "title": "…", "author": {…}, "summary": "…",
            "status": "completed", "completedAt": "2024-09-13",
            "episodeCount": 159, "chapterCount": 8, "wordCount": 387175,
            "firstPublishedAt": "…+09:00", "lastEpisodeAt": "…+09:00" },
  "chapters": [{ "index": 1, "title": "第一章　幼少期", "episodeStart": 1, "episodeEnd": 13 }],
  "episodes": [{ "index": 1, "title": "…", "url": "…", "chapterIndex": 1,
                 "publishedAt": "…+09:00", "revisedAt": null }],
  "fetch": { "pagesFetched": 2, "warnings": [] }
}
```

## 开发

```bash
npm run dev        # 前端（Vue 3 + Vite）
npm run typecheck  # 类型检查
npm run build      # 构建前端
```

采集内核在 `src/lib/`，与 Vue 无关；新增站点见架构文档第 9 节。

> 采集仅供个人阅读整理使用，请遵守各站点使用条款。
