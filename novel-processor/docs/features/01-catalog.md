# 小说采集、目录与正文下载

## 支持平台

### 当前支持

- 小説家になろう（Syosetu）

### 计划支持

- カクヨム（Kakuyomu）
- アルファポリス（Alphapolis）
- ノベルアップ＋（Novelup Plus）
- エブリスタ（E★エブリスタ）
- ハーメルン（Hameln）
- ノベマ！（Novema!）

当前站点实现位于 `backend/src/lib/sites/syosetu/`。计划支持的平台暂未接入，不代表当前版本可以抓取。

## 导入目录

书架的添加作品区域接受作品主页 URL 或站点支持的作品 ID。后端会：

1. 识别站点并规范化 `site / novelId / canonicalUrl`；
2. 抓取目录分页和作品元数据；
3. 合并章节标题与话条目；
4. 使用站点 API 富化状态、字数、标签等信息（如果站点提供）；
5. 将目录 JSON 写入 `data/novels/<site>/<novelId>.json`；
6. 将作品、章节和话索引同步到 SQLite。

目录解析中的局部异常会记录到 `fetch.warnings`，不会在所有情况下让整本书丢失。没有标题、简介或任何话等关键数据时才会失败。

## 下载正文

详情页支持单话下载、章节缺失话补抓、话号范围下载、全书下载和覆盖重抓。

正文保存为：

```text
data/episodes/<site>/<novelId>/<episodeIndex>.json
data/episodes/<site>/<novelId>/_manifest.json
```

单话文件采用临时文件写入后 rename 的方式落盘。默认保留已有译文字段，重新抓取原文不会无意删除译文。

## 任务控制

后端通过并发数、请求最小间隔、单请求超时和最大重试次数控制访问节奏：

| 配置 | 默认值 | 作用 |
| --- | ---: | --- |
| `FETCH_CONCURRENCY` | 4 | 同时在途的请求数 |
| `FETCH_INTERVAL_MS` | 200 | 相邻请求发起的最小间隔 |
| `FETCH_TIMEOUT_MS` | 20000 | 单次请求超时 |
| `FETCH_MAX_RETRIES` | 3 | 可重试错误的最大重试次数 |

CLI 默认使用更保守的串行策略。不要为了提高速度无上限增加并发；请遵守目标站点条款和访问频率。

## 取消抓取

详情页的取消操作会调用后端停止接口，而不是仅关闭浏览器请求。取消后不再调度后续话，等待、重试退避和网络请求都可以被中止，已经原子写入的正文保留，下载清单和 SQLite 内容索引会校准。

接口为 `POST /api/library/:site/:novelId/fetch/stop`。

## CLI

```sh
cd novel-processor/backend
npm ci
npm run fetch -- --help
npm run fetch -- n4703ix
npm run fetch -- n4703ix --range 1-10 --out ../data/episodes
npm run fetch -- n4703ix --all --out ../data/episodes
```

CLI 不读取 HTTP API 的鉴权状态，也不会自动读取 API 的抓取参数。它是开发和修复数据用工具；不要让 CLI 与 API 同时写入同一本书。

## 相关接口

- `GET /api/sites`
- `POST /api/import`
- `GET /api/library/:site/:novelId`
- `POST /api/library/:site/:novelId/refresh`
- `GET /api/library/:site/:novelId/status`
- `GET /api/library/:site/:novelId/episodes/:index`
- `POST /api/library/:site/:novelId/fetch`
- `POST /api/library/:site/:novelId/fetch/stop`
