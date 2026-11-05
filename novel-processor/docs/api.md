# HTTP API

API 由后端提供，前端通过 `VITE_API_BASE` 直接访问。业务 API 默认需要 AT；登录、刷新和健康检查除外。跨域请求需要精确的 CORS Origin、`credentials: include` 和鉴权要求的 `X-Requested-With`。

## 约定

- JSON 请求使用 `Content-Type: application/json`；
- 错误通常为 `{ "error": "可读信息" }`；
- 长任务初始化和材料维护可以返回 `application/x-ndjson`；
- 前端不使用 Vite 代理；
- API 路径包含 `/api`，Node 服务内部路由去掉前缀后处理。

## 健康与认证

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/healthz` | 服务健康检查 |
| `POST` | `/api/auth/login` | 登录，返回 AT 并设置 RT Cookie |
| `POST` | `/api/auth/refresh` | 轮换 RT 并取得新 AT |
| `GET` | `/api/auth/me` | 当前用户 |
| `POST` | `/api/auth/logout` | 注销当前会话 |
| `POST` | `/api/auth/password` | 修改密码 |

## 站点与书架

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/sites` | 支持站点及能力 |
| `GET` | `/api/stats` | 书库统计 |
| `GET` | `/api/facets` | 筛选项统计 |
| `GET` | `/api/library` | 分页查询书架 |
| `POST` | `/api/import` | 导入作品目录 |
| `POST` | `/api/sync` | 从磁盘同步索引 |
| `GET` | `/api/library/:site/:id` | 读取作品目录 |
| `POST` | `/api/library/:site/:id/refresh` | 更新目录 |
| `DELETE` | `/api/library/:site/:id` | 移入回收站 |
| `DELETE` | `/api/library/:site/:id?permanent=1` | 永久删除 |
| `POST` | `/api/library/:site/:id/restore` | 恢复作品 |
| `POST` | `/api/trash/empty` | 清空回收站 |

`GET /api/library` 支持 `q`、`site`、`status`、`genre`、`tag`、`progress`、`readingProgress`、`sort`、`trashed`、`page` 和 `limit`。

`GET /api/library/:site/:id` 的每个 `episodes` 项包含 `translatedTitle`：已有译文时为中文标题，未翻译或标题不可用时为 `null`；原文标题仍保留在 `title`，目录文件不会被修改。

## 正文下载

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/library/:site/:id/status` | 下载状态和任务快照 |
| `GET` | `/api/library/:site/:id/episodes/:index` | 单话正文 |
| `POST` | `/api/library/:site/:id/fetch` | 下载正文，可传 `range`、`all`、`overwrite`、`concurrency` |
| `POST` | `/api/library/:site/:id/fetch/stop` | 停止抓取 |

## 阅读状态

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/library/:site/:id/reading` | 阅读状态和汇总 |
| `PUT` | `/api/library/:site/:id/reading` | 更新 episode、chapter、book 或 range 状态 |

状态为 `unread`、`reading` 或 `read`。范围包含起止话号。

## AI 模型

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/settings/models` | 模型列表 |
| `POST` | `/api/settings/models` | 新增模型 |
| `GET` | `/api/settings/models/:id` | 单个模型 |
| `PUT` | `/api/settings/models/:id` | 修改模型 |
| `DELETE` | `/api/settings/models/:id` | 删除模型 |
| `POST` | `/api/settings/models/:id/test` | 测试调用 |

模型字段包括 `provider`、`apiType`、`baseUrl`、`apiKey`、`model`、`headers`、`extraBody`、Token 上限、响应适配和思考等级。

## 翻译

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/library/:site/:id/translation/initialize` | 读取初始化材料 |
| `POST` | `/api/library/:site/:id/translation/initialize` | 生成初始化材料，可 NDJSON 流式返回 |
| `GET` | `/api/library/:site/:id/translation/episodes` | 章节翻译状态和任务快照 |
| `POST` | `/api/library/:site/:id/translation/episodes` | 启动串行章节翻译 |
| `POST` | `/api/library/:site/:id/translation/episodes/stop` | 停止章节翻译 |
| `GET` | `/api/library/:site/:id/translation/maintenance` | 材料、重复组和历史 |
| `POST` | `/api/library/:site/:id/translation/maintenance/preview` | 生成维护预览，可 NDJSON 流式返回 |
| `POST` | `/api/library/:site/:id/translation/maintenance/apply` | 应用预览 |
| `POST` | `/api/library/:site/:id/translation/maintenance/restore` | 恢复历史材料 |

## HTTP 状态

| 状态 | 典型含义 |
| ---: | --- |
| 400 | 参数或模型配置无效 |
| 401 | 缺少或失效 AT |
| 403 | CORS Origin 或权限不允许 |
| 404 | 资源不存在 |
| 409 | 任务互斥、版本冲突、回收站状态或文件缺失 |
| 429 | 登录/模型请求频率限制 |
| 500 | 服务端内部错误 |
| 504 | 上游模型或网络超时 |

## 流式事件

初始化和材料维护使用 NDJSON，每行一个 JSON 事件。常见事件包括 `started`、`phase`、`attempt`、`heartbeat`、流式输出事件、`retry`、`completed` 和 `error`。客户端应逐行解析、保留已经收到的事件，并在连接断开后通过 GET 接口确认最终保存状态。
