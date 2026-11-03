# 系统架构与数据边界

## 分层

```text
Vue 前端 / PWA
        │ HTTPS API、鉴权、任务流
        ▼
Node HTTP API
  ├── Library API / Auth / SQLite
  ├── AI 服务：OpenAI SDK + 流式 / 重试 / JSON 修复
  └── NovelLibrary
        ├── Pipeline：分页、合并、归章、富化
        ├── SiteAdapter：站点解析
        ├── HttpClient：并发、节奏、超时、重试
        └── EpisodeStore：文件系统 JSON
```

前端不直接抓站点，后端也不把小说正文作为 SQLite 大字段保存。

## JSON 与 SQLite

- `data/novels`：目录和作品元数据；
- `data/episodes`：单话正文、后记、前言和可选译文；
- SQLite：索引、登录用户、模型、翻译材料、翻译任务、阅读状态、回收站和维护历史。

SQLite 的作品索引可由磁盘内容同步，但用户和翻译状态不能由 JSON 完整重建。

## HTTP 服务

`backend/src/main.ts` 创建单实例 Node HTTP 服务：

1. CORS 处理；
2. 健康检查；
3. 登录和刷新；
4. AT 鉴权；
5. 将 `/api` 请求交给 `server/libraryApi.ts`；
6. 统一错误响应。

长任务使用内存任务表和 SQLite 状态组合。后端重启会中断内存中的任务，因此生产升级前要等待任务结束。

## 任务互斥

同一本书的正文抓取、翻译初始化、材料维护和章节翻译不能并发写入。单话翻译成功后先写入 JSON，再在 SQLite 中保存状态和报告；失败保留旧译文。

## 版本和迁移

数据库启动时执行建表和补列式迁移，并使用 WAL。代码更新前应备份 `data/`。前端是 Vite 静态构建，生产部署必须重新构建并上传完整 `dist/`。
