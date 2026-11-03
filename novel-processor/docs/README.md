# 文档

文档按使用功能、部署运维和源码开发组织。版本基线为 `v1.0.0`。

## 按功能阅读

| 功能 | 文档 |
| --- | --- |
| 小说采集、目录与下载 | [features/01-catalog.md](features/01-catalog.md) |
| 书架、作品管理与回收站 | [features/02-library.md](features/02-library.md) |
| 阅读器 | [features/03-reader.md](features/03-reader.md) |
| 阅读进度 | [features/04-reading-progress.md](features/04-reading-progress.md) |
| 登录、会话与权限 | [features/05-auth.md](features/05-auth.md) |
| AI 翻译与材料维护 | [features/06-ai-translation.md](features/06-ai-translation.md) |
| PWA、Apple 图标与更新 | [features/07-pwa.md](features/07-pwa.md) |

## 部署与运维

| 主题 | 文档 |
| --- | --- |
| 本地源码开发 | [operations/01-local-development.md](operations/01-local-development.md) |
| 生产部署、Docker 与 Nginx | [operations/02-production.md](operations/02-production.md) |
| 数据、备份与恢复 | [operations/03-data-backup.md](operations/03-data-backup.md) |

## 源码开发

| 主题 | 文档 |
| --- | --- |
| 系统架构与数据边界 | [development/01-architecture.md](development/01-architecture.md) |
| 新增小说站点适配器 | [development/02-site-adapter.md](development/02-site-adapter.md) |
| 测试、验证与贡献 | [development/03-testing.md](development/03-testing.md) |
| HTTP API | [api.md](api.md) |

## 文档约定

- 根目录 [`README.md`](../../README.md) 面向使用者，负责项目介绍、快速开始和文档导航。
- [`frontend/README.md`](../frontend/README.md) 面向前端开发和静态部署。
- [`backend/README.md`](../backend/README.md) 面向后端开发、Docker 和 API 服务。
- 本目录中的示例不包含真实密码、API Key 或个人书库数据。
- 代码行为优先于旧文档；如果发现文档与源码不一致，应在同一个改动中修正。
