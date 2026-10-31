/**
 * 站点列表的极简共享状态。
 *
 * 站点能力是进程级常量，多个视图都要用（页头状态、导入下拉），
 * 没必要每次进页面都请求一次——这里做一次性缓存。
 */
import { ref } from 'vue'
import type { SiteInfo } from '@/lib'
import { api } from '@/api'

const sites = ref<SiteInfo[]>([])
const loaded = ref(false)

export function useSites() {
  async function load(force = false): Promise<SiteInfo[]> {
    if (loaded.value && !force) return sites.value
    try {
      sites.value = await api.sites()
    } catch {
      sites.value = []
    } finally {
      loaded.value = true
    }
    return sites.value
  }

  return { sites, loaded, load }
}
