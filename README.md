# novel-processor

<p>
  <img src="./novel-processor/frontend/public/app-icon.svg" width="88" height="88" alt="novel-processor 书本图标" />
</p>

个人小说采集、整理、阅读与 AI 翻译工作台。

[![Version](https://img.shields.io/badge/version-v1.0.0-6a9ecd)](https://github.com/Chiyoshic/novel-processor/releases)
[![License](https://img.shields.io/badge/license-MIT-79c2ac)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-339933)](#requirements)
[![Frontend](https://img.shields.io/badge/frontend-Vue%203%20%2B%20TypeScript-42b883)](./novel-processor/frontend)
[![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript-339933)](./novel-processor/backend)
[![SQLite](https://img.shields.io/badge/storage-SQLite%20%2B%20JSON-003b57)](#storage)
[![PWA](https://img.shields.io/badge/PWA-supported-8950ce)](./novel-processor/docs/pwa.md)

> 本文面向 **v1.0.0**。当前内置小説家になろう（Syosetu）适配器，其他小说站点可以按照站点适配器契约扩展。正式版本与更新说明以 [Releases](https://github.com/Chiyoshic/novel-processor/releases) 为准。

## 目录

- [项目介绍](#overview)
- [主要功能](#features)
- [技术栈与运行架构](#architecture)
- [项目结构](#structure)
- [环境要求](#requirements)
- [快速开始：Docker 后端 + 本地前端](#quickstart)
- [配置说明](#configuration)
- [本地源码开发与 CLI](#development)
- [AI 模型配置与翻译使用](#ai)
- [生产部署](#deployment)
- [数据、存储和备份](#storage)
- [API 概览](#api)
- [PWA 和 Apple 主屏幕](#pwa)
- [测试与验证](#testing)
- [扩展新的小说站点](#adapters)
- [常见问题](#faq)
- [贡献与反馈](#contributing)
- [合规与使用边界](#boundaries)
- [升级与版本发布](#releases)
- [文档索引](#documentation)
- [开源协议](#license)

<a id="overview"></a>
## 项目介绍

`novel-processor` 是一个面向个人阅读整理的小说工作台。它把小说目录、正文、阅读状态、翻译材料和译文组织到同一个本地书库中，提供浏览器界面和后端服务：

- 从支持的小说站点抓取目录和正文；
- 在书架中搜索、筛选和管理作品；
- 使用连续书页式阅读器阅读原文或译文；
- 记录原文与译文共用的阅读进度；
- 使用 OpenAI 兼容 API、Responses API 或 Chat Completions API 调用自定义模型；
- 为整本小说建立翻译基线，再按话串行翻译；
- 维护角色译名、别名、术语和语言风格；
- 通过 PWA 安装到手机或桌面；
- 将数据保存在本地 JSON、SQLite 和审计日志中，方便备份和迁移。

项目定位是个人书库和个人阅读整理工具。它不提供公共内容分发服务，也不开放注册系统。

文中“章”是目录分组（chapter），“话”是具有独立正文的单个 episode；下载、翻译、阅读记录以及初始化采样均以“话”为主要单位。

<a id="features"></a>
## 主要功能

### 小说采集

- 支持作品 URL 或作品 ID（ncode）输入。
- 当前内置 `syosetu` 适配器，支持小説家になろう普通站点及预留的 R18 变体解析。
- 抓取目录、章节、话标题、发布时间、作品简介、作者、状态、标签和字数等元数据。
- 目录分页、站点 API 富化、正文解析和本地文件落盘分层处理。
- 支持按话号、话号范围或全书批量下载。
- 默认跳过已经保存的正文，支持覆盖重抓。
- 抓取过程有并发数、请求间隔、超时和重试配置。
- 抓取中可以由服务端真正取消任务，已经落盘的正文不会被清除。

### 书架与作品管理

- 按标题、作者、站点、连载状态、标签、下载进度和阅读进度筛选。
- 下载进度和阅读进度分别展示。
- 阅读进度使用按话排列的红、黄、绿状态条表达未读、在读和已读。
- 支持作品移入回收站、恢复和永久删除。
- 支持从磁盘重建 SQLite 索引。
- 作品卡片提供“开始阅读”和“继续阅读”入口。
- 详情页显示目录、下载状态、翻译状态和阅读状态。

### 阅读器

- 原文与中文译文切换。
- 语义化 `article`、段落和章节结构，为 Safari 阅读器模式和打印提供内容结构；是否显示阅读器入口由 Safari 判断。
- 支持字号、字距、行距、段距、背景色和文字颜色调整。
- 使用 Noto Serif SC / Noto Serif JP 营造书页式阅读体验。
- 人物信息可以在正文中轻量标记，桌面端悬浮、移动端点击查看人物简介。
- 原文和译文共用同一套阅读状态记录。
- 阅读到正文末尾后点击下一话，可以自动将当前话标记为已读。
- 支持按话、章、全书或起止话号范围手动编辑阅读状态。
- 目录支持展开全部、折叠全部及“折叠已读”临时视图，保留首个未读话之前的两话，不改变原书章节结构。

### AI 翻译流程

翻译按两个阶段组织：

1. **初始化材料**：选择作品简介、前言和前若干话正文，生成整本书的中文书名、剧情梗概、角色译名、角色别名、语言风格、术语和翻译规则。
2. **章节翻译**：选择要翻译的话，按目录顺序串行翻译，使用初始化材料和最近已翻译话作为上下文。

相关能力包括：

- 支持 OpenAI Responses API 和 Chat Completions API；
- 支持 OpenAI、DeepSeek 和无思考模式的思考等级配置；
- 支持自定义 Base URL、API Key、模型名、请求头和扩展请求体；
- 支持 `window_tokens`、`input_tokens`、`output_tokens` 配置；
- 流式输出和详细任务面板；
- 总任务时限、单次请求空闲时限和有界重试；
- JSON 修复、字段校验和失败原因记录；
- 模型输出中的翻译材料 CRUD 修改指令；
- 非法材料修改逐条忽略并记录警告，不让有效译文整体失败；
- 译文以 `translation` 字段追加到原话 JSON，不覆盖原文；
- 每话记录翻译状态、模型、重试次数、源内容哈希和材料变更报告；
- 支持章节翻译前载入最近若干话译文，统一上下文文风和译名；
- 支持材料重复检查、AI 合并和压缩总结；
- 支持导出结构化翻译材料 JSON。

### 主题、移动端与 PWA

- 日间、夜间和跟随系统三种主题。
- 手机优先布局，适配移动浏览器和桌面浏览器。
- 书架、目录、详情、阅读器和 AI 翻译页面均适配移动端。
- 支持 Apple Touch Icon、PWA manifest、maskable 图标和 monochrome 图标。
- Service Worker 只缓存应用壳和静态资源，不缓存登录令牌、小说正文或 AI 流式请求。

<a id="architecture"></a>
## 技术栈与运行架构

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vue Router、Vite |
| 后端 | Node.js、TypeScript、原生 HTTP Server |
| 数据库 | SQLite、better-sqlite3 |
| AI | OpenAI Node SDK，兼容 Responses / Chat Completions |
| 页面 | CSS 变量主题、移动优先响应式布局 |
| PWA | vite-plugin-pwa、Workbox |
| 内容存储 | 目录和单话正文使用 JSON 文件 |
| 测试 | Node test runner、TypeScript 类型检查、Vite production build |
| 部署 | Docker Compose、静态站点、Nginx / 宝塔 |

```text
Vue 前端 / PWA
    │ HTTPS：鉴权、JSON API、初始化与维护流式输出、翻译任务状态
    ▼
Node.js API（单实例）
    ├── 站点适配器 → 目录 / 正文抓取 → JSON 文件
    ├── SQLite → 作品索引 / 用户 / 模型 / 翻译材料 / 阅读记录
    └── AI 调用封装 → Responses / Chat Completions → 自定义模型服务
```

前端不直接抓取小说站点，不通过 Vite 中间件提供后端 API。线上运行需要独立 API 服务；只发布前端 `dist/` 不能替代后端。

<a id="structure"></a>
## 项目结构

```text
novel-processor/
├── README.md                       # 项目总说明
├── LICENSE                         # MIT License
├── AGENTS.md                       # 项目协作与界面设计约定
└── novel-processor/
    ├── frontend/                   # Vue 前端
    │   ├── src/
    │   │   ├── components/         # 全局组件、书架、目录、翻译和阅读器组件
    │   │   ├── views/              # 页面级路由视图
    │   │   ├── lib/                # API、阅读器偏好、主题和通用逻辑
    │   │   ├── api.ts              # 类型化 API 客户端
    │   │   └── style.css           # 全局设计令牌和主题样式
    │   ├── public/                 # 图标、PWA 素材和 Apple 图标
    │   ├── scripts/                # 构建图标及前端测试脚本
    │   ├── .env.example
    │   └── vite.config.ts
    ├── backend/                    # Node.js API 服务和采集内核
    │   ├── src/
    │   │   ├── lib/                # 采集门面、流水线和站点适配器
    │   │   ├── storage/            # 文件系统正文存储
    │   │   ├── ai.ts               # OpenAI 兼容模型调用、流式、重试和超时
    │   │   ├── translation.ts      # 初始化材料提示词和流程
    │   │   └── episode-translation.ts
    │   ├── server/                 # HTTP API、SQLite、鉴权和任务服务
    │   ├── scripts/                # CLI、测试和离线验证
    │   ├── .env.example
    │   ├── Dockerfile
    │   └── docker-compose.yml
    ├── shared/                     # 前后端共享类型和领域逻辑
    ├── deploy/nginx/               # Nginx SPA 回退配置
    ├── data/                       # 本地运行时数据，不提交到 Git
    └── docs/                       # 专题设计、接口和部署文档
```

更完整的采集分层和数据模型说明见 [`docs/architecture.md`](./novel-processor/docs/architecture.md)。

<a id="requirements"></a>
## 环境要求

### 必需环境

- Git；
- Node.js **22.12.0 或更高版本**，推荐使用 Node.js 22 LTS；
- npm；
- Docker Engine 和 Docker Compose（后端采用 Docker 部署时）；
- 可读写的本地数据目录；不需要单独安装数据库服务；
- 支持的小说站点网络访问权限。

后端依赖 `better-sqlite3`，要求 Node.js `>=22`；前端 Vite 要求 Node.js `^20.19.0` 或 `>=22.12.0`。因此整个项目统一使用 **22.12.0+**，不要使用低于该版本的 Node.js 22。

`better-sqlite3` 和图标生成用的 `sharp` 包含原生依赖。没有可用预编译包时需要 Python 3 和本机编译工具（Linux 通常为 `make` / `g++`，macOS 为 Command Line Tools）。Dockerfile 已安装后端构建所需工具。

### 可选环境

- OpenAI、DeepSeek、OpenCode 或其他 OpenAI 兼容模型服务；
- HTTPS 域名和 Nginx；
- iPhone / iPad 或支持 PWA 的浏览器，用于主屏幕安装。

<a id="quickstart"></a>
## 快速开始：Docker 后端 + 本地前端

项目代码位于仓库中的 `novel-processor/` 子目录。**各独立小节的命令从包含本 README、LICENSE 和 AGENTS.md 的 Git 仓库根目录开始执行；有 `cd` 时，该小节后续命令沿用切换后的目录。根目录没有 `package.json`，不要直接在根目录运行 `npm install` 或 `npm run dev`。**

此方案使用 Docker 运行后端，使用本机 Node.js 运行前端。已有环境文件时请编辑，不要重复复制覆盖原配置。

### 1. 获取源码

```sh
git clone https://github.com/Chiyoshic/novel-processor.git
cd novel-processor
```

`v1.0.0` 正式发布后，可检出对应标签以固定部署版本：

```sh
git checkout v1.0.0
```

### 2. 启动后端

复制后端环境变量文件：

```sh
cp novel-processor/backend/.env.example novel-processor/backend/.env
```

编辑 `novel-processor/backend/.env`，保留模板中的 `/app/data` 容器路径，至少设置初始密码和前端来源：

```dotenv
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=请设置一个只放在服务端的初始密码
CORS_ORIGINS=http://localhost:5175
```

启动 API 服务：

```sh
cd novel-processor/backend
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

默认地址：

```text
API:    http://127.0.0.1:64226
健康检查: http://127.0.0.1:64226/healthz
```

验证服务：

```sh
curl http://127.0.0.1:64226/healthz
```

返回 `{"ok":true,"service":"novel-processor-api"}` 即表示后端已经启动。

### 3. 启动前端

新开一个终端，从 **Git 仓库根目录**执行：

```sh
npm --prefix novel-processor/frontend ci
cp novel-processor/frontend/.env.example novel-processor/frontend/.env
```

编辑 `novel-processor/frontend/.env`：

```dotenv
VITE_API_BASE=http://localhost:64226/api
```

启动开发服务器：

```sh
npm --prefix novel-processor/frontend run dev -- --host localhost --port 5175 --strictPort
```

打开 `http://localhost:5175/`，使用后端配置的账号登录。这里固定开发端口，确保它与 CORS 一致；若要换端口，请同时修改后端 `CORS_ORIGINS`。

**浏览器端请统一使用 `localhost`，不要把前端的 `localhost` 与 API 的 `127.0.0.1` 混用**，否则默认 SameSite Cookie 策略可能影响刷新登录。`curl` 健康检查使用 `127.0.0.1` 不受此限制。

前端不使用 Vite 代理。`VITE_API_BASE` 必须是完整的 HTTP/HTTPS 地址，并且这个值会在构建时写入静态产物。修改后必须重新构建前端。

### 4. 首次登录

首次启动时，后端在 SQLite 尚无用户时创建 `AUTH_INITIAL_USERNAME` 对应的用户。之后修改密码不会被重启覆盖，初始密码也不会重新写入。

当前鉴权是单用户模式：

- 不开放注册；
- Access Token 只保存在前端内存；
- Refresh Token 使用 HttpOnly Cookie；
- Access Token 默认 15 分钟有效；
- Refresh Token 会轮换，默认会话绝对寿命 30 天；
- 修改密码会撤销所有已有会话。

登录密码使用带随机盐的 scrypt 哈希保存，数据库中的 AT/RT 也只保存哈希；这与模型 API Key 的明文存储策略不同。初始密码要求 8–128 个字符，推荐使用独立的高强度密码。

详细说明见 [`docs/auth.md`](./novel-processor/docs/auth.md)。

<a id="configuration"></a>
## 配置说明

### 后端环境变量

配置模板位于 [`backend/.env.example`](./novel-processor/backend/.env.example)。下表的默认值指代码未配置时的值；Docker 模板显式使用 `/app/data`。相对路径按后端进程的当前工作目录解析。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_ENV` | `development` | 运行环境标识 |
| `HTTP_HOST` | `0.0.0.0` | API 监听地址 |
| `HTTP_PORT` | `8080` | API 进程端口；Docker 时为容器内端口 |
| `API_PORT` | `64226`（Compose） | Docker 映射到宿主机的端口，源码直跑不读取它 |
| `DATA_DIR` | `./data` | 数据目录；Docker 模板为 `/app/data` |
| `DB_PATH` | `<DATA_DIR>/library.db` | SQLite 路径 |
| `NOVELS_DIR` | `<DATA_DIR>/novels` | 作品目录 JSON 路径 |
| `EPISODES_DIR` | `<DATA_DIR>/episodes` | 单话正文 JSON 路径 |
| `AUDIT_LOG_PATH` | `<DATA_DIR>/audit.log` | 删除和管理操作审计日志 |
| `FETCH_CONCURRENCY` | `4` | 抓取并发数 |
| `FETCH_INTERVAL_MS` | `200` | 抓取请求最小间隔 |
| `FETCH_TIMEOUT_MS` | `20000` | 单次抓取请求超时 |
| `FETCH_MAX_RETRIES` | `3` | 抓取请求最大重试次数 |
| `CORS_ORIGINS` | 空 | 允许的前端 Origin，多个值用逗号分隔 |
| `AUTH_INITIAL_USERNAME` | `chiyoshi` | 首次初始化用户名 |
| `AUTH_INITIAL_PASSWORD` | 空 | 首次初始化密码，必须通过私有环境变量设置 |
| `AUTH_COOKIE_SECURE` | `auto` | HTTPS 自动启用 Secure Cookie |
| `AUTH_COOKIE_SAMESITE` | `lax` | Refresh Cookie 的 SameSite 策略 |
| `ENV_FILE` | `<工作目录>/.env` | 可指定其他后端环境文件路径 |

已有进程环境变量优先于 `.env`；空值通常回退到代码默认值。模板中的 CORS 域名只是示例，部署时必须替换。`CORS_ORIGINS` 需要完整 Origin，不带路径或结尾 `/`，不能使用 `*`。

生产环境不要把 `AUTH_INITIAL_PASSWORD`、模型 API Key 或其他凭据提交到 Git，也不要写入前端环境变量。后端环境配置改变后需要重启进程；Docker 环境用 `docker compose up -d` 更新容器，修改代码则加 `--build`。

### 前端环境变量

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | `https://api.example.com/api` | 浏览器直接访问的后端 API 根地址 |

前端 API 地址必须使用绝对 URL。HTTPS 前端应配置 HTTPS API。后端 `CORS_ORIGINS` 必须包含前端完整 Origin，例如 `https://novels.chiyoshi.cn`。

<a id="development"></a>
## 本地源码开发与 CLI

### 后端不使用 Docker 运行

如果本机已经安装 Node.js 22.12.0+ 和编译工具，可以直接运行：

```sh
cd novel-processor/backend
npm ci
cp .env.example .env
# 按下方说明修改 .env，然后启动
npm run dev
```

**不要直接沿用 Docker 模板的 `/app/data` 路径。** 将 `backend/.env` 中对应配置改为下面的本机路径（以下内容是在已有文件中替换，不是追加重复项）：

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
AUTH_INITIAL_PASSWORD=请替换为你自己的初始密码
AUTH_COOKIE_SECURE=auto
AUTH_COOKIE_SAMESITE=lax
```

后端从 `novel-processor/backend/` 启动时，上述路径对应应用目录下的 `novel-processor/data/`，与 Docker 的默认宿主机挂载位置一致。**不要同时启动 Docker 后端和源码后端访问这份数据。**

后端监听 8080，此时前端使用：

```dotenv
VITE_API_BASE=http://localhost:8080/api
```

`0.0.0.0` 允许其他设备访问 API；仅本机使用时可以改为 `127.0.0.1`。两者都不是应填写到浏览器 API URL 中的通用主机名；浏览器仍使用前后端一致的 `localhost` 或实际域名。

### 前端开发

```sh
cd novel-processor/frontend
npm ci
cp .env.example .env
# 编辑 .env，设置 VITE_API_BASE=http://localhost:8080/api
npm run dev -- --host localhost --port 5175 --strictPort
```

常用命令：

```sh
npm run typecheck   # Vue + TypeScript 类型检查
npm run build       # 生成生产构建和 PWA 资源
npm run preview     # 预览 dist
```

### 抓取 CLI

后端提供调试用的采集 CLI。它和 HTTP API 使用同一套采集门面、站点适配器和文件存储抽象。

```sh
cd novel-processor/backend
npm ci

# 抓取目录到应用数据目录（--out 路径相对 backend/）
npm run fetch -- https://ncode.syosetu.com/n4703ix/ --out ../data/novels/syosetu/n4703ix.json

# 抓取指定话
npm run fetch -- n4703ix --episode 1 --out ../data/episodes

# 抓取范围
npm run fetch -- n4703ix --range 1-10 --out ../data/episodes

# 抓取全书正文
npm run fetch -- n4703ix --all --out ../data/episodes

# 覆盖已经存在的正文
npm run fetch -- n4703ix --range 1-10 --overwrite --out ../data/episodes
```

更多参数：

```sh
npm run fetch -- --help
```

CLI 使用独立参数，不自动读取 API 的 `.env` 配置。没有 `--out` 时，默认输出到 **`backend/data/`**，不是 Compose 挂载的数据目录。上面的命令已显式指向应用数据目录；完成后通过页面“重建索引”同步，或重启后端触发启动同步。不要在 API 正写入同书内容时运行 CLI。

CLI 默认偏向低速、串行抓取；请根据目标站点条款和网络状况谨慎调整并发与间隔。CLI 是本地调试工具，运行它不会经过 HTTP 登录鉴权。

<a id="ai"></a>
## AI 模型配置与翻译使用

登录后进入“设置 → 模型管理”，可以创建、编辑、删除和测试模型。模型配置存储在 SQLite 的 `ai_models` 表中，API Key 按当前单用户部署需求以明文保存；请限制 `data/` 目录权限并做好备份保护。

支持的关键配置包括：

| 配置 | 说明 |
| --- | --- |
| Provider | `openai-compatible`、`deepseek`、`opencode` 等兼容服务标识 |
| Base URL | OpenAI 兼容 API 根地址，不填写 `/chat/completions` 或 `/responses` 后缀 |
| API 协议 | Responses API 或 Chat Completions API |
| Model | 服务端模型 ID |
| Reasoning Dialect | 无、OpenAI 或 DeepSeek |
| Reasoning Level | `default`、`off`、`minimal`、`low`、`medium`、`high`、`xhigh`；具体可用等级取决于方言 |
| Window Tokens | 上下文窗口，例如 `1050000` |
| Input Tokens | 输入上限，例如 `922000` |
| Output Tokens | 输出上限，例如 `128000` |
| Headers | 自定义 HTTP 请求头 |
| Extra Body | 传给模型服务的扩展 JSON 参数 |
| Response Profile | 通用、DeepSeek、自动或关闭响应适配 |

DeepSeek DSML 或思考字段由后端根据模型配置适配。模型配置修改后，新的翻译任务会读取最新配置；已经运行的任务使用启动时的配置快照。

思考等级会按方言限制：DeepSeek 当前提供 `default / off / low / high`，无思考方言提供 `default / off`。配置项不代表上游模型一定支持；请按实际供应商选择 API、等级和 Token 上限。表中的百万 Token 数值只是示例，不是所有模型的能力承诺。

### 从一本书开始翻译

1. 在书架中输入作品地址或 ncode，导入目录。
2. 进入作品详情，下载计划翻译的话；初始化取样范围的正文也必须先下载。
3. 在设置中添加并测试模型。
4. 从作品详情进入 **AI 翻译 → 初始化材料 → 创建任务**。
5. 选择模型、前多少话、是否包含简介/前言，填写翻译要求并生成材料。
6. 在 **浏览材料** 检查中文书名、角色、别名、文风和术语。人物材料可能包含采样范围内的剧透。
7. 切换 **章节翻译**，逐话、按范围或按“从最小未译话号开始的 N 话”选择。
8. 设置参考译文数量后开始翻译。默认参考前面最近 1 话有效译文，可设为 **0–50**；0 表示不附带参考译文。
9. 在任务面板查看当前话、耗时、尝试次数、流式输出和警告；完成后从目录的翻译图标进入译文。

每话使用最新初始化材料和参考译文，成功后的材料增补会用于后续话。参考内容会计入输入预算；预算不足时提示减少参考话数或更换配置，不静默截断原文或参考译文。

### 材料维护

- **匹配检查**：根据现有名称/别名等规则找出疑似重复组。
- **AI 检查 / 合并**：让模型识别和综合重复项，不是简单拼接或删除。
- **AI 压缩总结**：按选中模块压缩重复描述和说明，保留重要译名、别名及规则；目标体积是软目标。
- **预览后应用**：维护先生成预览，经确认才写入 SQLite；材料已被其他操作改变时拒绝覆盖旧版本。
- **历史恢复**：应用和恢复前均备份当前材料，可以恢复此前版本；不会自动重写已有译文。

初始化和维护属于请求关联任务，离开页面、刷新或断开请求可能取消生成；单纯切换初始化区内的二级 tab 会保留状态。**章节批量翻译则由后端执行，刷新或离开页面不停止，需点击停止按钮取消。** 不要将两者的任务生命周期混为一谈。

### AI 任务可靠性

AI 调用默认具备以下保护：

- 每次生成（包含其重试）的总时限默认 60 分钟，不是整本书批次总共只能运行 60 分钟；
- 单次非流式请求或流式首事件 / 空闲事件时限默认 180 秒；
- 流式输出持续产生事件时不会因为固定 180 秒而被中断；
- 网络错误、限流、服务端错误和超时进行有界重试；
- 最多 3 次调用，指数退避并遵守服务端 `Retry-After`；
- 模型返回 JSON 时先修复，再进行业务字段校验；
- 失败任务保留原有翻译材料和旧译文；
- 每次调用展示时间、重试次数、阶段、流式输出和失败原因。

同一本书的初始化、材料维护和章节翻译互斥；相关写入任务也会与抓取冲突。章节批量翻译中单话失败不会回滚此前成功内容，后端重启会将未完成状态标记为中断，需要重新选择继续。

模型连接测试、初始化、翻译、维护及自动重试均可能产生供应商计费；前文参考话数越多，输入消耗通常越大。项目没有内置统一的费用结算或余额限制，请通过供应商侧设置预算，并从少量章节开始确认效果。

<a id="deployment"></a>
## 生产部署

推荐把前端静态文件和后端 API 分开部署：

```text
浏览器
  ├── https://novels.example.com        → Nginx 静态站点 → frontend/dist
  └── https://api.example.com/api       → Nginx 反向代理 → 单实例 Node API :64226
```

### 生产构建前端

```sh
cd novel-processor/frontend
npm ci

cat > .env <<'EOF'
VITE_API_BASE=https://api.example.com/api
EOF

npm run build
```

将完整 `dist/` 上传到静态站点根目录。不要只上传 `index.html` 或单个哈希资源，PWA 需要同时部署：

- `index.html`；
- `assets/`；
- `sw.js`；
- `workbox-*.js`；
- `manifest.webmanifest`；
- `apple-touch-icon.png`；
- `icons/`。

上面的 `.env` 写入命令适用于首次配置，已有配置时请直接编辑。也可以用 `.env.production` 为生产构建单独配置；同名 shell 环境变量和 `.env.production` 的值可能覆盖 `.env`，排查 API 地址时需要一起检查。

### 部署后端

```sh
cd novel-processor/backend
cp .env.example .env
# 编辑 .env，配置生产域名、初始密码、CORS 和数据路径
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

生产环境部署新版代码前，请先确认没有正在执行的长时间 AI 翻译任务；重启后端会中断进行中的内存任务。

Compose 默认把 `novel-processor/data/` 挂载到 `/app/data`，容器内监听 8080，宿主机映射 64226。不要只复制 `backend/` 构建：镜像需要同级 `shared/`，Compose 已将应用目录设为构建上下文。

如果 Nginx 与 Docker 在同一台主机，建议将 Compose 的 `ports` 限制为回环地址，再用 HTTPS 代理公开服务：

```yaml
ports:
  - "127.0.0.1:${API_PORT:-64226}:${HTTP_PORT:-8080}"
```

#### 不使用 Docker 的生产运行

也可以按上面的源码开发步骤安装依赖，改好生产 `.env` 后运行：

```sh
cd novel-processor/backend
npm ci
npm run typecheck
NODE_ENV=production npm run start
```

后端通过 `tsx` 直接运行 TypeScript，没有后端 `npm run build` 脚本。当前 `tsx` 位于开发依赖中，因此不要使用 `npm ci --omit=dev` 后直接运行 `npm start`。需要守护运行时使用 systemd 等进程管理器，固定工作目录为 `backend/`、以可读写数据目录的非 root 用户单实例启动，并将标准输出纳入日志管理。

### API 的 HTTPS 反向代理

为前端和 API 域名分别配置证书与 HTTPS。以下是 **API 域名现有 HTTPS `server {}` 内**的反向代理片段，不是完整的 TLS 站点配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:64226;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 初始化和维护会流式返回；不要缓冲到整个请求结束。
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3700s;
    proxy_send_timeout 3700s;
}
```

保留请求原路径：浏览器请求 `/api/...`，后端也必须收到 `/api/...`。若使用源码运行的 8080 端口，请相应修改 upstream。CDN、网关或其他代理如有更短的连接时限，也需要调整或绕过，单改应用的 60 分钟时限不能覆盖外部代理限制。

### Nginx SPA 路由回退

前端使用 Vue Router History 模式。在 **前端静态站点**的 `server {}` 内将 `root` 指向部署的 `frontend/dist/` 内容，并配置：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location = /index.html {
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

location = /sw.js {
    try_files $uri =404;
    default_type application/javascript;
    add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    add_header Service-Worker-Allowed "/" always;
}

location = /manifest.webmanifest {
    try_files $uri =404;
    types { }
    default_type application/manifest+json;
    add_header Cache-Control "no-cache" always;
}
```

缺少 `try_files` 时，刷新 `/settings`、作品详情、翻译页或阅读器会出现 404。API 反向代理与前端 SPA 回退属于不同站点，不要把两段 `location /` 重复放入同一个 `server`。

项目提供宝塔伪静态配置：[`deploy/nginx/baota-spa.conf`](./novel-processor/deploy/nginx/baota-spa.conf)。已有 `location` 时修改原块，不要重复添加；已有安全文件限制、TLS 和证书验证规则应保留。Nginx 在 location 中设置 `add_header` 会影响上层响应头继承，已有 HSTS 等安全头需在合适位置保留，宝塔示例已作处理。

修改后检查并平滑重载：

```sh
nginx -t && nginx -s reload
```

不要使用全局 `error_page 404 /index.html` 代替 `try_files`，否则缺失的 JS、CSS 或图片也会被错误地返回 HTML。

详细说明见 [`docs/frontend-deployment.md`](./novel-processor/docs/frontend-deployment.md)。

### CORS 和鉴权检查

后端配置示例：

```dotenv
CORS_ORIGINS=https://novels.example.com
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAMESITE=lax
```

如果前端和 API 位于完全不同的主站点，浏览器可能限制第三方 Cookie。此时应优先通过同站点反向代理提供 `/api`，或者确认浏览器支持并正确配置 `AUTH_COOKIE_SAMESITE=none` 与 `AUTH_COOKIE_SECURE=true`。

生产验证：

```sh
curl -I https://api.example.com/healthz
curl -I https://novels.example.com/settings
curl -I https://novels.example.com/manifest.webmanifest
curl -I https://novels.example.com/sw.js
# 缺失构建资源应返回 404，不能返回 index.html：
curl -I https://novels.example.com/assets/not-existing.js
```

前四项应返回 200，缺失资源应返回 404；SW 应为 JavaScript，manifest 应为 `application/manifest+json`。然后在浏览器验证登录、刷新恢复登录、深层页面刷新、前进/后退、初始化流式输出和译文阅读。

<a id="storage"></a>
## 数据、存储和备份

运行时数据位于 `novel-processor/data/`，该目录已被 Git 和 Docker 构建上下文排除。

```text
data/
├── library.db             # SQLite 索引、登录、模型、阅读记录、翻译状态和翻译材料
├── library.db-wal         # SQLite WAL，服务运行时可能存在
├── library.db-shm         # SQLite 共享内存文件，服务运行时可能存在
├── audit.log              # 删除、恢复和其他管理操作审计日志
├── novels/
│   └── syosetu/<id>.json  # 作品目录和元数据
└── episodes/
    └── syosetu/<id>/
        ├── _manifest.json
        └── <episode>.json # 单话正文和可选 translation 字段
```

数据分为两类：

- JSON 目录和单话正文是可读的内容真源；
- SQLite 是作品索引和用户状态存储。

SQLite 中包含不能仅靠 JSON 完整重建的数据，例如：

- 登录用户和会话；
- 自定义模型配置；
- 翻译初始化材料；
- 翻译任务状态和维护历史；
- 阅读状态；
- 回收站状态。

**不要删除 `library.db` 来“重建索引”**。页面的重建操作只同步目录与正文索引，不会替你恢复用户状态。数据库启动时执行非破坏性建表/补列迁移，升级前仍应备份。

因此备份必须包含整个 `data/` 目录，不能只复制 `data/novels` 或 `data/episodes`。建议等待在途任务结束后停止后端，再复制整份数据，以保证 SQLite 和 JSON 一致。下面的备份写入仓库外，避免私有书库归档意外提交：

```sh
(
set -eu
umask 077
BACKUP_DIR="$HOME/novel-processor-backups"
ARCHIVE="$BACKUP_DIR/data-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$BACKUP_DIR"
(cd novel-processor/backend && docker compose stop api)
tar -czf "$ARCHIVE" -C novel-processor data
tar -tzf "$ARCHIVE" > /dev/null
(cd novel-processor/backend && docker compose start api)
printf 'Backup: %s\n' "$ARCHIVE"
)
```

脚本在归档失败时停止，服务可能保持停止状态；先排查并确认备份情况，再手动启动，不要把失败的文件视为有效备份。

恢复时停止后端，先把当前 `data/` 备份到仓库外，再将目标备份完整恢复到 `novel-processor/data/`，校验目录权限后启动。不要把两套数据直接合并，也不要单独遗漏 SQLite WAL/SHM 文件。使用自定义路径时，按实际 `.env` 备份所有对应目录。

迁移主机时还应安全迁移后端 `.env`；它不在数据归档中。模型 API Key 在数据库中是明文，归档也视为敏感文件，不要公开上传。阅读器字号、背景等偏好保存在当前浏览器本地，不属于服务端数据备份。

不要同时启动多个后端实例访问同一份 SQLite 和 JSON 数据。

<a id="api"></a>
## API 概览

API 默认挂在 `/api` 下。除健康检查、登录和刷新接口外，业务接口需要有效 AT。

### 登录与会话

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 用户名/密码登录，返回 AT 并设置 RT Cookie |
| `POST` | `/api/auth/refresh` | 使用 RT Cookie 轮换令牌并取得新 AT |
| `GET` | `/api/auth/me` | 查询当前用户 |
| `POST` | `/api/auth/logout` | 撤销当前会话 |
| `POST` | `/api/auth/password` | 校验旧密码并修改密码，撤销所有会话 |

业务请求使用 `Authorization: Bearer <AT>`。上述鉴权 POST 接口还需要 `X-Requested-With: novel-processor`；浏览器跨域请求需启用 `credentials: 'include'`。RT 不出现在 JSON 返回值中，不能通过 localStorage 手动补齐。具体请求体见 [鉴权文档](./novel-processor/docs/auth.md)。

### 基础接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/healthz` | 健康检查，不经过 `/api` |
| `GET` | `/api/sites` | 获取支持的站点及能力 |
| `GET` | `/api/stats` | 获取书库统计 |
| `GET` | `/api/facets` | 获取筛选项统计 |
| `GET` | `/api/library` | 查询书架 |
| `POST` | `/api/sync` | 从磁盘重建索引 |
| `POST` | `/api/import` | 抓取目录并导入书架 |

### 作品和正文

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/library/:site/:id` | 获取作品目录 |
| `POST` | `/api/library/:site/:id/refresh` | 更新目录 |
| `GET` | `/api/library/:site/:id/status` | 获取下载任务和下载进度 |
| `GET` | `/api/library/:site/:id/episodes/:index` | 获取单话正文 |
| `POST` | `/api/library/:site/:id/fetch` | 下载正文 |
| `POST` | `/api/library/:site/:id/fetch/stop` | 取消抓取 |
| `DELETE` | `/api/library/:site/:id` | 移入回收站 |
| `DELETE` | `/api/library/:site/:id?permanent=1` | 永久删除文件和索引 |
| `POST` | `/api/library/:site/:id/restore` | 从回收站恢复 |
| `POST` | `/api/trash/empty` | 清空回收站 |

### 阅读和翻译

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` / `PUT` | `/api/library/:site/:id/reading` | 查询或更新阅读状态 |
| `GET` | `/api/library/:site/:id/translation/initialize` | 获取初始化材料 |
| `POST` | `/api/library/:site/:id/translation/initialize` | 创建初始化材料任务 |
| `GET` | `/api/library/:site/:id/translation/episodes` | 获取章节翻译状态和任务快照 |
| `POST` | `/api/library/:site/:id/translation/episodes` | 串行翻译选中的话 |
| `POST` | `/api/library/:site/:id/translation/episodes/stop` | 停止章节翻译任务 |
| `GET` | `/api/library/:site/:id/translation/maintenance` | 获取材料维护数据 |
| `POST` | `/api/library/:site/:id/translation/maintenance/preview` | 生成材料维护预览 |
| `POST` | `/api/library/:site/:id/translation/maintenance/apply` | 应用材料维护结果 |
| `POST` | `/api/library/:site/:id/translation/maintenance/restore` | 恢复材料维护前版本 |
| `GET` | `/api/settings/models` | 获取模型配置 |
| `POST` | `/api/settings/models` | 新增模型 |
| `GET` | `/api/settings/models/:id` | 获取单个模型配置 |
| `PUT` | `/api/settings/models/:id` | 修改模型 |
| `DELETE` | `/api/settings/models/:id` | 删除模型 |
| `POST` | `/api/settings/models/:id/test` | 测试模型调用 |

初始化/维护生成端点支持 NDJSON 流式返回；章节任务通过启动接口与状态快照跟踪。不要按普通一次性 JSON 请求解析 NDJSON。

更多接口与数据格式见 [文档索引](#documentation)。`docs/api.md` 和 `docs/architecture.md` 保留了一部分早期设计，涉及 Vite 中间件、浏览器直调采集库或“SQLite 可删除后完整重建”的旧描述不适用于当前版本；部署和数据恢复以本 README、相关新专题文档及当前源码为准。

<a id="pwa"></a>
## PWA 和 Apple 主屏幕

生产站点需要 HTTPS。构建会生成：

- Apple Touch Icon；
- PWA 192px / 512px 图标；
- maskable 图标；
- monochrome 图标；
- `manifest.webmanifest`；
- Service Worker。

iPhone / iPad 使用 Safari 打开网站后，通过“分享 → 添加到主屏幕”安装。更新图标或 Service Worker 后，系统可能保留旧缓存；必要时删除旧主屏幕图标后重新添加。

项目提供：

```sh
npm --prefix novel-processor/frontend run generate:icons
npm --prefix novel-processor/frontend run test:pwa
```

PWA 只缓存前端应用壳和静态资源。登录接口、AT/RT、小说正文、SQLite 数据和 AI 流式请求仍然需要网络和后端服务。项目不会把完整个人书库缓存到浏览器中。

开发模式不注册 Service Worker。生产更新采用用户确认后刷新，不强制在阅读中自动刷新；请上传完整构建，优先上传带哈希的资源，再替换入口和 SW，并尽可能保留上一版资源供旧页面使用。

网站内的明暗主题、阅读器纸色与主屏幕图标外观是不同维度。项目提供便于系统识别的图标素材，但 **PWA 不能承诺原生 Icon Composer 分层图标同等的暗色 / Liquid Glass 效果**；最终处理由系统决定，需要在真实设备上验证。页面配色会同步浏览器 `theme-color` 和安全区背景，状态栏最终字色仍由浏览器和系统控制。

细节见 [`docs/pwa.md`](./novel-processor/docs/pwa.md)。

<a id="testing"></a>
## 测试与验证

### 前端

```sh
cd novel-processor/frontend
npm run typecheck
npm run test:select
npm run test:appearance
npm run build
npm run test:pwa
```

### 后端

```sh
cd novel-processor/backend
npm run typecheck
npm run test:auth
npm run test:ai
npm run test:translation
npm run test:maintenance
npm run test:reading
npm run test:download
```

测试使用临时 SQLite、临时正文目录和本地模拟模型服务，不需要访问付费模型或真实小说站点。提交前建议从 `novel-processor/` 目录运行：

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run test:select
npm --prefix frontend run test:appearance
npm --prefix frontend run build
npm --prefix backend run typecheck
npm --prefix backend run test:ai
npm --prefix backend run test:translation
npm --prefix backend run test:maintenance
npm --prefix backend run test:reading
npm --prefix backend run test:download
git diff --check
```

构建通过表示源码和产物检查通过，不等同于已经在真实 iPhone、Safari、生产域名或 Docker 主机上完成视觉和部署验收。

<a id="adapters"></a>
## 扩展新的小说站点

站点差异应集中在适配器，不应散落在业务页面或流水线中。新增站点通常需要：

1. 在 `backend/src/lib/sites/<site>/` 创建适配器；
2. 实现输入解析、规范化引用、目录 URL、正文 URL；
3. 实现目录页解析和正文页解析；
4. 把 DOM 选择器集中放在 `selectors.ts`；
5. 在 `backend/src/lib/sites/registry.ts` 注册适配器；
6. 补充目录、正文、分页、异常和站点 URL 的离线测试；
7. 保持 `NovelRecord`、`EpisodeContent` 和 `SiteAdapter` 契约不变；
8. 在前端根据 `capabilities` 决定是否显示相应能力。

请先阅读 [`docs/architecture.md`](./novel-processor/docs/architecture.md) 中的适配器契约、分页处理、并发限制和数据模型。

<a id="faq"></a>
## 常见问题

### 根目录执行 npm 报找不到 package.json？

Git 根目录不是 npm workspace。分别在 `novel-processor/frontend/` 与 `novel-processor/backend/` 安装依赖，或使用 `npm --prefix novel-processor/frontend ...` 形式。只需要前端开发时，后端可以由 Docker 提供。

### 登录成功，但刷新后又退出？

优先检查浏览器是否接收并发送 RT Cookie：

1. 本地前端与 API 是否统一使用 `localhost`，而非混用 `localhost` / `127.0.0.1`。
2. `CORS_ORIGINS` 是否是实际前端 Origin，端口是否一致，有无结尾 `/`。
3. HTTPS 前端是否也在访问 HTTPS API。
4. 生产 API 是否与前端同站点，或被第三方 Cookie 策略拦截。
5. `AUTH_COOKIE_SECURE` 和 `AUTH_COOKIE_SAMESITE` 是否适合当前部署。

不要把问题通过把 AT 写入 localStorage、开启通配 CORS 或关闭鉴权来规避。

### 修改初始密码环境变量为什么没有重置已有用户？

初始账号只在数据库没有用户时创建，这是为了防止重启覆盖改过的密码。已登录时通过设置修改密码；**不要删除数据库重置密码**，这会丢失模型配置、翻译材料和阅读状态。忘记密码时先备份数据，再基于 `backend/server/auth.ts` 实现受控的离线恢复；当前没有公开注册或邮件找回入口。

### 前端仍然访问旧 API 域名？

`VITE_API_BASE` 是构建时变量，不是服务器运行时变量。检查 shell 环境、`.env` 与 `.env.production`，重新构建并部署完整 `frontend/dist/`。开发模式修改变量后重启 Vite。没有 Vite 代理，也不会自动回退到前端域名的 `/api`。

### 详情、设置或翻译页刷新后直接 404？

配置前端 Nginx 的 SPA `try_files` 回退。前端 catch-all 路由只有在应用加载后才能生效，无法修复 Nginx 在加载应用前返回的 404。参考 [生产部署](#deployment)。

### 模型明明正在输出，却在 180 秒左右失败？

应用的 180 秒是上游首事件/空闲超时，不是固定输出总时限。查看任务面板中的错误阶段，检查模型网关、CDN、Nginx 是否另有硬时限或流式缓冲。后端发给页面的心跳也不等于模型上游仍有活动；同时核对实际部署的后端是否已更新。

### 翻译材料不断变大、角色有重复怎么办？

进入“初始化材料 → 材料维护”，先做匹配检查或 AI 检查，对重复角色合并，再按需压缩选中模块。预览并确认结果，不要暴力删除姓名相似但可能是不同角色的项目。压缩会影响之后的翻译，不会自动改写已经保存的译文。

### 单话翻译失败会丢掉整批成果吗？

不会回滚之前成功保存的话，后续话会继续处理；重译失败也保留旧译文。修复模型配置或网络问题后，可重新选择未译/失败的话。原文更新时旧译文会标记过期，不应把“文件里有 translation 字段”直接当成译文有效。

### 移入回收站会释放正文空间吗？

不会。软删除只隐藏作品并保留文件；永久删除或清空回收站才移除目录、正文、译文及相关记录，不可撤销。请先备份。

### 更新页面或图标后看起来没有变化？

先确认部署的是新的完整构建、入口和 SW 未被长期缓存，再检查页面的“更新并刷新”提示。开发模式不启用 SW；生产 PWA 与 Apple 主屏幕图标各自可能保留旧资源，主屏幕图标必要时需移除并重新添加。不要只重启后端来期待前端 CSS 更新。

### 可以多人注册、离线阅读整本书、直接导出 EPUB 吗？

当前没有开放注册、按用户隔离的多租户书库、完整离线正文缓存或 EPUB 导出工作流。模型思考等级也取决于上游支持；仅因接口采用 OpenAI SDK，并不表示任意厂商、任意模型或所有私有协议都兼容。

<a id="contributing"></a>
## 贡献与反馈

欢迎提交 [Issue](https://github.com/Chiyoshic/novel-processor/issues) 或 Pull Request。修改前请阅读 [`AGENTS.md`](./AGENTS.md) 中的协作规则与界面约定。

- 功能修改保留已有路由、鉴权、文件格式和共享类型的兼容性。
- 新站点优先补适配器和离线 HTML fixture，不在通用流水线中堆站点判断。
- AI 调用修改应覆盖重试、取消、流式、JSON 修复与旧材料保护。
- UI 优先复用按钮、下拉、tab、状态标签等组件，并检查手机布局、夜间主题与阅读器自定义颜色。
- 不把真实小说全文、个人书库、密码、模型 Key 或含凭据的日志提交到仓库。
- 问题报告建议包含版本/提交号、Node.js 与浏览器版本、部署方式、复现步骤和脱敏后的错误信息。
- 只有配置、构建或单元测试通过时，不应宣称已经完成生产环境/手机真机验收。

涉及凭据的问题请先撤销/轮换受影响密钥，不要在公开 Issue 中粘贴敏感数据。

<a id="boundaries"></a>
## 合规与使用边界

- 仅抓取你有权访问和整理的内容。
- 遵守目标站点的 robots、服务条款、访问频率和版权要求。
- 不要使用高并发或低间隔设置对站点造成压力。
- 不要未经授权公开分发抓取的小说正文或翻译结果。
- AI 翻译结果需要人工检查，尤其是角色关系、专有名词、语气和上下文连续性。
- API Key、登录凭据和本地书库都属于私有数据，应限制服务器文件权限。
- 初始化采样、逐话翻译和材料维护会将相应原文/译文/角色材料发送给配置的模型服务。使用前确认供应商的数据处理政策，不向不信任的 Base URL 提交私有内容或密钥。
- 内置 R18 URL 解析不代表提供年龄验证绕过、付费内容解锁或访问限制规避能力。

<a id="releases"></a>
## 升级与版本发布

版本与变更说明统一见 [GitHub Releases](https://github.com/Chiyoshic/novel-processor/releases)。升级时先阅读目标版本说明，等待在途任务结束并备份数据，再更新前后端：

```sh
git fetch origin --tags
# 将下面标签替换为已发布的目标版本；先处理自己的未提交修改。
git checkout v1.0.0

npm --prefix novel-processor/frontend ci
npm --prefix novel-processor/frontend run build
(cd novel-processor/backend && docker compose up -d --build)
```

随后完整部署新的 `frontend/dist/` 并验证服务。修改 `.env` 后 `docker compose restart` 不会重新加载 Compose 环境配置，应使用 `docker compose up -d`；后端源码更新必须重新构建镜像。源码运行的后端则重新安装锁文件依赖并重启自己的单实例服务。

发布或升级前请确认：

- `README.md` 中的安装命令与源码一致；
- `backend/.env.example` 和 `frontend/.env.example` 未包含真实密钥；
- `data/`、`.env`、构建目录和日志没有进入提交；
- Docker 镜像能重新构建；
- 前端完整 `dist/` 已生成；
- Nginx SPA 回退、`sw.js` 和 manifest 配置已验证；
- 生产数据库和小说正文已备份；
- 不在有未完成 AI 任务时重启生产后端。

<a id="documentation"></a>
## 文档索引

- [`docs/architecture.md`](./novel-processor/docs/architecture.md)：整体架构、数据模型、采集流水线和扩展站点。
- [`docs/api.md`](./novel-processor/docs/api.md)：采集库与 HTTP API 的参考示例，部分早期架构描述需结合当前源码。
- [`docs/auth.md`](./novel-processor/docs/auth.md)：单用户登录、AT/RT 和修改密码。
- [`docs/frontend-deployment.md`](./novel-processor/docs/frontend-deployment.md)：Nginx、宝塔和前端路由 404。
- [`docs/pwa.md`](./novel-processor/docs/pwa.md)：PWA、Apple 图标和 Service Worker。
- [`docs/reading-progress.md`](./novel-processor/docs/reading-progress.md)：阅读状态、进度条和 SQLite 记录。
- [`docs/episode-translation.md`](./novel-processor/docs/episode-translation.md)：章节翻译输入、输出、上下文和存储。
- [`docs/brief-maintenance.md`](./novel-processor/docs/brief-maintenance.md)：翻译材料去重、合并、压缩和恢复。
- [`docs/download-cancellation.md`](./novel-processor/docs/download-cancellation.md)：抓取取消机制。
- [`LICENSE`](./LICENSE)：MIT 开源协议。

<a id="license"></a>
## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

Copyright (c) 2026 Chiyoshi

MIT 协议适用于本仓库代码，不替代小说原作、译文、第三方服务、字体和其他资源各自的授权或使用条款。

