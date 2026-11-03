# 生产部署、Docker 与 Nginx

## 推荐拓扑

```text
浏览器
  ├── https://novels.example.com     → Nginx 静态站点 → frontend/dist
  └── https://api.example.com/api     → Nginx 反向代理 → Node API :64226
```

前端和 API 可以使用不同域名，但必须配置精确 CORS、HTTPS 和 Refresh Cookie。能使用同站点 `/api` 反向代理时，跨站 Cookie 问题更少。

## Docker 后端

从仓库根目录：

```sh
cp novel-processor/backend/.env.example novel-processor/backend/.env
```

至少设置：

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

Compose 构建上下文是 `novel-processor/`，镜像同时需要 `backend/` 和同级 `shared/`。默认宿主机端口为 `64226`，容器内端口为 `8080`，`../data` 挂载到 `/app/data`。

Nginx 在同机时可以将端口限制为回环：

```yaml
ports:
  - "127.0.0.1:${API_PORT:-64226}:${HTTP_PORT:-8080}"
```

## 前端构建

```sh
cd novel-processor/frontend
npm ci
cat > .env <<'ENVEOF'
VITE_API_BASE=https://api.example.com/api
ENVEOF
npm run build
```

把完整 `dist/` 上传到静态站点根目录。不要只上传 `index.html`；还需要 `assets/`、`sw.js`、Workbox 文件、manifest、Apple 图标和 `icons/`。

`VITE_API_BASE` 是构建时变量，不是运行时变量。改动后必须重新构建并重新部署。

## API 反向代理

在 API 域名已有 HTTPS `server {}` 中使用：

```nginx
location / {
    proxy_pass http://127.0.0.1:64226;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3700s;
    proxy_send_timeout 3700s;
}
```

流式初始化、材料维护和模型调用需要关闭代理缓冲。CDN 或网关若有更短的超时，也需要同步调整。

## 前端 SPA 回退

在前端静态站点使用：

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

不要用全局 `error_page 404 /index.html` 代替 `try_files`，否则缺失资源也可能返回 HTML。宝塔站点可参考 [`../../deploy/nginx/baota-spa.conf`](../../deploy/nginx/baota-spa.conf)。已有 `location` 时修改原块，不要重复定义。

## 验证

```sh
curl -f https://api.example.com/healthz
curl -I https://novels.example.com/settings
curl -I https://novels.example.com/sw.js
curl -I https://novels.example.com/manifest.webmanifest
curl -I https://novels.example.com/assets/not-existing.js
```

页面路由应返回 HTML 200，缺失资源应返回 404，Service Worker 和 manifest 应返回正确内容类型。

## 更新服务

前后端应一起发布兼容版本。修改后端代码：

```sh
cd novel-processor/backend
docker compose up -d --build
```

修改 `.env` 后使用 `docker compose up -d`，不要只执行 `docker compose restart`。生产重启会中断后端内存中的抓取和翻译任务，升级前应等待任务结束并完成备份。
