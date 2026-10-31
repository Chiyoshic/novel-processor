/** Auth tests use only a temporary SQLite database and loopback HTTP. Never load appConfig or real credentials. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { AuthService, AuthError, type AuthOptions } from '../server/auth'
import { applyCors } from '../server/cors'
import { AuthClient, AuthRequestError, safeReturnPath } from '../../frontend/src/lib/auth-client'
import type { AuthTokens } from '../../shared/auth'

const origin = 'https://novels.chiyoshi.cn'
const username = 'offline-user'
const password = 'offline-password-123'
const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as IncomingMessage
async function fixture(run: (ctx: { auth: AuthService; base: string; file: string; post: (path: string, data?: unknown, headers?: Record<string, string>) => Promise<Response> }) => Promise<void>, options: Partial<AuthOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'novel-auth-'))
  const file = join(dir, 'library.db')
  const auth = new AuthService(file, { allowedOrigins: [origin], ...options })
  await auth.seed(username, password)
  const server = createServer(async (req, res) => {
    try {
      if (applyCors(req, res, [origin])) return
      if (await auth.handle(req, res)) return
      auth.authenticate(req)
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
    } catch (error) { res.writeHead(error instanceof AuthError ? error.status : 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'error' })) }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (path: string, data: unknown = {}, headers: Record<string, string> = {}) => fetch(`${base}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'novel-processor', Origin: origin, ...headers }, body: JSON.stringify(data) })
  try { await run({ auth, base, file, post }) }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); auth.close(); await rm(dir, { recursive: true, force: true }) }
}
function cookie(response: Response): string { return response.headers.get('set-cookie')!.split(';')[0]! }

test('初始用户幂等创建，密码与 AT/RT 只存哈希，重启不重置修改过的密码', async () => {
  await fixture(async ({ auth, file }) => {
    assert.equal(await auth.seed(username, 'different-password'), false)
    const session = await auth.login(username, password, 'test')
    const db = new Database(file)
    try {
      const user = db.prepare('SELECT password_hash FROM auth_users').get() as { password_hash: string }
      assert.ok(user.password_hash.startsWith('scrypt$')); assert.ok(!user.password_hash.includes(password))
      assert.ok(!JSON.stringify(db.prepare('SELECT * FROM auth_access_tokens').all()).includes(session.tokens.accessToken))
      assert.ok(!JSON.stringify(db.prepare('SELECT * FROM auth_refresh_tokens').all()).includes(session.refreshToken))
      await auth.changePassword(session.tokens.user, password, 'changed-password-456')
      const reopened = new AuthService(file, { allowedOrigins: [origin] })
      try { assert.equal(await reopened.seed(username, password), false); assert.ok((await reopened.login(username, 'changed-password-456', 'reopened')).tokens.accessToken) }
      finally { reopened.close() }
    } finally { db.close() }
  })
})
test('AT 保护普通与流式 API，RT Cookie 不能代替 Bearer AT', async () => {
  await fixture(async ({ base, post }) => {
    const response = await post('login', { username, password })
    assert.equal(response.status, 200)
    const tokens = await response.json() as AuthTokens
    assert.ok(tokens.accessToken.startsWith('at_')); assert.equal('refreshToken' in tokens, false)
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/); assert.match(response.headers.get('set-cookie')!, /Secure/); assert.match(response.headers.get('set-cookie')!, /Path=\/api\/auth/)
    assert.equal((await fetch(`${base}/api/library`)).status, 401)
    assert.equal((await fetch(`${base}/api/library`, { headers: { Cookie: cookie(response) } })).status, 401)
    assert.equal((await fetch(`${base}/api/library`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).status, 200)
    const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })
    assert.deepEqual(await me.json(), { user: tokens.user })
  })
})
test('RT 单次轮换、旧 RT 重放撤销整个会话，多标签页 AT 在轮换后仍有效', async () => {
  await fixture(async ({ auth }) => {
    const first = await auth.login(username, password, 'first')
    const second = auth.refresh(first.refreshToken)
    assert.notEqual(first.refreshToken, second.refreshToken)
    assert.deepEqual(auth.authenticate(request(first.tokens.accessToken)), first.tokens.user)
    assert.deepEqual(auth.authenticate(request(second.tokens.accessToken)), first.tokens.user)
    assert.throws(() => auth.refresh(first.refreshToken), AuthError)
    assert.throws(() => auth.authenticate(request(second.tokens.accessToken)), AuthError)
    assert.throws(() => auth.refresh(second.refreshToken), AuthError)
  })
})
test('AT/RT 到期生效，RT 有绝对寿命，不能无限续期', async () => {
  let now = 100000
  await fixture(async ({ auth }) => {
    const first = await auth.login(username, password, 'expiry')
    now += 101
    assert.throws(() => auth.authenticate(request(first.tokens.accessToken)), AuthError)
    const second = auth.refresh(first.refreshToken)
    assert.equal(second.refreshExpiresAt, first.refreshExpiresAt)
    now = first.refreshExpiresAt + 1
    assert.throws(() => auth.refresh(second.refreshToken), AuthError)
  }, { now: () => now, accessTtlMs: 100, refreshTtlMs: 500 })
})
test('修改密码须验证旧密码，修改后撤销所有设备会话，旧密码不能再登录', async () => {
  await fixture(async ({ auth }) => {
    const first = await auth.login(username, password, 'one')
    const second = await auth.login(username, password, 'two')
    await assert.rejects(auth.changePassword(first.tokens.user, 'wrong-password', 'new-password-789'), /当前密码/)
    await auth.changePassword(first.tokens.user, password, 'new-password-789')
    for (const session of [first, second]) { assert.throws(() => auth.authenticate(request(session.tokens.accessToken)), AuthError); assert.throws(() => auth.refresh(session.refreshToken), AuthError) }
    await assert.rejects(auth.login(username, password, 'old'), /用户名或密码错误/)
    assert.ok((await auth.login(username, 'new-password-789', 'new')).tokens.accessToken)
  })
})
test('CSRF/Origin/CORS 白名单与预检，不开放注册；登录错误统一，限制频率', async () => {
  await fixture(async ({ base, post }) => {
    assert.equal((await post('login', { username, password }, { 'X-Requested-With': '' })).status, 403)
    assert.equal((await post('login', { username, password }, { Origin: 'https://untrusted.invalid' })).status, 403)
    assert.equal((await post('register', { username, password })).status, 404)
    const preflight = await fetch(`${base}/api/auth/refresh`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-requested-with' } })
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin); assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true'); assert.match(preflight.headers.get('access-control-allow-headers')!, /Authorization/)
    assert.equal((await fetch(`${base}/api/auth/refresh`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.invalid' } })).status, 403)
    const wrong = await post('login', { username, password: 'wrong-password' })
    const unknown = await post('login', { username: 'unknown', password: 'wrong-password' })
    assert.equal(wrong.status, 401); assert.deepEqual(await wrong.json(), await unknown.json())
    let response: Response = wrong
    for (let i = 0; i < 9; i++) response = await post('login', { username: {}, password: '' })
    assert.equal(response.status, 429)
    assert.ok(response.headers.get('retry-after'))
  })
})
test('前端并发 401 只刷新一次，普通请求和流式请求均携带 AT，退出后 Cookie 失效', async () => {
  await fixture(async ({ base }) => {
    let jar = ''; let refreshes = 0; let libraryCalls = 0; let force401 = false
    const fetcher: typeof fetch = async (input, init = {}) => {
      const headers = new Headers(init.headers); headers.set('Origin', origin); if (jar) headers.set('Cookie', jar)
      if (String(input).endsWith('/auth/refresh')) { refreshes++; await new Promise((resolve) => setTimeout(resolve, 20)) }
      if (String(input).endsWith('/library')) { libraryCalls++; if (force401 && libraryCalls <= 2) return new Response('{"error":"expired"}', { status: 401 }) }
      const response = await fetch(input, { ...init, headers })
      if (response.headers.has('set-cookie')) jar = cookie(response)
      return response
    }
    const client = new AuthClient(`${base}/api`, { fetch: fetcher })
    await client.login(username, password)
    force401 = true
    const responses = await Promise.all([client.fetch('/library'), client.fetch('/library')])
    assert.ok(responses.every((response) => response.status === 200)); assert.equal(refreshes, 1)
    const reloaded = new AuthClient(`${base}/api`, { fetch: fetcher })
    assert.equal(await reloaded.restore(), true)
    await reloaded.logout(); assert.equal(reloaded.user, null)
    const afterLogout = await new AuthClient(`${base}/api`, { fetch: fetcher }).restore()
    assert.equal(afterLogout, false)
  })
})
test('前端不接受外部 redirect，登录失败和刷新失败不会误认为已登录', async () => {
  assert.equal(safeReturnPath('https://evil.invalid'), '/')
  assert.equal(safeReturnPath('//evil.invalid'), '/')
  assert.equal(safeReturnPath('/\\evil.invalid'), '/')
  assert.equal(safeReturnPath('/login?redirect=/login'), '/')
  assert.equal(safeReturnPath('/novel/test/book?step=episodes'), '/novel/test/book?step=episodes')
  const client = new AuthClient('/api', { fetch: async () => new Response('{"error":"invalid"}', { status: 401 }) })
  assert.equal(await client.restore(), false); assert.equal(client.user, null)
  await assert.rejects(client.login(username, password), AuthRequestError)
})


test('修改密码 HTTP 接口清除 RT Cookie，前端状态退出，私有 API 拒绝旧 AT', async () => {
  await fixture(async ({ base, post }) => {
    const response = await post('login', { username, password })
    const tokens = await response.json() as AuthTokens
    const changed = await post('password', { currentPassword: password, newPassword: 'replacement-password-123' }, { Authorization: `Bearer ${tokens.accessToken}`, Cookie: cookie(response) })
    assert.equal(changed.status, 200); assert.match(changed.headers.get('set-cookie')!, /Max-Age=0/)
    assert.equal((await fetch(`${base}/api/library`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).status, 401)
    assert.equal((await post('refresh', {}, { Cookie: cookie(response) })).status, 401)
    assert.equal((await post('login', { username, password: 'replacement-password-123' })).status, 200)
    assert.equal((await fetch(`${base}/api/library/site/book/translation/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
  })
})
