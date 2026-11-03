# 登录、会话与权限

## 模式

当前是单用户模式：不开放注册，用户首次由后端环境变量初始化；密码使用带随机盐的 scrypt 哈希保存；Access Token 只保存在前端内存；Refresh Token 只通过 HttpOnly Cookie 传输，并在数据库保存哈希；业务 API 需要有效 AT。

## 初始配置

```dotenv
AUTH_INITIAL_USERNAME=chiyoshi
AUTH_INITIAL_PASSWORD=请设置至少8位的初始密码
AUTH_COOKIE_SECURE=auto
AUTH_COOKIE_SAMESITE=lax
CORS_ORIGINS=https://novels.example.com
```

初始化只在 `auth_users` 没有用户时执行。修改环境变量不会覆盖已有密码。

## 会话生命周期

- AT 默认有效期 15 分钟；
- RT 会话默认绝对有效期 30 天；
- RT 一次性轮换，重放已使用 RT 会撤销对应会话；
- 修改密码会撤销所有设备会话；
- 前端遇到一次 401 时会合并刷新请求并重试原请求一次。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 登录并设置 RT Cookie |
| `POST` | `/api/auth/refresh` | 轮换 RT 并取得新 AT |
| `GET` | `/api/auth/me` | 获取当前用户 |
| `POST` | `/api/auth/logout` | 撤销当前会话 |
| `POST` | `/api/auth/password` | 修改密码并撤销会话 |

鉴权 POST 请求需要 `X-Requested-With: novel-processor`。跨域请求需要 `credentials: include`，后端 CORS 必须写明完整 Origin，不能使用 `*`。

## 跨域部署

前端通过 `VITE_API_BASE` 直连后端，不使用 Vite 代理。HTTPS 页面应访问 HTTPS API。若前端和 API 位于不同主站点，浏览器可能限制第三方 Cookie；优先使用同站点 `/api` 反向代理，或确认 `AUTH_COOKIE_SAMESITE=none` 与 `AUTH_COOKIE_SECURE=true` 的部署条件。
