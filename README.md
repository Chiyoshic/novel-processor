# novel-processor

<p align="center">
  <img src="./novel-processor/frontend/public/app-icon.svg" width="88" height="88" alt="novel-processor 书本图标" />
</p>

<p align="center">
  <strong>把喜欢的日轻小说，收进自己的书架。</strong><br />
  Bring the Japanese light novels you love to your own bookshelf.
</p>

<p align="center">
  <a href="https://github.com/Chiyoshic/novel-processor/releases"><img src="https://img.shields.io/badge/version-v1.0.0-6a9ecd" alt="Version" /></a>
  <a href="https://github.com/Chiyoshic/novel-processor/releases/tag/v1.0.0"><img src="https://img.shields.io/badge/release-v1.0.0-8950ce" alt="Release v1.0.0" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-79c2ac" alt="License" /></a>
  <a href="#requirements"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.12-339933" alt="Node.js" /></a>
  <a href="./novel-processor/frontend"><img src="https://img.shields.io/badge/frontend-Vue%203%20%2B%20TypeScript-42b883" alt="Frontend" /></a>
  <a href="./novel-processor/backend"><img src="https://img.shields.io/badge/backend-Node.js%20%2B%20TypeScript-339933" alt="Backend" /></a>
  <a href="./novel-processor/docs/features/06-ai-translation.md"><img src="https://img.shields.io/badge/AI%20translation-OpenAI%20compatible-8b5bc7" alt="AI translation" /></a>
  <a href="./novel-processor/docs/features/07-pwa.md"><img src="https://img.shields.io/badge/PWA-supported-8950ce" alt="PWA" /></a>
</p>

<p align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a><br />
  更多语言版本即将上线 · More language versions are coming soon.
</p>

