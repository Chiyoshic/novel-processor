# Novel Processor

个人小说库：Vue 前端与独立 Node.js API 分别部署，当前支持小説家になろう（syosetu）。

## 启动后端

需要 Docker 和 Docker Compose。首次启动在项目根目录执行：

```sh
cp backend/.env.example backend/.env
cd backend
docker compose up -d --build
```

后端默认映射到宿主机 **64226**，容器内监听 8080。查看状态和日志：

```sh
docker compose ps
docker compose logs -f api
curl http://127.0.0.1:64226/healthz
```

`backend/.env` 控制监听端口、抓取并发、请求节奏、超时、重试、数据路径和 CORS。更改环境变量后运行 `docker compose up -d` 重建容器；修改代码后运行 `docker compose up -d --build`。Compose 的 `API_PORT` 是宿主机端口，`HTTP_PORT` 是容器内部端口。

## 前端独立部署

```sh
cd frontend
npm ci
cp .env.example .env
npm run dev
npm run build
```

前端不使用 Vite 代理。开发和生产都在 `frontend/.env` 配置 `VITE_API_BASE=https://novels.server.chiyoshi.cn/api`，浏览器直接访问该后端；所有登录、刷新和业务请求共用此配置。缺失或相对地址会报错，不回退到前端域名。该值在构建时写入产物，修改后必须重新构建并部署前端。后端 `CORS_ORIGINS` 需要包含前端完整 origin，例如 `https://novels.chiyoshi.cn`；多个 origin 使用逗号分隔。本地跨域调试也需显式加入对应 localhost origin。HTTPS 前端应通过 HTTPS 访问后端。

前端与 API 已启用 AT/RT 登录鉴权，不开放注册。首次启动需要在后端私有环境变量配置初始密码；登录、刷新、修改密码及部署说明见 `docs/auth.md`。

## 持久化与备份

Compose 将项目的 `data/` 目录挂载到容器 `/app/data`。目录包含作品目录 JSON、单话 JSON、SQLite 数据库及其 WAL/SHM 文件和审计日志。停止或重建容器不会删除此目录。不要同时运行多个后端进程访问同一个数据目录。

SQLite 的回收站状态仅存在数据库中，因此备份应包含**整个 data 目录**；不要只备份 JSON。建议先停止服务再复制目录，以确保 SQLite 与 JSON 一致。JSON 可用于重建目录和正文索引，但无法恢复丢失的回收站状态。

## 结构

- `frontend/`：Vue 界面及 API 客户端。
- `backend/src/lib/`：采集、解析和下载逻辑。
- `backend/server/`：HTTP API 与 SQLite 索引。
- `backend/src/storage/`：文件存储。
- `shared/types.ts`：前后端共享的领域模型类型。
- `data/`：持久化数据，不进入 Git 或 Docker 构建上下文。

历史设计参考 `docs/architecture.md` 与 `docs/api.md`；其中关于 Vite 中间件及浏览器直接调用采集库的部分属于旧架构，以本文和代码为准。
