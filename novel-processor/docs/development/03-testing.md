# 测试、验证与贡献

## 前端验证

```sh
cd novel-processor/frontend
npm run typecheck
npm run test:select
npm run test:appearance
npm run build
npm run test:pwa
```

`test:appearance` 会检查主题样式编译结果，避免 Vue scoped CSS 的 `:global()` 规则污染全局文字色；`test:select` 覆盖下拉交互和无原生 select 约束。

## 后端验证

```sh
cd novel-processor/backend
npm run typecheck
npm run test:auth
npm run test:ai
npm run test:translation
npm run test:maintenance
npm run test:reading
npm run test:download
```

测试使用临时 SQLite、临时正文目录和本地模拟模型服务，不需要访问付费模型或真实小说站点。

## 提交前检查

```sh
git diff --check
```

同时确认：

- 不包含 `.env`、密码、API Key、小说正文或运行时 `data/`；
- 前后端共享类型同步；
- UI 修改覆盖移动端、暗色模式和阅读器自定义背景；
- AI 修改覆盖流式、重试、取消、JSON 修复和旧数据保护；
- 生产行为与 Docker、Nginx 和 PWA 缓存说明一致。

## 贡献原则

新功能优先复用已有组件和领域服务。站点功能通过 adapter 扩展，模型功能通过 `AiModelClient` 封装，数据修改保持原子写入。提交 Issue 时请提供版本/提交号、Node.js/浏览器版本、部署方式、复现步骤和脱敏日志。
