import type { IncomingMessage, ServerResponse } from 'node:http'

export function applyCors(req: IncomingMessage, res: ServerResponse, origins: readonly string[]): boolean {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Vary', 'Origin')
    if (origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.setHeader('Access-Control-Max-Age', '600')
    }
  }
  if (req.method !== 'OPTIONS') return false
  res.statusCode = origin && !origins.includes(origin) ? 403 : 204
  res.end()
  return true
}
