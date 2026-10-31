/** Direct API address shared by login, refresh, regular requests and model streams. */
export function normalizeApiBase(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请在 frontend/.env 配置 VITE_API_BASE，例如 https://novels.server.chiyoshi.cn/api')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('VITE_API_BASE 必须是完整的 HTTP/HTTPS 后端地址，不能使用相对路径') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('VITE_API_BASE 必须是无凭据、查询参数或片段的 HTTP/HTTPS 地址')
  url.pathname = url.pathname.replace(/\/+$/, '') || '/api'
  return url.toString().replace(/\/$/, '')
}

