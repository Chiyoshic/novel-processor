# 第二步：章节翻译

入口：AI 翻译 → 章节翻译。先完成初始化，再选择模型与若干话。目录分章可整章选择，也可逐话、多选或全选已下载的正文。

## 调用与提示词

提示词实现：`backend/src/episode-translation.ts`。

每次只翻译一话，输入包括：
- 初始化要求与本次附加要求；
- 最新的初始化材料 baseline（上一话的补充已应用）；
- 本话 ID、标题、前言、全文、后记；
- 另一话的完整中文译文：优先最近的已译前一话，否则其他已有译文。过期译文不会被当作文风参考。

参考译文只指导文风、节奏和译名习惯，不把它的剧情或句子复制到本话；最新 baseline 优先。本话需要完整翻译，禁止摘要化、增写或输出 HTML。

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
- `POST` 同路径：`{modelId, indices, overwrite, requirements, reasoningLevel?}`。
- `POST .../translation/episodes/stop`：停止当前批次。

阅读器的 `?language=translation` 选择译文，翻页保留语言选择；无译文时回退原文。正文使用真实 article/p 结构，保留 Safari 阅读器兼容。

离线验证：`npm --prefix backend run test:translation`、`npm --prefix backend run test:ai`。
