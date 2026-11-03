# 新增小说站点适配器

## 原则

所有站点差异集中在 `backend/src/lib/sites/<site>/`，通用流水线不得出现 `if (site === '...')`。适配器只负责站点知识，业务层负责统一流程和存储。

## SiteAdapter

适配器需要实现：

- `id`、`name`、`hosts`；
- `capabilities`；
- `match(url)`；
- `resolve(input)`；
- `indexUrl(ref, page)`；
- `episodeUrl(ref, index)`；
- `parseIndexPage(html, ref, page)`；
- `parseEpisodePage(html, ref, index)`；
- 可选的官方元数据富化。

目录解析返回有序的章/话条目流。分页合并完成后，通用 pipeline 再归章和分配 episode index，避免章节跨页时丢失关系。

## 实现步骤

1. 创建 `backend/src/lib/sites/<site>/`；
2. 在 `adapter.ts` 实现 URL 规范化、目录和正文解析；
3. 在 `selectors.ts` 集中保存 DOM 选择器；
4. 必要时在 `api.ts` 实现站点官方 API 富化；
5. 在 `registry.ts` 注册；
6. 补充本地 HTML fixture 和异常测试；
7. 验证空简介、分页、缺失章、重复话号、日期和状态映射；
8. 运行后端类型检查及采集测试。

## 数据约束

- 时间保存时带时区偏移；
- 可空字段使用 `null`；
- `chapterIndex` 可以为 `null`；
- 局部异常写入 `fetch.warnings`；
- 不把站点特有字段泄漏到通用 pipeline；
- 适配器不得绕过 `HttpClient` 的节奏、并发和取消机制。

## 合规

新增适配器前确认目标站点使用条款、访问频率和内容权限。不要把真实长篇正文或用户数据作为 fixture 提交。
