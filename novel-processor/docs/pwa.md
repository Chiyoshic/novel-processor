# PWA / 苹果主屏幕

## 安装

生产站点必须使用 HTTPS；localhost 可供本地预览。构建使用兼容 Vite 8 的 vite-plugin-pwa，生成 `manifest.webmanifest`、Service Worker 和静态资源预缓存。开发 `npm run dev` 不注册 Service Worker，避免旧缓存干扰开发。

- iPhone / iPad：用 Safari 打开网站 → 分享 → 添加到主屏幕 → 添加。若系统显示“作为 Web App 打开”，保持开启。iOS 不提供 Chromium 的网页安装事件，因此不会强行弹出浏览器安装框。
- Android / Chrome / Edge：浏览器支持安装时会显示页面安装提示，也可从浏览器菜单安装。
- macOS Safari：支持的版本可使用“文件 → 添加到程序坞”。

主屏幕使用独立窗口。图标包括 Apple Touch Icon 180 / 167 / 152 / 120px、标准 PWA 192 / 512px、独立 maskable 图标，以及带透明背景的单色 `monochrome` 图标。Apple Touch Icon 与 any/maskable PNG 不透明，四角不预先裁切，由系统套用蒙版。

原始图形为 `frontend/public/app-icon.svg` 与 `frontend/public/app-icon-monochrome.svg`；`npm --prefix frontend run generate:icons` 可重新生成，`npm run build` 前也会自动生成。苹果图标已保存到 `public`，不是临时外部路径。

## 深色 / 清透（Liquid Glass）主屏幕图标

Apple HIG 当前说明：系统可分割非分层图标的前景与背景，对较大、简单的前景图形施加 Liquid Glass 效果；细线、小字与复杂细节不适合自动处理。此机制不等于 PWA 能提交原生 Icon Composer 分层文件。

本项目采用：
- 纯白不透明背景 + 大块、单一蓝色、圆润书本剪影，书脊使用负空间。替换上一版蓝底细白线，便于系统识别前景。
- 不烘焙玻璃、阴影、渐变、圆角，避免与系统加工叠加。
- 图形位于 maskable 安全区域内；额外提供透明背景纯黑 monochrome PNG，让支持该 purpose 的平台使用。**monochrome 不是苹果 dark/clear 图标开关，不宣称 Safari 一定采用此资源。**
- Apple Touch Icon 与 manifest 图标 URL 添加 `v=adaptive-v2`，避免安装时继续引用旧素材。

iPhone 上部署后，先移除旧主屏幕书签，再用 Safari 打开站点并重新“添加到主屏幕”；长按主屏幕 → 编辑 → 自定，分别检查默认、深色、清透（系统支持时）及着色外观。清透还可受用户的系统明暗外观影响。

图标外观由主屏幕设置控制，不由网页内主题按钮或 CSS `prefers-color-scheme` 控制。不要给多个 Apple Touch Icon 链接加 dark/light media 就宣称可动态切换；不同系统可能忽略 media，或在安装时仅取一张图。最终的分割、配色和玻璃细节由苹果系统决定，必须真机验证；目前未承诺或验证原生分层图标同等效果。

参考（主要用于解释系统设计机制，不等于 Web App 专属能力承诺）：
- Apple HIG App icons：`https://developer.apple.com/design/human-interface-guidelines/app-icons`
- Apple Safari Web Content Guide：`https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html`
- W3C Web App Manifest icon purposes：`https://www.w3.org/TR/appmanifest/#purpose-member`

## 手机阅读器顶部 / 底部栏配色

由单一主题控制器同步 `theme-color`、根元素与 body 的背景、`color-scheme`：阅读器使用当前预设或自定义书页背景；未自定义时跟随系统/站点模式切换暖纸和夜读色。退出阅读器后恢复站点颜色。浅色纸张配浅色方案，夜读背景配深色方案，不因全站模式与阅读器独立配色不同而冲突。

Safari 26 的浏览器工具栏与状态栏会参考页面背景，不应仅依赖 `theme-color`；更早的 Safari / Chrome 仍可使用 meta 提示。安全区和滚动回弹露出的 html/body 同步着色。移除固定 `apple-mobile-web-app-status-bar-style`，避免旧的 black/default 配置干扰系统判断。系统可能对颜色作可读性修正，网页不能强制设置操作系统状态栏字色，真机验收仍然必要。

`npm --prefix frontend run test:appearance` 验证预设、自定义颜色、退出还原及背景/meta 同步。

## 缓存与更新

只预缓存前端入口、打包 JS/CSS、图标和 manifest。**不缓存 AT/RT、登录接口、跨域 API 响应、小说正文或 AI 流式请求**；不会将服务器端已下载的小说误当成浏览器可离线阅读的内容。离线时可以加载已缓存的应用界面，并提示登录/数据功能需要网络；完整离线书库不在本次范围。

新版 Service Worker 就绪后提示“更新并刷新”，用户确认才激活并刷新，避免突然打断阅读/翻译配置。可稍后更新；应用回到前台、恢复网络时检查更新，前台还会每小时检查一次。后端翻译任务仍按原规则独立运行。

Google Fonts 仍沿用在线字体与浏览器缓存，未将第三方字体接口额外持久缓存。离线时字体可能使用系统衬线回退。

独立窗口启动时仍需正常鉴权；部分苹果系统版本可能不复用 Safari 的原登录状态，需要在安装的应用中重新登录。

## 上线

1. `cd frontend && npm ci && npm run build`。
2. 完整部署 `dist/`，不要遗漏 `sw.js`、`workbox-*.js`、`manifest.webmanifest`、`apple-touch-icon.png` 与 `icons/`。
3. 使用更新后的 `deploy/nginx/baota-spa.conf`：保持页面路径 SPA 回退，`sw.js` 禁止缓存，manifest 使用正确 MIME 类型，缺失 SW 不得返回 HTML。
4. `nginx -t` 成功后平滑重载。此功能不修改后端、不需要重启后端。
5. 先传资源文件，最后替换入口及 SW；尽量保留上个构建的带哈希资源，供尚未刷新的页面使用。

服务器验证：

```sh
curl -I https://novels.chiyoshi.cn/manifest.webmanifest
curl -I https://novels.chiyoshi.cn/sw.js
curl -I https://novels.chiyoshi.cn/apple-touch-icon.png
curl -I https://novels.chiyoshi.cn/icons/pwa-512.png
```

均应为 200，manifest 为 `application/manifest+json`，SW 为 JavaScript 并带 no-store。部署后在浏览器开发者工具中检查 manifest、图标、SW 的实际注册和控制状态，再于真实 iPhone 上添加主屏幕验收。更换主屏幕图标后，苹果系统可能保留旧图标，需要删除旧快捷方式重新添加。

本地构建测试：`npm --prefix frontend run test:pwa`。它验证安装元数据、Apple 图标尺寸与不透明白色背景、单色素材的 alpha/实心面积、manifest 引用资源、SW 导航回退及人工确认更新策略，不代表真实苹果设备已完成安装验收。
