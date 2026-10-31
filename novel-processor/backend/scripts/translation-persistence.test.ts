import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { LibraryDb } from '../server/db'
import { translationFixture } from './fixtures/translation'

test('初始化材料完整存入 SQLite，关闭再打开仍可读取，重复初始化只替换同一本书', () => {
  const dir = mkdtempSync(join(tmpdir(), 'translation-persistence-'))
  const file = join(dir, 'test.sqlite')
  let db = new LibraryDb(file)
  try {
    assert.equal(db.getTranslationInitialization('syosetu', 'n4703ix'), null)
    const saved = db.saveTranslationInitialization(translationFixture)
    assert.deepEqual(saved.request, translationFixture.request)
    assert.deepEqual(saved.result, translationFixture.result)
    assert.ok(saved.id > 0)
    db.close()
    db = new LibraryDb(file)
    assert.deepEqual(db.getTranslationInitialization('syosetu', 'n4703ix'), saved)
    const other = db.saveTranslationInitialization({ ...translationFixture, site: 'other-site' })
    const updated = db.saveTranslationInitialization({ ...translationFixture, result: { ...translationFixture.result, novel: { ...translationFixture.result.novel, chinese_title: '更新后的书名' } } })
    assert.equal(updated.id, saved.id)
    assert.equal(updated.createdAt, saved.createdAt)
    assert.equal(updated.result.novel.chinese_title, '更新后的书名')
    assert.deepEqual(db.getTranslationInitialization('other-site', 'n4703ix'), other)
    db.close()
    db = new LibraryDb(file)
    assert.deepEqual(db.getTranslationInitialization('syosetu', 'n4703ix'), updated)
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }) }
})
