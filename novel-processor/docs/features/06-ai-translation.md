# AI 翻译与材料维护

## 翻译流程

翻译分成初始化材料和章节翻译两个阶段。

### 初始化材料

选择作品简介、所选各话前言和前 N 话正文，模型输出并保存中文书名、中文剧情梗概、角色原名/中文译名/中日别名、角色身份、命名说明、说话风格、整本书笔调、关键术语、世界观、称谓规则、翻译规则和待确认事项。

初始化结果保存到 SQLite，后续逐话翻译读取最新材料。

### 章节翻译

可以逐话、多选、按话号范围或从最小未译话开始选择。批次按目录顺序串行执行。每话输入包括最新初始化材料、当前 episode 内容、附加翻译要求和最近若干话的有效译文。

参考译文数量支持 `0–50`，默认 1。参考译文按目录顺序传给模型，不重复当前话或未来话。

## 模型能力

模型管理支持 Responses API、Chat Completions API、自定义 Base URL、明文 API Key、自定义请求头、自定义扩展请求体、`window_tokens`/`input_tokens`/`output_tokens`、OpenAI/DeepSeek/无思考方言、DeepSeek DSML 兼容处理和可用思考等级。

模型配置保存在 SQLite 的 `ai_models` 表中。API Key 不进入前端构建产物，请限制 `data/` 权限。

## 可靠性

- 默认总任务时限 60 分钟；
- 流式首事件和空闲事件默认 180 秒；持续输出不会被固定 180 秒截断；
- 网络、限流、服务端错误和超时进行有界重试；
- 默认最多 3 次尝试；
- JSON 先本地修复，再执行字段和业务校验；
- 失败不替换已有材料或旧译文；
- 每次任务记录调用时间、阶段、流式输出、重试和失败原因。

初始化和材料维护使用请求关联任务；章节批量翻译由后端继续执行，刷新页面不会停止，使用停止按钮取消。

## 材料 CRUD 与重复维护

逐话模型可以输出材料修改数组：`create` 追加、`update` 按基线数组序号更新、`delete` 按基线数组序号删除、`read` 只报告不写入。

程序逐条验证字段、类型、范围和可修改白名单。非法操作记录警告并忽略，不让有效译文失败。引用章节使用 episode ID，不校验引用原句。

材料维护支持疑似重复检查、AI 合并和按模块压缩总结。预览不会立即覆盖材料，应用时检查基线哈希；版本冲突要求重新生成预览。应用前自动备份，支持恢复。

## 译文存储

译文追加到原 episode JSON 的 `translation` 字段，原文字段保留。SQLite 的 `episode_translations` 保存状态、模型、重试次数、源哈希、警告和材料修改报告。

## 相关接口

- `GET/POST /api/library/:site/:novelId/translation/initialize`
- `GET/POST /api/library/:site/:novelId/translation/episodes`
- `POST /api/library/:site/:novelId/translation/episodes/stop`
- `GET /api/library/:site/:novelId/translation/maintenance`
- `POST /api/library/:site/:novelId/translation/maintenance/preview`
- `POST /api/library/:site/:novelId/translation/maintenance/apply`
- `POST /api/library/:site/:novelId/translation/maintenance/restore`
