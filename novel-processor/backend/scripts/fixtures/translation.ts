import type { TranslationInitialization } from '../../../shared/translation'

/** Offline sample only; never written into the user's library. */
export const translationFixture: Omit<TranslationInitialization, 'id' | 'createdAt' | 'updatedAt'> = {
  site: 'syosetu', novelId: 'n4703ix', modelId: 1,
  request: {
    modelId: 1, chapterCount: 1, includeSummary: true, includePreface: true, requirements: '简体中文，保持自然的对白。',
    promptVersion: '1.0', model: 'offline', modelName: '测试模型', apiType: 'chat-completions',
    reasoningDialect: 'none', effectiveReasoningLevel: 'default', selectionUnit: 'episode',
    episodes: [{ index: 1, title: '旅程的开始' }], sourceHash: 'offline-fixture', budgetEstimate: 100,
  },
  result: {
    schema_version: '1.0', language: 'zh-CN',
    novel: { original_title: '旅のはじまり', chinese_title: '旅程的开始', plot_summary_zh: '年轻的旅行者莉娜离开故乡，踏上前往北方城市的旅途。在旅途中，她偶遇一位沉默的向导，并逐渐发现这片大陆隐藏的秘密。\n故事以日常对话和旅途见闻展开，围绕相遇、信任与成长推进。' },
    characters: [{ original_name: 'リナ', aliases: ['旅人'], chinese_name: '莉娜', identity_zh: '初次离乡的年轻旅行者，对外界充满好奇。', naming_notes_zh: '采用简洁自然的音译，全文保持一致。', speech_style_zh: '语气轻快，常使用简短问句；保留亲切感。', evidence: [{ episode_index: 1, quote: 'リナは旅に出た。' }], confidence: 'high' }],
    style: { overall_zh: '轻快温暖，以细节传递情绪。', viewpoint_zh: '第三人称限知视角，贴近莉娜的感受。', narration_zh: '叙述平实，适度保留环境描写。', dialogue_zh: '自然简洁，避免书面化。', rhythm_zh: '短句为主，景物描写处适当放缓。', register_zh: '现代汉语，避免过度网络化。' },
    terminology: [{ original: '北の街', chinese: '北方城', category_zh: '地名', notes_zh: '暂按地名处理，后续结合上下文确认。' }],
    worldbuilding_zh: ['故事发生在有商队往来的大陆，城市之间主要依靠陆路连接。'], address_rules_zh: ['熟人间使用名字，陌生人以礼貌称呼为主。'],
    translation_rules_zh: ['保持人名和地名的一致性。', '对白优先采用自然的中文表达，不额外补充原文没有的信息。'], unresolved_questions_zh: ['北方城是否为正式城市名称，需后续章节确认。'],
  },
}
