import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCharacterMatcher, type ReaderCharacter } from '../../frontend/src/lib/reader-characters'
function character(original_name: string, chinese_name: string, aliases: string[] = []): ReaderCharacter {
  return { original_name, chinese_name, aliases, identity_zh: '人物简介', naming_notes_zh: '', speech_style_zh: '', evidence: [], confidence: 'high' }
}
test('原文精确匹配原名和别名，较长姓名优先，重复出现均可识别', () => {
  const match = createCharacterMatcher([character('リアム', '利亚姆'), character('リアム・ウィルモット', '利亚姆·威尔莫特', ['ウィルモット'])], false)
  const parts = match('リアム・ウィルモットとリアム、ウィルモット。')
  assert.deepEqual(parts.filter((part) => part.characterIndices), [
    { text: 'リアム・ウィルモット', characterIndices: [1] },
    { text: 'リアム', characterIndices: [0, 1] },
    { text: 'ウィルモット', characterIndices: [1] },
  ])
  assert.equal(parts.map((part) => part.text).join(''), 'リアム・ウィルモットとリアム、ウィルモット。')
})
test('译文匹配中文名与别名，原文/译文切换不串用主名', () => {
  const characters = [character('アデル', '阿黛尔', ['小黛'])]
  const text = 'アデル说阿黛尔，又叫小黛。'
  assert.deepEqual(createCharacterMatcher(characters, true)(text).filter((part) => part.characterIndices).map((part) => part.text), ['阿黛尔', '小黛'])
  assert.deepEqual(createCharacterMatcher(characters, false)(text).filter((part) => part.characterIndices).map((part) => part.text), ['アデル', '小黛'])
})
test('重名/重复资料保留所有候选，不机械选择或合并人物', () => {
  const parts = createCharacterMatcher([character('アデル', '阿黛尔', ['アデル']), character('アデル', '阿黛尔')], false)('アデル')
  assert.deepEqual(parts, [{ text: 'アデル', characterIndices: [0, 1] }])
})
test('拉丁文姓名不误匹配为其他单词的片段，特殊字符仅按字面匹配', () => {
  const parts = createCharacterMatcher([character('Ann', '安'), character('A+B', '甲乙')], false)('Anna met Ann. A+B and AAB.')
  assert.deepEqual(parts.filter((part) => part.characterIndices).map((part) => part.text), ['Ann', 'A+B'])
})
test('关闭或无人物资料时完整保留文本，HTML/换行/表情不变且不输出 HTML 标记', () => {
  const text = '<script>alert(1)</script>\n「アデル」😀'
  assert.deepEqual(createCharacterMatcher([], false)(text), [{ text }])
  const parts = createCharacterMatcher([character('アデル', '阿黛尔')], false)(text)
  assert.equal(parts.map((part) => part.text).join(''), text)
  assert.equal(parts.filter((part) => part.characterIndices).length, 1)
  assert.deepEqual(createCharacterMatcher([character(' ', ' ')], false)(''), [{ text: '' }])
})

test('中文全名支持名字/姓氏简称，完整姓名仍作为整体优先匹配', () => {
  const text = '诺艾尔望向布朗家，诺艾尔·布朗走了过来。'
  const parts = createCharacterMatcher([character('ノエル・ブラウン', '诺艾尔·布朗')], true)(text)
  assert.deepEqual(parts.filter((part) => part.characterIndices), [
    { text: '诺艾尔', characterIndices: [0] },
    { text: '布朗', characterIndices: [0] },
    { text: '诺艾尔·布朗', characterIndices: [0] },
  ])
  assert.equal(parts.map((part) => part.text).join(''), text)
})
test('日文姓名与复合别名也支持简称，不受中点/空格分隔方式影响', () => {
  const match = createCharacterMatcher([character('ノエル・ブラウン', '诺艾尔·布朗', ['ノエル･スミス'])], false)
  assert.deepEqual(match('ノエルとブラウン、スミス。').filter((part) => part.characterIndices).map((part) => part.text), ['ノエル', 'ブラウン', 'スミス'])
  const english = createCharacterMatcher([character('Noel Brown', '诺艾尔·布朗')], false)
  assert.deepEqual(english('Noel Brown met Noel and Brown, not Brownie.').filter((part) => part.characterIndices).map((part) => part.text), ['Noel Brown', 'Noel', 'Brown'])
})
test('简称相同或与另一条完整姓名冲突时保留多个候选，完整姓名不串人', () => {
  const match = createCharacterMatcher([character('A', '诺艾尔·布朗'), character('B', '诺艾尔·史密斯'), character('C', '诺艾尔')], true)
  assert.deepEqual(match('诺艾尔，诺艾尔·史密斯。').filter((part) => part.characterIndices), [
    { text: '诺艾尔', characterIndices: [0, 1, 2] },
    { text: '诺艾尔·史密斯', characterIndices: [1] },
  ])
})
test('不随意截断无分隔姓名，不生成单字、爵位或常见连接词简称', () => {
  const characters = [character('Noel von Brown', '冯·诺艾尔·布朗', ['诺艾尔 先生']), character('李明', '李明')]
  const text = '冯、诺、先生、von、李、明；诺艾尔；李明。'
  assert.deepEqual(createCharacterMatcher(characters, true)(text).filter((part) => part.characterIndices).map((part) => part.text), ['诺艾尔', '李明'])
  assert.deepEqual(createCharacterMatcher(characters, false)('von Noel Brown').filter((part) => part.characterIndices).map((part) => part.text), ['Noel', 'Brown'])
})
