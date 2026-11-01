# 第二步：章节翻译

入口：AI 翻译 → 章节翻译。先完成初始化，再选择模型与若干话。目录分章可整章选择，也可逐话、多选或全选已下载的正文。

## 快捷选话

章节列表上方可输入起止话号选择范围（包含两端），或者从话号最小的未译话开始选 N 话（1–1000）。快捷选择替换当前勾选并切回全部章节展示；只选择已下载的话，过期译文视为待译。范围选择遵循“允许重新翻译”开关；“最早未译”始终排除有效已有译文，即使开启重译也不会混入。可用话数不足 N 时选择实际可用数量并提示，选话不自动开始翻译。

## 调用与提示词

提示词实现：`backend/src/episode-translation.ts`。

每次只翻译一话，输入包括：
- 初始化要求与本次附加要求；
- 最新的初始化材料 baseline（上一话的补充已应用）；
- 本话 ID、标题、前言、全文、后记；
- 本话之前最近 N 话的完整中文译文：界面可设置 0–50 话，默认 1，0 表示关闭。按目录位置向前选取有效译文，并按从早到晚顺序传入 `reference_translations` 数组；不足时使用实际数量，不回填本话或后续章节，跳过过期译文。串行翻译每话前重新选取，因此同批刚完成的译文也会加入后续参考。

参考译文帮助理解前文承接关系，并指导文风、节奏和译名习惯，不把它的剧情或句子复制到本话；最新 baseline 优先。本话需要完整翻译，禁止摘要化、增写或输出 HTML。

输出示例：

```json
{
  "translation": { "title": "中文标题", "preface": "", "body": "完整中文正文", "afterword": "" },
  "updates": [
    { "field": "characters", "action": "create", "value": { "original_name": "リナ", "aliases": [], "chinese_name": "莉娜", "identity_zh": "旅行者", "naming_notes_zh": "音译", "speech_style_zh": "简洁", "evidence": [{ "episode_index": 2 }], "confidence": "medium" } },
    { "field": "translation_rules_zh", "action": "update", "index": 0, "value": "新规则" },
    { "field": "terminology", "action": "delete", "index": 1 },
    { "field": "style", "action": "update", "key": "dialogue_zh", "value": "自然口语" }
  ]
}
```

数组字段支持 create/read/update/delete；index 从 **0** 开始，始终针对本次调用 baseline 快照的原始序号。删除第 0 项不会改变这批指令里第 1 项的定位。create 追加，update 提供完整新值，read 仅在报告里返回内容。对象字段按白名单 key 修改，禁止修改原文书名、schema 与语言标记。

非法指令逐条忽略并记录警告，不使有效译文失败。错误下标、错误字段、错误类型和原型路径均不能破坏材料。只对译文必需字段和 JSON 结构作检查，不核验引用原句或人物姓名。

参考数量计入模型输入预算；预算不足会提示减少参考话数或更换模型，不静默截断参考译文。任务面板显示实际载入的话 ID 与实际/设定数量；每话 JSON 的 `translation.referenceEpisodeIndices` 保存完整参考列表，`referenceEpisodeCount` 保存本次设定，旧 `referenceEpisodeIndex` 保留最近一话以兼容旧记录。无需 SQLite 表结构迁移。

## 任务与存储

- 后端串行执行，浏览器离开或刷新不停止。停止按钮中止当前调用并取消后续排队话。
- 同一本书初始化与章节翻译互斥；翻译与正文下载互斥。
- 单话失败后继续后面的章节，已经成功的内容不撤销；默认跳过有有效译文的话。
- 与初始化共用 AiModelClient：60 分钟调用总时限、180 秒无上游事件超时、最多 3 次调用，支持 Chat Completions/Responses、思考等级、DSML、JSON 修复。正常持续输出不会被 180 秒硬切断。
- 译文追加在原话 JSON 的 `translation` 字段，原始 title/body/preface/afterword 不改动。通过临时文件 + rename 原子落盘。
- SQLite `episode_translations` 记录状态、是否有旧译文、时间、模型、重试次数、源文件哈希、材料修改报告及警告。
- 每话译文落盘后，材料修改与 SQLite 翻译状态在一个事务中提交；提交失败会恢复旧话 JSON。重新翻译失败保留旧译文。
- 正文重新下载保留译文字段；原文有变化时标记过期。后端重启会把排队/执行中状态标记中断，不误标成功；可重新选择继续。

接口：
- `GET /api/library/:site/:id/translation/episodes`：状态与当前任务快照（含真实流式增量）。
- `POST` 同路径：`{modelId, indices, overwrite, requirements, reasoningLevel?, referenceEpisodeCount?}`。
- `POST .../translation/episodes/stop`：停止当前批次。

阅读器的 `?language=translation` 选择译文，翻页保留语言选择；无译文时回退原文。正文使用真实 article/p 结构，保留 Safari 阅读器兼容。

离线验证：`npm --prefix backend run test:translation`、`npm --prefix backend run test:ai`。
