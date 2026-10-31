# 单用户登录鉴权

不开放注册。账号与会话都存储在现有 `data/library.db` 的 `auth_*` 表，不影响小说或翻译数据。

## 初始账号

首次启动数据库没有用户时，读取后端环境变量：

```dotenv
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=请通过私有环境文件设置初始密码
AUTH_COOKIE_SECURE=auto
AUTH_COOKIE_SAMESITE=lax
CORS_ORIGINS=https://novels.chiyoshi.cn
```

真实密码只放在不纳入版本控制的 `backend/.env` 或部署平台 Secret 中，不要写进前端或提交到仓库。初始化后仅保存带随机盐的 scrypt 哈希；数据库有用户时不再执行初始化，不会因为重启而把已修改的密码重置。备份 SQLite 即可保留账户。

## 接口

- `POST /api/auth/login`：JSON `{username,password}`，返回 AT、expiresIn、expiresAt 和 user；RT 只通过 HttpOnly Cookie 设置。
- `POST /api/auth/refresh`：携带 RT Cookie，返回新 AT 并轮换 RT。
- `GET /api/auth/me`：携带 `Authorization: Bearer <AT>` 查询当前用户。
- `POST /api/auth/logout`：撤销本次登录会话并清除 RT Cookie。
- `POST /api/auth/password`：携带 AT，JSON `{currentPassword,newPassword}`；验证当前密码，修改后撤销所有设备会话并要求重新登录。

所有上述 POST 请求需要 `X-Requested-With: novel-processor`。跨域客户端必须在白名单中，并使用 `credentials: 'include'`。AT 为 15 分钟短期不透明令牌，RT 会话绝对寿命为 30 天；RT 只用一次，重放已使用 RT 会撤销该会话。多个标签页续期不会使其他标签页尚未到期的 AT 立即失效。

数据库只存令牌的 SHA-256 哈希，不保存原始 AT/RT。登录有频率限制和密码哈希并发上限。除健康检查与必要的登录/刷新接口外，正式 HTTP 入口的所有 API（包括模型配置、下载、翻译状态和流式初始化）都要求有效 AT。

## 前端与部署

前端 `/login` 页面登录后回到原页面；AT 只在内存，不写入 localStorage/sessionStorage。刷新页面通过 RT 恢复；API 遇到 401 最多续期并重试一次，同标签并发请求合并续期，支持 Web Locks 的浏览器还会串行跨标签页刷新。退出或修改密码会广播给其他标签页。

`https://novels.chiyoshi.cn` 的跨域请求已配置凭据、Authorization 与自定义校验头的 CORS 预检支持，禁止使用 `CORS_ORIGINS=*`。

默认 `SameSite=Lax` 适用于同站点 HTTPS 子域名间的调用；若 API 部署到完全不同的主域名，建议通过同源 `/api` 反向代理，避免第三方 Cookie 限制。确实跨站时可设置 `AUTH_COOKIE_SAMESITE=none` 与 `AUTH_COOKIE_SECURE=true`，但仍受浏览器第三方 Cookie 策略限制。HTTPS 站点的 API 也应使用 HTTPS。

`AUTH_COOKIE_SECURE=auto` 会对 HTTPS 浏览器来源或直接 TLS 连接设置 Secure Cookie，同时允许本地 HTTP 开发；仅在 HTTPS 使用的生产部署可固定为 true。Cookie 为 Host-only，路径限制为 `/api/auth`。前端已取消 Vite 代理，统一使用 `frontend/.env` 的 `VITE_API_BASE` 直连后端，例如 `https://novels.server.chiyoshi.cn/api`。此变量在构建时写入产物，修改后需要重新构建并部署前端；不会回退到当前前端域名。开发环境若从 localhost 跨域直连，也需要把对应 localhost Origin 显式加入后端 CORS_ORIGINS 白名单。

修改环境变量后使用 `docker compose up -d --build` 重建/更新。不要在有翻译任务正在执行时重启。

验证：`npm --prefix backend run test:auth`。
