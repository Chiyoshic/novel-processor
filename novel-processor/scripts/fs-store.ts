/**
 * 文件系统存储实现（Node 专用）。
 *
 * 目录结构：
 * ```
 * <root>/<site>/<novelId>/<index>.json   单话正文
 * <root>/<site>/<novelId>/_manifest.json 下载清单
 * ```
 *
 * 之所以不放进 src/lib：它依赖 node:fs，前端打包不应包含。
 * 浏览器侧请用 `MemoryEpisodeStore`，或由后端提供 HTTP 接口。
 */
import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { EpisodeContent, NovelRef } from '../src/lib/types'
import type { EpisodeManifest, EpisodeStore } from '../src/lib/store'

const MANIFEST_FILE = '_manifest.json'

export class FsEpisodeStore implements EpisodeStore {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  private dirOf(ref: NovelRef): string {
    return join(this.root, ref.site, ref.novelId)
  }

  private fileOf(ref: NovelRef, index: number): string {
    return join(this.dirOf(ref), `${index}.json`)
  }

  async has(ref: NovelRef, index: number): Promise<boolean> {
    try {
      await access(this.fileOf(ref, index))
      return true
    } catch {
      return false
    }
  }

  async read(ref: NovelRef, index: number): Promise<EpisodeContent | null> {
    try {
      const raw = await readFile(this.fileOf(ref, index), 'utf8')
      return JSON.parse(raw) as EpisodeContent
    } catch {
      return null
    }
  }

  async write(ref: NovelRef, content: EpisodeContent): Promise<void> {
    const path = this.fileOf(ref, content.index)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, 'utf8')
  }

  async list(ref: NovelRef): Promise<number[]> {
    try {
      const names = await readdir(this.dirOf(ref))
      return names
        .filter((name) => /^\d+\.json$/.test(name))
        .map((name) => Number(name.slice(0, -5)))
        .sort((a, b) => a - b)
    } catch {
      return []
    }
  }

  async remove(ref: NovelRef, index: number): Promise<void> {
    try {
      await unlink(this.fileOf(ref, index))
    } catch {
      // 文件不存在视为已删除
    }
  }

  async readManifest(ref: NovelRef): Promise<EpisodeManifest | null> {
    try {
      const raw = await readFile(join(this.dirOf(ref), MANIFEST_FILE), 'utf8')
      return JSON.parse(raw) as EpisodeManifest
    } catch {
      return null
    }
  }

  async writeManifest(ref: NovelRef, manifest: EpisodeManifest): Promise<void> {
    const path = join(this.dirOf(ref), MANIFEST_FILE)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
}
