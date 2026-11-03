# PWA、Apple 图标与更新

## 构建产物

前端构建会生成 manifest、Service Worker、Workbox 文件、Apple Touch Icon、192/512px PWA 图标、maskable 图标和 monochrome 图标。

```sh
npm --prefix novel-processor/frontend run generate:icons
npm --prefix novel-processor/frontend run build
npm --prefix novel-processor/frontend run test:pwa
```

## 安装

- iPhone / iPad：Safari → 分享 → 添加到主屏幕；
- Android：Chrome / Edge 菜单中的安装入口；
- macOS：支持的 Safari 版本可添加到程序坞。

生产安装必须使用 HTTPS。开发模式不注册 Service Worker。

## 缓存边界

Service Worker 只缓存应用壳、打包资源、图标和 manifest，不缓存 AT/RT、登录响应、小说目录正文、SQLite 数据或 AI 流式请求。离线时可以打开部分界面，但完整书库和 AI 功能仍需网络。

## 更新

应用使用用户确认后激活新 Service Worker 的策略，不在阅读或翻译中强制刷新。部署新版本时应完整上传 `dist/`，`index.html`、`sw.js` 和 manifest 不应长期缓存。

## Apple 深色和 Liquid Glass

网页只能提供图标素材，不能保证 Safari 或 iOS 一定按照原生 Icon Composer 的分层规则处理暗色、清透或 Liquid Glass。系统最终决定主屏幕图标效果，更新图标后可能需要删除旧图标并重新添加。

页面主题和阅读器纸色会同步浏览器背景与 `theme-color`，但状态栏最终颜色仍由系统和浏览器决定，需要真机验证。
