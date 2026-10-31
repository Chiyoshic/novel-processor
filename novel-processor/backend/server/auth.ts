import Database from 'better-sqlite3'
import { randomBytes, randomUUID, scrypt, createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthTokens, AuthUser } from '../../shared/auth'

const ACCESS_TTL = 15 * 60 * 1000
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000
const COOKIE = 'np_rt'
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
interface UserRow { id: number; username: string; password_hash: string }
interface RefreshRow { hash: string; session_id: string; used_at: number | null; expires_at: number; user_id: number }
export interface AuthOptions { allowedOrigins: string[]; cookieSecure?: 'auto' | 'true' | 'false'; cookieSameSite?: 'lax' | 'strict' | 'none'; accessTtlMs?: number; refreshTtlMs?: number; now?: () => number }
export class AuthError extends Error { readonly status: number; constructor(message: string, status = 401) { super(message); this.status = status } }
function digest(token: string): string { return createHash('sha256').update(token).digest('hex') }
function derive(password: string, salt: Buffer): Promise<Buffer> { return new Promise((resolve, reject) => scrypt(password, salt, 64, SCRYPT, (error, key) => error ? reject(error) : resolve(key))) }
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$131072$8$1$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('$')
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1') return false
  const salt = Buffer.from(parts[4]!, 'base64url'); const expected = Buffer.from(parts[5]!, 'base64url')
  if (salt.length !== 16 || expected.length !== 64) return false
  return timingSafeEqual(await derive(password, salt), expected)
}
function validPassword(password: unknown): password is string { return typeof password === 'string' && password.length >= 8 && password.length <= 128 }
function json(res: ServerResponse, status: number, body: unknown): void { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Pragma: 'no-cache' }); res.end(JSON.stringify(body)) }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new AuthError('请使用 JSON 请求', 415)
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of req) { size += (chunk as Buffer).length; if (size > 8192) throw new AuthError('请求内容过大', 413); chunks.push(chunk as Buffer) }
  try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown> }
  catch { throw new AuthError('JSON 格式错误', 400) }
}
export class AuthService {
  private readonly db: Database.Database
  private readonly options: AuthOptions
  private readonly now: () => number
  private readonly limits = new Map<string, { count: number; until: number }>()
  private hashJobs = 0
  private dummyHash = ''
  constructor(file: string, options: AuthOptions) {
    this.options = options; this.now = options.now ?? Date.now
    if (options.allowedOrigins.includes('*')) throw new Error('登录鉴权需要精确的 CORS_ORIGINS 白名单，不允许 *')
    if (options.cookieSameSite === 'none' && options.cookieSecure === 'false') throw new Error('SameSite=None 必须启用 Secure Cookie')
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_access_tokens (hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE, used_at INTEGER);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_access_session ON auth_access_tokens(session_id);
      CREATE INDEX IF NOT EXISTS idx_auth_refresh_session ON auth_refresh_tokens(session_id);
    `)
  }
  async seed(username: string, password: string): Promise<boolean> {
    if (this.db.prepare('SELECT id FROM auth_users LIMIT 1').get()) return false
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(username) || !validPassword(password)) throw new Error('首次启动请配置 AUTH_INITIAL_USERNAME 和 8–128 位 AUTH_INITIAL_PASSWORD')
    const hash = await hashPassword(password)
    const inserted = this.db.prepare('INSERT OR IGNORE INTO auth_users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(username.toLowerCase(), hash, this.now(), this.now())
    return inserted.changes > 0
  }
  private rate(key: string, max: number, windowMs: number): void {
    const now = this.now()
    for (const [oldKey, value] of this.limits) if (value.until <= now) this.limits.delete(oldKey)
    if (this.limits.size >= 1000 && !this.limits.has(key)) throw new AuthError('请求过于频繁，请稍后再试', 429)
    const value = this.limits.get(key) ?? { count: 0, until: now + windowMs }
    if (++value.count > max) throw new AuthError('请求过于频繁，请稍后再试', 429)
    this.limits.set(key, value)
  }
  private async check(password: string, hash: string): Promise<boolean> {
    if (this.hashJobs >= 2) throw new AuthError('验证繁忙，请稍后重试', 429)
    this.hashJobs++
    try { return await verifyPassword(password, hash) } finally { this.hashJobs-- }
  }
  private cleanup(): void { this.db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(this.now()); this.db.prepare('DELETE FROM auth_access_tokens WHERE expires_at <= ?').run(this.now()) }
  private issue(user: AuthUser, sessionId: string, sessionExpiresAt: number) {
    const accessToken = `at_${randomBytes(32).toString('base64url')}`
    const refreshToken = `rt_${randomBytes(32).toString('base64url')}`
    const expiresAt = Math.min(this.now() + (this.options.accessTtlMs ?? ACCESS_TTL), sessionExpiresAt)
    this.db.prepare('INSERT INTO auth_access_tokens (hash, session_id, expires_at) VALUES (?, ?, ?)').run(digest(accessToken), sessionId, expiresAt)
    this.db.prepare('INSERT INTO auth_refresh_tokens (hash, session_id) VALUES (?, ?)').run(digest(refreshToken), sessionId)
    const tokens: AuthTokens = { accessToken, tokenType: 'Bearer', expiresIn: Math.max(0, Math.floor((expiresAt - this.now()) / 1000)), expiresAt, user }
    return { tokens, refreshToken, refreshExpiresAt: sessionExpiresAt }
  }
  async login(username: unknown, password: unknown, ip: string) {
    this.rate(`login:${ip}`, 10, 15 * 60 * 1000)
    this.rate('login:global', 40, 15 * 60 * 1000)
    if (typeof username !== 'string' || username.length > 64 || typeof password !== 'string' || password.length > 128) throw new AuthError('用户名或密码错误')
    const user = this.db.prepare('SELECT * FROM auth_users WHERE username = ?').get(username.trim().toLowerCase()) as UserRow | undefined
    // Unknown users take the same password-hashing path; never return account-existence information.
    const fallback = this.db.prepare('SELECT password_hash FROM auth_users LIMIT 1').get() as { password_hash: string } | undefined
    if (!fallback && !this.dummyHash) this.dummyHash = await hashPassword(randomBytes(32).toString('hex'))
    const matches = await this.check(password, user?.password_hash ?? fallback?.password_hash ?? this.dummyHash)
    if (!user || !matches) throw new AuthError('用户名或密码错误')
    return this.db.transaction(() => {
      this.cleanup()
      const current = this.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(user.id) as { password_hash: string } | undefined
      if (!current || current.password_hash !== user.password_hash) throw new AuthError('密码已变化，请重新登录')
      const sessionId = randomUUID(); const expiresAt = this.now() + (this.options.refreshTtlMs ?? REFRESH_TTL)
      this.db.prepare('INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(sessionId, user.id, this.now(), expiresAt)
      const result = this.issue({ id: user.id, username: user.username }, sessionId, expiresAt)
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20)').run(user.id, user.id)
      return result
    })()
  }
  refresh(token: string) {
    if (!/^rt_[\w-]{43}$/.test(token)) throw new AuthError('登录已过期，请重新登录')
    // A replay revokes the session family; commit revocation before returning an error.
    const result = this.db.transaction(() => {
      this.cleanup()
      const row = this.db.prepare('SELECT r.*, s.user_id, s.expires_at FROM auth_refresh_tokens r JOIN auth_sessions s ON s.id=r.session_id WHERE r.hash=?').get(digest(token)) as RefreshRow | undefined
      if (!row) return null
      if (row.used_at !== null) { this.db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(row.session_id); return null }
      this.db.prepare('UPDATE auth_refresh_tokens SET used_at = ? WHERE hash = ?').run(this.now(), row.hash)
      const user = this.db.prepare('SELECT id, username FROM auth_users WHERE id = ?').get(row.user_id) as AuthUser
      return this.issue(user, row.session_id, row.expires_at)
    })()
    if (!result) throw new AuthError('登录已过期，请重新登录')
    return result
  }
  authenticate(req: IncomingMessage): AuthUser {
    const match = /^Bearer (at_[\w-]{43})$/.exec(req.headers.authorization ?? '')
    if (!match) throw new AuthError('请先登录')
    const user = this.db.prepare(`SELECT u.id, u.username FROM auth_access_tokens a JOIN auth_sessions s ON s.id=a.session_id JOIN auth_users u ON u.id=s.user_id WHERE a.hash=? AND a.expires_at>? AND s.expires_at>?`).get(digest(match[1]!), this.now(), this.now()) as AuthUser | undefined
    if (!user) throw new AuthError('登录已过期，请重新登录')
    return user
  }
  logout(refreshToken: string, accessToken?: string): void {
    if (refreshToken) this.db.prepare('DELETE FROM auth_sessions WHERE id IN (SELECT session_id FROM auth_refresh_tokens WHERE hash=?)').run(digest(refreshToken))
    if (accessToken) this.db.prepare('DELETE FROM auth_sessions WHERE id IN (SELECT session_id FROM auth_access_tokens WHERE hash=?)').run(digest(accessToken))
  }
  async changePassword(user: AuthUser, oldPassword: unknown, newPassword: unknown): Promise<void> {
    this.rate(`password:${user.id}`, 5, 10 * 60 * 1000)
    if (typeof oldPassword !== 'string' || oldPassword.length > 128 || !validPassword(newPassword)) throw new AuthError('新密码需为 8–128 位', 400)
    const current = this.db.prepare('SELECT * FROM auth_users WHERE id = ?').get(user.id) as UserRow | undefined
    if (!current || !await this.check(oldPassword, current.password_hash)) throw new AuthError('当前密码不正确', 400)
    if (newPassword === oldPassword) throw new AuthError('新密码不能与当前密码相同', 400)
    if (this.hashJobs >= 2) throw new AuthError('验证繁忙，请稍后重试', 429)
    this.hashJobs++
    let hash: string
    try { hash = await hashPassword(newPassword) } finally { this.hashJobs-- }
    this.db.transaction(() => {
      const result = this.db.prepare('UPDATE auth_users SET password_hash=?, updated_at=? WHERE id=? AND password_hash=?').run(hash, this.now(), user.id, current.password_hash)
      if (!result.changes) throw new AuthError('密码已变化，请重新登录')
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(user.id)
    })()
  }
  private cookie(req: IncomingMessage, res: ServerResponse, token: string, expiresAt = 0): void {
    const sameSite = this.options.cookieSameSite ?? 'lax'
    const secure = sameSite === 'none' || this.options.cookieSecure === 'true' || this.options.cookieSecure !== 'false' && (req.headers.origin?.startsWith('https://') || 'encrypted' in req.socket && req.socket.encrypted)
    const age = token ? Math.max(0, Math.floor((expiresAt - this.now()) / 1000)) : 0
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/api/auth; HttpOnly; SameSite=${sameSite[0]!.toUpperCase() + sameSite.slice(1)}; Max-Age=${age}${secure ? '; Secure' : ''}`)
  }
  private refreshCookie(req: IncomingMessage): string {
    return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''
  }
  private protectCookieAction(req: IncomingMessage): void {
    if (req.headers['x-requested-with'] !== 'novel-processor') throw new AuthError('请求校验失败', 403)
    const origin = req.headers.origin
    if (!origin) return // Non-browser API clients still need the custom header and token/password.
    let sameOrigin = false
    try { const value = new URL(origin); sameOrigin = ['http:', 'https:'].includes(value.protocol) && value.origin === `${'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}` }
    catch { throw new AuthError('请求来源不受信任', 403) }
    if (!sameOrigin && !this.options.allowedOrigins.includes(origin)) throw new AuthError('请求来源不受信任', 403)
  }
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/auth/')) return false
    try {
      const ip = req.socket.remoteAddress ?? 'unknown'
      if (path === '/api/auth/me' && req.method === 'GET') { json(res, 200, { user: this.authenticate(req) }); return true }
      if (req.method !== 'POST') { json(res, 404, { error: '接口不存在' }); return true }
      this.protectCookieAction(req)
      if (path === '/api/auth/login') {
        const value = await body(req); const result = await this.login(value.username, value.password, ip)
        const previous = this.refreshCookie(req)
        if (previous) this.logout(previous)
        this.cookie(req, res, result.refreshToken, result.refreshExpiresAt); json(res, 200, result.tokens)
      } else if (path === '/api/auth/refresh') {
        this.rate(`refresh:${ip}`, 120, 60 * 1000)
        const result = this.refresh(this.refreshCookie(req))
        this.cookie(req, res, result.refreshToken, result.refreshExpiresAt); json(res, 200, result.tokens)
      } else if (path === '/api/auth/logout') {
        this.logout(this.refreshCookie(req), req.headers.authorization?.replace(/^Bearer /, ''))
        this.cookie(req, res, ''); json(res, 200, { ok: true })
      } else if (path === '/api/auth/password') {
        const user = this.authenticate(req); const value = await body(req)
        await this.changePassword(user, value.currentPassword, value.newPassword)
        this.cookie(req, res, ''); json(res, 200, { ok: true, reloginRequired: true })
      } else json(res, 404, { error: '接口不存在' })
    } catch (error) {
      if (path === '/api/auth/refresh' && error instanceof AuthError && error.status === 401) this.cookie(req, res, '')
      if (error instanceof AuthError && error.status === 429) res.setHeader('Retry-After', '60')
      json(res, error instanceof AuthError ? error.status : 500, { error: error instanceof AuthError ? error.message : '鉴权服务暂不可用' })
    }
    return true
  }
  close(): void { this.db.close() }
}
