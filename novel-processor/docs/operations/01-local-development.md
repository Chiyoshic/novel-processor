# 本地源码开发

## 目录和 Node 版本

Git 仓库根目录没有 `package.json`。应用位于 `novel-processor/`，前端和后端分别安装依赖。推荐 Node.js `22.12.0+`，后端 `better-sqlite3` 和前端 `sharp` 可能需要本机编译工具。

```sh
cd novel-processor/frontend
npm ci
cd ../backend
npm ci
```

## 直接运行后端

从 `novel-processor/backend/` 执行：

```sh
cp .env.example .env
```

源码运行时，把 Docker 模板中的 `/app/data` 改成本机路径，例如：

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

后端地址为 `http://localhost:8080`。不要同时启动 Docker 后端和源码后端访问同一份 `data/`。

## 运行前端

从 `novel-processor/frontend/` 执行：

```sh
cp .env.example .env
```

设置：

```dotenv
VITE_API_BASE=http://localhost:8080/api
```

启动：

```sh
npm run dev -- --host localhost --port 5175 --strictPort
```

浏览器打开 `http://localhost:5175/`。前端不使用 Vite 代理；修改 `VITE_API_BASE` 后必须重启 Vite。

## 常用命令

```sh
# frontend/
npm run typecheck
npm run test:select
npm run test:appearance
npm run build
npm run test:pwa

# backend/
npm run typecheck
npm run test:auth
npm run test:ai
npm run test:translation
npm run test:maintenance
npm run test:reading
npm run test:download
```

## CLI

```sh
cd novel-processor/backend
npm run fetch -- --help
npm run fetch -- n4703ix --range 1-10 --out ../data/episodes
```

CLI 不读取 HTTP API 的鉴权状态，也不会自动读取 API 的抓取参数。它是开发和修复数据用工具；不要让 CLI 与 API 同时写入同一本书。
