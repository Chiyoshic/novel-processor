# novel-processor frontend

Vue 3 + TypeScript 的浏览器端和 PWA 前端，负责书架、作品详情、阅读器、登录、设置和 AI 翻译工作台的展示与交互。

## 负责范围

- 书架搜索、筛选、状态条和作品卡片；
- 作品目录、下载控制、阅读状态和翻译入口；
- Noto Serif 阅读器、原文/译文切换和阅读设置；
- 单用户登录、AT/RT 自动刷新和修改密码；
- 模型管理与 AI 翻译任务流式展示；
- 日间/夜间/跟随系统主题；
- PWA manifest、Service Worker、Apple Touch Icon 和自适应图标资源。

前端不负责抓取小说站点，不直接访问 SQLite，也不使用 Vite 代理。API 地址通过 `VITE_API_BASE` 写入构建产物。

## 环境要求

- Node.js 22.12.0+；
- npm；
- 正在运行的 novel-processor backend；
- 如果本机没有 `sharp` 预编译包，需要 Python 3 和本机编译工具。

## 安装和开发

```sh
cd novel-processor/frontend
npm ci
cp .env.example .env
```

编辑 `.env`：

```dotenv
VITE_API_BASE=http://localhost:8080/api
```

启动：

```sh
npm run dev -- --host localhost --port 5175 --strictPort
```

打开 `http://localhost:5175/`。生产环境示例：

```dotenv
VITE_API_BASE=https://api.example.com/api
```

这是构建时变量，修改后必须重启 Vite 或重新构建。前端与 API 应尽量使用同一个主机名，例如都使用 `localhost`，不要混用 `localhost` 和 `127.0.0.1`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run typecheck` | Vue + TypeScript 类型检查 |
| `npm run build` | 生成生产资源和 PWA 文件 |
| `npm run preview` | 预览 `dist/` |
| `npm run test:select` | AppSelect 交互和样式回归测试 |
| `npm run test:appearance` | 浏览器外观和暗色 scoped CSS 测试 |
| `npm run generate:icons` | 根据 SVG 生成 PWA / Apple PNG |
| `npm run test:pwa` | 构建并验证 PWA 资源 |

## 页面和路由

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录 |
| `/` | 书架 |
| `/novel/:site/:novelId` | 作品详情和目录 |
| `/novel/:site/:novelId/episodes/:index` | 阅读器 |
| `/novel/:site/:novelId/translation` | AI 翻译流程 |
| `/settings` | 设置和模型管理 |
| `/trash` | 回收站 |

前端使用 Vue Router History 模式。生产 Nginx 必须配置 `try_files $uri $uri/ /index.html`，否则刷新深层路由会 404。

## 设计约定

- 全局按钮、下拉框、tab、状态标签和返回按钮优先复用现有组件；
- 管理页面使用主题语义变量，暗色模式不写死白底或暗色全局继承色；
- 阅读器是独立书页视觉作用域，使用 Noto Serif，不直接套管理页面按钮样式；
- 页面必须兼容手机窄屏、长标题和自定义阅读器纸色；
- AI 任务面板保留流式输出、耗时、重试、错误和取消状态。

全局设计约定见仓库根目录 [`AGENTS.md`](../../AGENTS.md)。

## 生产部署

```sh
npm ci
cat > .env <<'ENVEOF'
VITE_API_BASE=https://api.example.com/api
ENVEOF
npm run build
```

将完整 `dist/` 上传到静态站点根目录，包括 `assets/`、`sw.js`、Workbox 文件、manifest、`apple-touch-icon.png` 和 `icons/`。

不要只重启后端来更新前端。PWA 入口和 Service Worker 需要正确缓存策略，具体见 [`docs/operations/02-production.md`](../docs/operations/02-production.md) 和 [`docs/features/07-pwa.md`](../docs/features/07-pwa.md)。

## 测试

```sh
npm run typecheck
npm run test:select
npm run test:appearance
npm run build
npm run test:pwa
```

构建和测试通过不等同于已经完成真实手机、Safari 或生产域名验收。
