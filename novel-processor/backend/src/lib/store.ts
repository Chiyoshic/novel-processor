/**
 * 正文存储抽象。
 *
 * 采集内核不碰文件系统——存哪里由调用方决定：
 * - 浏览器/预览：`MemoryEpisodeStore`
 * - Node 侧：`FsEpisodeStore`（见 scripts/fs-store.ts）
 * - 远端服务：自行实现 `EpisodeStore`（写数据库 / 对象存储）
 *
 * 这样同一套下载逻辑既能跑在前端，也能跑在后端。
 */
import type { EpisodeContent, NovelRef } from './types'

/** 批量下载清单。 */
export interface EpisodeManifest {
  site: string
  novelId: string
  updatedAt: string
  /** 当前已落盘的正文数 */
  have: number
  lastRun: {
    total: number
    fetched: number
    skipped: number
    failed: Array<{ index: number; error: string }>
    durationMs: number
    concurrency: number
  }
}

/** 正文存储契约。 */
export interface EpisodeStore {
  /** 是否已存在某一话（用于断点续传） */
  has(ref: NovelRef, index: number): Promise<boolean>
  /** 读取某一话，不存在返回 null */
  read(ref: NovelRef, index: number): Promise<EpisodeContent | null>
  /** 写入某一话（覆盖） */
  write(ref: NovelRef, content: EpisodeContent, options?: { preserveTranslation?: boolean }): Promise<void>
  /** 列出已存在的所有话序号 */
  list(ref: NovelRef): Promise<number[]>
  /** 删除某一话（可选能力） */
  remove?(ref: NovelRef, index: number): Promise<void>
  /** 读取清单（可选能力） */
  readManifest?(ref: NovelRef): Promise<EpisodeManifest | null>
  /** 写入清单（可选能力） */
  writeManifest?(ref: NovelRef, manifest: EpisodeManifest): Promise<void>
}

/** 存储键：站点 + 作品 ID。 */
export function storeKey(ref: NovelRef): string {
  return `${ref.site}:${ref.novelId}`
}

/**
 * 内存存储：用于浏览器环境、单元测试，或「先看效果再决定落盘」的场景。
 */
export class MemoryEpisodeStore implements EpisodeStore {
  private readonly episodes = new Map<string, Map<number, EpisodeContent>>()
  private readonly manifests = new Map<string, EpisodeManifest>()

  private bucket(ref: NovelRef): Map<number, EpisodeContent> {
    const key = storeKey(ref)
    let map = this.episodes.get(key)
    if (!map) {
      map = new Map()
      this.episodes.set(key, map)
    }
    return map
  }

  async has(ref: NovelRef, index: number): Promise<boolean> {
    return this.bucket(ref).has(index)
  }

  async read(ref: NovelRef, index: number): Promise<EpisodeContent | null> {
    return this.bucket(ref).get(index) ?? null
  }

  async write(ref: NovelRef, content: EpisodeContent, options?: { preserveTranslation?: boolean }): Promise<void> {
    const previous = this.bucket(ref).get(content.index)
    const next = options?.preserveTranslation !== false && !content.translation && previous?.translation ? { ...content, translation: previous.translation } : content
    this.bucket(ref).set(content.index, next)
  }

  async list(ref: NovelRef): Promise<number[]> {
    return [...this.bucket(ref).keys()].sort((a, b) => a - b)
  }

  async remove(ref: NovelRef, index: number): Promise<void> {
    this.bucket(ref).delete(index)
  }

  async readManifest(ref: NovelRef): Promise<EpisodeManifest | null> {
    return this.manifests.get(storeKey(ref)) ?? null
  }

  async writeManifest(ref: NovelRef, manifest: EpisodeManifest): Promise<void> {
    this.manifests.set(storeKey(ref), manifest)
  }
}
