# novel-processor backend

Node.js + TypeScript API 服务、小说采集内核、SQLite 持久层和 AI 调用服务。

## 负责范围

- 站点解析、目录抓取和正文下载；
- 抓取并发、节奏、超时、重试和取消；
- SQLite 索引、用户、模型、翻译材料、阅读记录和任务状态；
- AT/RT 单用户鉴权和 CORS；
- Responses API / Chat Completions API 模型调用；
- 流式输出、思考等级、DeepSeek DSML、JSON 修复和失败重试；
- 初始化翻译材料、章节翻译和材料维护；
- 单话 JSON 原子写入和翻译状态同步。

服务以单实例运行。不要让多个后端进程或 CLI 同时写入同一份 SQLite 和正文目录。

## 环境要求

- Node.js 22.12.0+；
- npm；
- better-sqlite3 所需的 Python 3 和本机编译工具（Dockerfile 已安装）；
- 目标小说站点的网络访问；
- AI 功能需要可用的模型服务和 API Key。

## 源码运行

```sh
cd novel-processor/backend
npm ci
cp .env.example .env
```

源码运行时把 `/app/data` 改成本机路径：

```dotenv
APP_ENV=development
HTTP_HOST=0.0.0.0
HTTP_PORT=8080
DATA_DIR=../data
DB_PATH=../data/library.db
NOVELS_DIR=../data/novels
EPISODES_DIR=../data/episodes
AUDIT_LOG_PATH=../data/audit.log
CORS_ORIGINS=http://localhost:5175
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=请替换为自己的初始密码
AUTH_COOKIE_SECURE=auto
AUTH_COOKIE_SAMESITE=lax
```

启动：

```sh
npm run dev
```

生产源码运行：

```sh
npm run typecheck
NODE_ENV=production npm run start
```

`start` 使用 `tsx` 直接运行 TypeScript。当前 `tsx` 在开发依赖中，不能用 `npm ci --omit=dev` 后直接运行。

## Docker

从仓库根目录复制配置：

```sh
cp novel-processor/backend/.env.example novel-processor/backend/.env
```

生产至少设置：

```dotenv
CORS_ORIGINS=https://novels.example.com
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=生产环境初始密码
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
```

启动：

```sh
cd novel-processor/backend
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

默认宿主机端口 `64226`，容器内端口 `8080`。`../data` 挂载到 `/app/data`。健康检查：

```sh
curl http://127.0.0.1:64226/healthz
```

## 环境变量

完整模板见 [`.env.example`](.env.example)。

| 变量 | 作用 |
| --- | --- |
| `HTTP_HOST` / `HTTP_PORT` | API 监听地址和进程端口 |
| `API_PORT` | Compose 宿主机映射端口 |
| `DATA_DIR` / `DB_PATH` | 数据目录和 SQLite 路径 |
| `NOVELS_DIR` / `EPISODES_DIR` | 目录 JSON 和单话正文路径 |
| `AUDIT_LOG_PATH` | 管理操作审计日志 |
| `FETCH_CONCURRENCY` | 抓取并发数，默认 4 |
| `FETCH_INTERVAL_MS` | 抓取请求最小间隔，默认 200ms |
| `FETCH_TIMEOUT_MS` | 单次抓取请求超时，默认 20s |
| `FETCH_MAX_RETRIES` | 抓取重试次数，默认 3 |
| `CORS_ORIGINS` | 精确允许的浏览器 Origin，逗号分隔 |
| `AUTH_INITIAL_USERNAME` | 首次初始化用户名 |
| `AUTH_INITIAL_PASSWORD` | 首次初始化密码，只在没有用户时使用 |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | RT Cookie 策略 |

## 采集 CLI

```sh
npm run fetch -- --help
npm run fetch -- n4703ix --out ../data/novels/syosetu/n4703ix.json
npm run fetch -- n4703ix --range 1-10 --out ../data/episodes
npm run fetch -- n4703ix --all --out ../data/episodes
```

CLI 不读取 HTTP API 鉴权，也不自动使用 API 任务表。与运行中的 API 共享数据前，必须避免并发写入。

## 数据和数据库

内容文件：

```text
data/novels/<site>/<id>.json
data/episodes/<site>/<id>/<episode>.json
data/episodes/<site>/<id>/_manifest.json
data/library.db
data/audit.log
```

SQLite 使用 WAL。作品索引可以从磁盘同步；用户、模型、翻译材料、阅读状态、维护历史、翻译状态和回收站状态不能只靠 JSON 恢复。备份必须包含整个 `data/`，见 [`docs/operations/03-data-backup.md`](../docs/operations/03-data-backup.md)。

## API

服务在 `/api` 下提供鉴权、书架、采集、阅读和翻译接口。健康检查为 `/healthz`。完整接口表见 [`docs/api.md`](../docs/api.md)。

## AI 服务

模型配置由设置页面 CRUD 管理并保存到 `ai_models`：

- Responses API / Chat Completions API；
- OpenAI、DeepSeek 和 OpenCode 等兼容 Base URL；
- 明文 API Key、自定义 headers、extra body；
- `window_tokens`、`input_tokens`、`output_tokens`；
- 思考等级和 DeepSeek DSML；
- 60 分钟总时限、180 秒流式空闲时限、最多 3 次尝试；
- JSON 修复、业务校验、流式事件和失败保护。

详情见 [`docs/features/06-ai-translation.md`](../docs/features/06-ai-translation.md)。

## 测试命令

```sh
npm run typecheck
npm run test:auth
npm run test:ai
npm run test:translation
npm run test:maintenance
npm run test:reading
npm run test:download
```

测试使用临时数据库、临时正文目录和本地模拟服务，不访问真实小说站点或付费模型。
