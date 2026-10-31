/**
 * 站点注册表：把「用户输入」路由到正确的适配器。
 *
 * 新增站点的唯一入口——写一个实现 SiteAdapter 的类，在这里注册即可。
 */
import { NovelError } from '../errors'
import type { NovelRef, SiteAdapter, SiteId } from '../types'
import { SyosetuAdapter } from './syosetu/adapter'

/** 内置适配器列表（顺序即匹配优先级）。 */
export const builtinAdapters: SiteAdapter[] = [new SyosetuAdapter()]

export interface ResolvedTarget {
  adapter: SiteAdapter
  ref: NovelRef
}

/** 依次尝试所有适配器解析输入。 */
export function resolveTarget(input: string, adapters: SiteAdapter[] = builtinAdapters): ResolvedTarget {
  const raw = input.trim()
  if (!raw) {
    throw new NovelError('INVALID_INPUT', '输入为空')
  }

  for (const adapter of adapters) {
    const ref = adapter.resolve(raw)
    if (ref) return { adapter, ref }
  }

  throw new NovelError(
    'UNSUPPORTED_SITE',
    `无法识别该输入：${raw}。已支持的站点：${adapters.map((a) => a.name).join('、')}`,
    { input: raw, supported: adapters.map((a) => a.id) },
  )
}

/** 按站点 ID 取适配器。 */
export function getAdapter(site: SiteId, adapters: SiteAdapter[] = builtinAdapters): SiteAdapter {
  const found = adapters.find((a) => a.id === site)
  if (!found) {
    throw new NovelError('UNSUPPORTED_SITE', `未注册的站点：${site}`, { site })
  }
  return found
}
