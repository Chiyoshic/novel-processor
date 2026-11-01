# 前端生产环境路由回退（宝塔 Nginx）

## 原因与复现

前端 `frontend/src/router.ts` 使用 Vue Router `createWebHistory()`。站内跳转由浏览器处理，但刷新、直接打开深层链接，或浏览器后退触发整页加载时，Nginx 会收到 `/settings`、`/login`、`/trash`、`/novel/syosetu/n4703ix/translation` 等请求。这些是前端路由，不是站点根目录里的真实文件。

本次排查线上首页返回 200，上述路径返回 Nginx 404，确认缺少 SPA 回退；不是登录接口或 Vite 代理问题。前端 catch-all 路由也无法处理应用加载前的服务器 404。

## 对现有站点的修复

现有配置的站点根目录是 `/www/wwwroot/novels.chiyoshi.cn`，已包含：

```nginx
include /www/server/panel/vhost/rewrite/html_novels.chiyoshi.cn.conf;
```

在宝塔 **网站 → novels.chiyoshi.cn → 设置 → 伪静态** 中填入仓库 `deploy/nginx/baota-spa.conf` 内容。也可直接编辑上述被 include 的文件。先备份原文件；若已有 `location /` 或 `location = /index.html`，应修改原块而非重复定义。

核心修复为：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

此配置保留 History 模式及现有 URL。现有 SSL、证书验证、安全文件限制、JS/CSS/图片静态资源规则保持原样，不把 API 反向代理到前端域名。不要使用全局 `error_page 404 /index.html`，否则丢失的静态资源也可能返回 HTML。

附带的精确 `/index.html` 规则禁止缓存入口，避免部署更新后使用旧入口；因为 Nginx 子 location 定义 add_header 会影响继承，配置中也保留了现有 HSTS。JS/CSS 仍沿用站点原来的缓存规则。

保存后在服务器检查并平滑重载（宝塔一般也会执行校验）：

```sh
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
```

这次修复无需重新构建前端或重启后端，也不会中断后端翻译任务。仅将配置提交进仓库不会自动修改线上宝塔配置。

## 验证

```sh
curl -I https://novels.chiyoshi.cn/settings
curl -I https://novels.chiyoshi.cn/login
curl -I https://novels.chiyoshi.cn/trash
curl -I https://novels.chiyoshi.cn/novel/syosetu/n4703ix/translation
curl -I https://novels.chiyoshi.cn/index.html
# 不存在的静态资源必须仍返回 404，而不是 HTML 200：
curl -I https://novels.chiyoshi.cn/assets/not-existing.js
```

前四个页面应返回 200 HTML，入口应带 no-store，缺失资源应为 404。浏览器登录后，依次打开设置、详情、翻译和阅读页，刷新并前进/后退检查。未登录访问受保护页面应由前端重定向登录，不应看到 Nginx 404。
