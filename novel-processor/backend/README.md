# Backend

在项目根目录复制配置后，从本目录运行：

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

默认宿主机端口为 64226；数据库和正文保存在 `../data`。数据格式及接口沿用原有 `/api` 契约。`/healthz` 用于容器健康检查。服务以单实例运行，避免多个进程同时操作同一份 JSON 和 SQLite。