> 当前文档对应 **v1.0.0**。当前支持小説家になろう，其他平台按计划逐步接入。正式版本与变更说明以 [Releases](https://github.com/Chiyoshic/novel-processor/releases) 为准。
>
> This README covers **v1.0.0**. Syosetu is currently supported, with more platforms planned. See [Releases](https://github.com/Chiyoshic/novel-processor/releases) for published versions and release notes.

<a id="overview"></a>
## 项目介绍 / Overview

`novel-processor` 是面向日轻爱好者的个人书库，集小说采集、书架管理、沉浸阅读与 AI 翻译于一体，通过初始化材料、上下文参考与动态维护，让长篇翻译更连贯。

A personal Japanese light novel library with novel fetching, bookshelf management, immersive reading, and context-aware AI translation powered by evolving character, terminology, and style guides.

项目提供浏览器界面和独立 Node.js API，正文、译文和个人状态保存在你的服务器或本机。它面向个人使用，不提供公共内容分发或开放注册；使用 AI 时，对应材料会发送到你配置的模型服务。

The browser interface connects to a standalone Node.js API, with source text, translations, and personal data stored on your own server or computer. It is built for personal use, without public content distribution or open registration. AI features send the relevant material to your configured model provider.

文中“章”表示目录分组，“话”表示有独立正文的 episode；下载、翻译、阅读记录和初始化采样均以“话”为主要单位。

Here, a **chapter** is a table-of-contents group, while an **episode** is an individual installment with its own text. Downloads, translation, reading records, and initialization samples primarily operate on episodes.

<p align="center">
  <a href="./novel-processor/docs/assets/readme/bookshelf.webp">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="./novel-processor/docs/assets/readme/bookshelf-dark.webp" />
      <img src="./novel-processor/docs/assets/readme/bookshelf.webp" width="900" alt="真实书架界面：两部本地小说、继续阅读入口、下载进度与红黄绿阅读状态条" />
    </picture>
  </a>
  <br /><sub>当前页面与本地已有书库的实拍图；随浏览环境展示浅色或深色预览。点击图片可查看原图。</sub>
  <br /><sub>Actual UI rendered with existing local library data. The preview follows your color scheme; click to enlarge.</sub>
</p>

<a id="translation-highlights"></a>
## 不只是逐话直接翻译 / More than isolated episode translation

相比把每一话单独交给模型，`novel-processor` 为长篇小说维护一份**可持续更新的翻译材料**，让后续翻译有据可循：

Rather than translating each episode in isolation, `novel-processor` maintains an **evolving translation guide** for the novel, giving later episodes a consistent foundation:

- **先理解，再翻译**：从简介、前言和前若干话中初始化中文书名、剧情梗概、角色译名、术语与语言风格，建立统一基线。
  <br />**Understand first, translate second:** Use the synopsis, prefaces, and opening episodes to establish a Chinese title, plot summary, character names, terminology, and style baseline.
- **带着上下文继续**：每话结合最新材料与最近若干话的译文，帮助承接剧情、统一称呼和文风，而不是每次从零开始。
  <br />**Carry the context forward:** Combine the latest guide with recent translations to help maintain narrative continuity, names, and tone instead of starting from scratch.
- **材料随剧情生长**：模型在翻译时提出角色、别名、术语和规则的增补或修改，由程序校验后写回，供后续话使用。
  <br />**Let the guide grow with the story:** The model proposes updates to characters, aliases, terms, and rules. Validated changes are saved for subsequent episodes.
- **去重与压缩维护**：用 AI 合并重复信息、按模块压缩冗长说明；先预览再应用，保留历史恢复能力，避免材料无序膨胀。
  <br />**Keep the guide focused:** Merge duplicates and summarize selected sections with AI. Preview changes before applying them, with revision history available for restoration.

目标是减少长篇翻译中的译名漂移、风格断层和重复说明；具体效果仍取决于模型与材料质量，需要人工复核。

The goal is to reduce naming drift, inconsistent style, and repetitive notes across a long novel. Results still depend on the model and source material, and human review remains important.

<table>
  <tr>
    <td width="50%" align="center"><a href="./novel-processor/docs/assets/readme/translation-guide.webp"><img src="./novel-processor/docs/assets/readme/translation-guide.webp" width="100%" alt="已保存的角色材料：固定译名、身份、说话风格与来源话号" /></a></td>
    <td width="50%" align="center"><a href="./novel-processor/docs/assets/readme/guide-maintenance.webp"><img src="./novel-processor/docs/assets/readme/guide-maintenance.webp" width="100%" alt="材料压缩设置：模块多选、思考等级和目标体积" /></a></td>
  </tr>
  <tr>
    <td align="center">角色、译名与文风有据可查<br /><sub>A shared character and style reference</sub></td>
    <td align="center">按模块维护与压缩材料<br /><sub>Keep the guide focused with selective summarization</sub></td>
  </tr>
</table>

## 目录

- [翻译亮点](#translation-highlights)
- [项目介绍](#overview)
- [功能总览](#features)
- [支持平台](#sites)
- [技术栈与运行方式](#architecture)
- [环境要求](#requirements)
- [快速开始](#quickstart)
- [配置与部署](#configuration)
- [数据与备份](#storage)
- [测试与发布](#testing)
- [文档索引](#documentation)
- [合规与使用边界](#boundaries)
- [开源协议](#license)

<a id="features"></a>
## 功能总览

### 小说采集与下载

- 导入作品 URL 或站点作品 ID；
- 抓取目录、章节、话标题、发布时间、简介、作者、状态、标签和字数；
- 支持按话、按范围、按章节和全书下载；
- 默认跳过已保存内容，可覆盖重抓；
- 并发、访问间隔、超时、重试和真实服务端取消；
- JSON 文件保存正文，SQLite 保存索引。

<p align="center">
  <a href="./novel-processor/docs/assets/readme/catalog.webp"><img src="./novel-processor/docs/assets/readme/catalog.webp" width="900" alt="小说目录：下载统计、范围抓取、并发选择及逐话下载、翻译和阅读状态" /></a>
  <br /><sub>抓取、译文与阅读状态在同一个目录里对齐展示。</sub>
</p>

### 书架与作品管理

- 标题/作者搜索、站点/状态/标签筛选；
- 独立的下载进度和阅读进度筛选；
- 作品卡片显示下载和阅读统计、状态分布条；
- “开始阅读”和“继续阅读”；
- 目录下载状态、翻译状态和阅读状态图标；
- 回收站、恢复、永久删除和重建索引。

<p align="center">
  <a href="./novel-processor/docs/assets/readme/library-filters.webp"><img src="./novel-processor/docs/assets/readme/library-filters.webp" width="900" alt="书架筛选：连载状态、下载进度、阅读进度、题材与标签" /></a>
  <br /><sub>下载到哪、读到哪，分开筛选；标签与筛选栏可独立收起。</sub>
</p>

<details>
<summary>查看按话号范围编辑阅读状态</summary>

<p align="center">
  <a href="./novel-processor/docs/assets/readme/reading-progress.webp"><img src="./novel-processor/docs/assets/readme/reading-progress.webp" width="900" alt="阅读状态编辑弹窗：起止话号和未读、在读、已读选项" /></a>
</p>

</details>

### 阅读器

- 原文与中文译文切换；
- Noto Serif JP / Noto Serif SC 书页式排版；
- 字号、字距、行距、段距、背景和字体颜色设置；
- 人物原名、中文名、全名和常见短名匹配；
- 桌面悬浮、移动端点击查看人物简介；
- Safari 阅读器模式语义结构和打印样式；
- 原文与译文共用阅读状态。

<p align="center">
  <a href="./novel-processor/docs/assets/readme/reader.webp"><img src="./novel-processor/docs/assets/readme/reader.webp" width="900" alt="暖纸配色阅读器：中文译文、衬线排版、原文切换与阅读状态" /></a>
  <br /><sub>连续书页式排版，让正文成为页面的主角。</sub>
</p>

<details>
<summary>查看阅读设置与人物简介</summary>

<p align="center">
  <a href="./novel-processor/docs/assets/readme/reader-settings.webp"><img src="./novel-processor/docs/assets/readme/reader-settings.webp" width="900" alt="阅读设置：字号、字距、行距、段距、纸色和人物提示开关" /></a>
  <br /><sub>排版与配色在当前阅读器中即时调整。</sub>
</p>
<p align="center">
  <a href="./novel-processor/docs/assets/readme/character-notes.webp"><img src="./novel-processor/docs/assets/readme/character-notes.webp" width="900" alt="悬浮正文人物名称，查看来自初始化材料的角色身份与说话风格" /></a>
  <br /><sub>正文中的人物提示复用已保存的翻译材料。</sub>
</p>

</details>

### AI 翻译

- 初始化整本书的中文书名、剧情梗概、角色译名、别名、文风、术语和翻译规则；
- 逐话串行翻译，支持范围选择和最小未译话快捷选择；
- 载入最近已译话匹配上下文文风；
- OpenAI Responses API、Chat Completions API 和 OpenAI 兼容服务；
- 自定义 Base URL、明文 API Key、headers、extra body 和 Token 上限；
- OpenAI / DeepSeek 思考等级和 DSML 适配；
- 流式输出、60 分钟总时限、180 秒空闲时限、重试和 JSON 修复；
- 模型输出材料 CRUD、重复合并、压缩总结、预览应用和历史恢复。

<p align="center">
  <a href="./novel-processor/docs/assets/readme/episode-translation.webp"><img src="./novel-processor/docs/assets/readme/episode-translation.webp" width="900" alt="章节翻译配置：前文译文参考数量、话号范围、已译图标和批量勾选" /></a>
  <br /><sub>选择要翻译的范围，配置前文参考数量；已译话直接显示译文入口。</sub>
</p>

<details>
<summary>查看初始化任务配置</summary>

<p align="center">
  <a href="./novel-processor/docs/assets/readme/translation-setup.webp"><img src="./novel-processor/docs/assets/readme/translation-setup.webp" width="900" alt="初始化任务：模型、前多少话、思考等级、简介和前言选择以及翻译要求" /></a>
  <br /><sub>截图展示现有材料和配置，不会为展示而触发付费模型调用。</sub>
</p>

</details>

### 主题与 PWA

- 日间、夜间、跟随系统；
- 手机和桌面响应式布局；
- Apple Touch Icon、maskable / monochrome 图标、manifest 和 Service Worker；
- Service Worker 只缓存应用壳，不缓存账户、正文和 AI 流。

<table>
  <tr>
    <td width="66%" align="center"><a href="./novel-processor/docs/assets/readme/bookshelf-dark.webp"><img src="./novel-processor/docs/assets/readme/bookshelf-dark.webp" width="100%" alt="暗色书架：高对比度文字、状态标签与阅读进度" /></a></td>
    <td width="34%" align="center"><a href="./novel-processor/docs/assets/readme/reader-mobile-dark.webp"><img src="./novel-processor/docs/assets/readme/reader-mobile-dark.webp" width="100%" alt="390px 手机视口下的夜读界面" /></a></td>
  </tr>
  <tr>
    <td align="center">桌面暗色书架</td>
    <td align="center">手机夜读</td>
  </tr>
</table>

截图来自当前中文界面；手机图为浏览器移动视口渲染，不代表 iOS 原生安装或 Liquid Glass 效果验收。[截图说明](./novel-processor/docs/assets/readme/README.md)

<a id="sites"></a>
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

计划支持的平台暂未接入当前版本，不能直接使用对应站点的采集功能。

<a id="architecture"></a>
## 技术栈与运行方式

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3、TypeScript、Vue Router、Vite |
| 后端 | Node.js、TypeScript、原生 HTTP Server |
| 数据库 | SQLite、better-sqlite3 |
| AI | OpenAI Node SDK，兼容 Responses / Chat Completions |
| 内容 | 目录和正文 JSON 文件 |
| PWA | vite-plugin-pwa、Workbox |
| 部署 | Docker Compose、静态站点、Nginx / 宝塔 |

```text
浏览器 / PWA
    │ HTTPS API、登录、流式任务
    ▼
Node.js API（单实例）
    ├── SiteAdapter → 目录 / 正文采集 → JSON
    ├── SQLite → 索引 / 鉴权 / 模型 / 翻译 / 阅读记录
    └── AiModelClient → Responses / Chat Completions
```

前端通过 `VITE_API_BASE` 直连后端，不使用 Vite 代理。生产环境需要同时部署新的前端构建和后端服务。

<a id="requirements"></a>
## 环境要求

- Node.js **22.12.0+**，推荐 Node.js 22 LTS；
- npm；
- Docker Engine / Docker Compose（后端使用容器时）；
- Python 3 和本机编译工具（原生依赖没有预编译包时）；
- 目标站点网络访问权限；
- AI 功能所需的模型服务和 API Key。

根目录没有 `package.json`。前端和后端是两个独立 npm 项目，命令需在对应目录执行或使用 `npm --prefix`。

<a id="quickstart"></a>
## 快速开始

### 1. 获取源码

```sh
git clone https://github.com/Chiyoshic/novel-processor.git
cd novel-processor
# v1.0.0 release 发布后可固定版本
git checkout v1.0.0
```

### 2. 启动后端 Docker

从 Git 仓库根目录执行；已有 `.env` 时直接编辑，不要覆盖：

```sh
cp novel-processor/backend/.env.example novel-processor/backend/.env
```

编辑 `novel-processor/backend/.env`：

```dotenv
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=请设置服务端初始密码
CORS_ORIGINS=http://localhost:5175
```

启动：

```sh
cd novel-processor/backend
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:64226/healthz
```

默认 API 地址为 `http://localhost:64226`，健康检查为 `/healthz`。

### 3. 启动前端

新开终端，从 Git 仓库根目录执行：

```sh
npm --prefix novel-processor/frontend ci
cp novel-processor/frontend/.env.example novel-processor/frontend/.env
```

将 `novel-processor/frontend/.env` 设置为：

```dotenv
VITE_API_BASE=http://localhost:64226/api
```

启动：

```sh
npm --prefix novel-processor/frontend run dev -- --host localhost --port 5175 --strictPort
```

打开 `http://localhost:5175/`，使用后端环境变量中的账号登录。前端和 API 尽量统一使用 `localhost`，不要混用 `localhost` 和 `127.0.0.1`。

### 4. 首次登录

后端只在 SQLite 没有用户时创建初始账号。初始密码不会在重启时覆盖已有密码。Access Token 只存在前端内存，Refresh Token 使用 HttpOnly Cookie。详细说明见 [`docs/features/05-auth.md`](./novel-processor/docs/features/05-auth.md)。

<a id="configuration"></a>
## 配置与部署

### 前端

`frontend/.env` 只有一个必须配置的值：

```dotenv
VITE_API_BASE=https://api.example.com/api
```

这是构建时变量，修改后必须重新构建。完整前端说明见 [`frontend/README.md`](./novel-processor/frontend/README.md)。

### 后端

配置模板见 [`backend/.env.example`](./novel-processor/backend/.env.example)。关键配置：

| 变量 | 作用 |
| --- | --- |
| `HTTP_HOST` / `HTTP_PORT` | API 监听地址和进程端口 |
| `API_PORT` | Docker 宿主机映射端口，默认 64226 |
| `DATA_DIR` / `DB_PATH` | 数据目录和 SQLite 路径 |
| `NOVELS_DIR` / `EPISODES_DIR` | 目录 JSON 和正文路径 |
| `FETCH_CONCURRENCY` / `FETCH_INTERVAL_MS` | 抓取并发和请求间隔 |
| `FETCH_TIMEOUT_MS` / `FETCH_MAX_RETRIES` | 抓取超时和重试 |
| `CORS_ORIGINS` | 精确允许的前端 Origin，不能使用 `*` |
| `AUTH_INITIAL_USERNAME` / `AUTH_INITIAL_PASSWORD` | 首次账号初始化 |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | Refresh Cookie 策略 |

API Key、初始密码和 `.env` 不要提交到 Git。

### 生产环境

推荐前端静态站点和后端 API 分域部署：

```text
https://novels.example.com      → Nginx → frontend/dist
https://api.example.com/api      → Nginx → Node API :64226
```

前端 Nginx 必须配置：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

API 的流式请求需要关闭代理缓冲并提高读取超时。完整 Docker、Nginx、CORS 和发布步骤见 [`docs/operations/02-production.md`](./novel-processor/docs/operations/02-production.md)。

<a id="storage"></a>
## 数据与备份

```text
data/
├── library.db             # SQLite：用户、索引、模型、翻译、阅读和回收站
├── audit.log              # 管理操作审计日志
├── novels/<site>/<id>.json
└── episodes/<site>/<id>/<episode>.json
```

JSON 是目录和正文内容真源，SQLite 保存索引和用户状态。阅读记录、模型配置、翻译材料、翻译状态、维护历史、登录用户和回收站不能只靠 JSON 恢复。

备份必须包含整个 `data/`，不要只复制 `novels/` 或 `episodes/`。备份与恢复步骤见 [`docs/operations/03-data-backup.md`](./novel-processor/docs/operations/03-data-backup.md)。

<a id="testing"></a>
## 测试与发布

前端：

```sh
cd novel-processor/frontend
npm run typecheck
npm run test:select
npm run test:appearance
npm run build
npm run test:pwa
```

后端：

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

发布 `v1.0.0` 前确认：

- `.env`、密码、API Key、`data/` 和日志未进入 Git；
- 前后端类型检查和测试通过；
- 完整前端 `dist/` 已构建；
- Docker 镜像可重新构建；
- Nginx SPA 回退、Service Worker 和 manifest 已验证；
- 生产数据库和正文已备份；
- 没有未完成的长时间抓取或 AI 翻译任务。

<a id="documentation"></a>
## 文档索引

### 按功能

- [小说采集、目录与下载](./novel-processor/docs/features/01-catalog.md)
- [书架、作品管理与回收站](./novel-processor/docs/features/02-library.md)
- [阅读器](./novel-processor/docs/features/03-reader.md)
- [阅读进度](./novel-processor/docs/features/04-reading-progress.md)
- [登录、会话与权限](./novel-processor/docs/features/05-auth.md)
- [AI 翻译与材料维护](./novel-processor/docs/features/06-ai-translation.md)
- [PWA、Apple 图标与更新](./novel-processor/docs/features/07-pwa.md)

### 部署运维

- [本地源码开发](./novel-processor/docs/operations/01-local-development.md)
- [生产部署、Docker 与 Nginx](./novel-processor/docs/operations/02-production.md)
- [数据、备份与恢复](./novel-processor/docs/operations/03-data-backup.md)

### 源码开发

- [系统架构与数据边界](./novel-processor/docs/development/01-architecture.md)
- [新增小说站点适配器](./novel-processor/docs/development/02-site-adapter.md)
- [测试、验证与贡献](./novel-processor/docs/development/03-testing.md)
- [HTTP API](./novel-processor/docs/api.md)
- [前端开发 README](./novel-processor/frontend/README.md)
- [后端开发 README](./novel-processor/backend/README.md)

### Release notes

- [版本发布记录](./novel-processor/docs/release-notes/README.md)
- [v1.0.0 首个稳定版本](./novel-processor/docs/release-notes/v1.0.0.md)

<a id="boundaries"></a>
## 合规与使用边界

- 仅抓取你有权访问和整理的内容；
- 遵守目标站点的使用条款、访问频率和版权要求；
- 不要用高并发或低间隔设置对站点造成压力；
- 不要未经授权公开分发抓取的正文或翻译结果；
- 使用 AI 前确认供应商的数据处理政策；
- API Key、密码、本地书库和备份文件按敏感数据保护；
- 不要将不信任的 Base URL 用于发送私有正文或 API Key；
- 内置站点解析不代表提供访问限制、年龄验证或付费内容绕过能力。

<a id="license"></a>
## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

Copyright (c) 2026 Chiyoshi

MIT 仅适用于本仓库代码，不替代小说原作、译文、第三方服务、字体和其他资源各自的授权或使用条款。
