import type { AuthTokens, AuthUser } from '../../../shared/auth'

export class AuthRequestError extends Error { readonly status: number; constructor(message: string, status: number) { super(message); this.status = status } }
export function safeReturnPath(value: unknown): string { return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\r\n]/.test(value) && !value.startsWith('/login') ? value : '/' }

/** AT is memory-only; RT is an HttpOnly cookie. All protected requests, including streams, use this client. */
export class AuthClient {
  user: AuthUser | null = null
  private token = ''
  private expiresAt = 0
  private attemptedRestore = false
  private refreshPromise: Promise<void> | null = null
  private epoch = 0
  private readonly listeners = new Set<() => void>()
  private readonly expiredListeners = new Set<() => void>()
  private readonly base: string
  private readonly fetcher: typeof fetch
  private readonly lock: (work: () => Promise<void>) => Promise<void>
  constructor(base: string, options: { fetch?: typeof fetch; lock?: (work: () => Promise<void>) => Promise<void> } = {}) {
    this.base = base.replace(/\/$/, '')
    this.fetcher = options.fetch ?? fetch.bind(globalThis)
    this.lock = options.lock ?? ((work) => work())
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  onSessionLost(listener: () => void): () => void { this.expiredListeners.add(listener); return () => { this.expiredListeners.delete(listener) } }
  private grant(tokens: AuthTokens): void {
    this.token = tokens.accessToken; this.expiresAt = Date.now() + tokens.expiresIn * 1000; this.user = tokens.user; this.attemptedRestore = true
    for (const listener of this.listeners) listener()
  }
  invalidate(): void {
    const wasSignedIn = !!this.user
    this.epoch++; this.token = ''; this.expiresAt = 0; this.user = null; this.attemptedRestore = true
    for (const listener of this.listeners) listener()
    if (wasSignedIn) for (const listener of this.expiredListeners) listener()
  }
  private async parse<T>(response: Response): Promise<T> {
    const value = await response.json().catch(() => null) as T | { error?: string } | null
    if (!response.ok) throw new AuthRequestError(value && typeof value === 'object' && 'error' in value ? value.error ?? `请求失败（${response.status}）` : `请求失败（${response.status}）`, response.status)
    return value as T
  }
  private raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json'); headers.set('X-Requested-With', 'novel-processor')
    return this.fetcher(`${this.base}${path}`, { ...init, headers, credentials: 'include' })
  }
  async login(username: string, password: string): Promise<void> {
    const epoch = ++this.epoch
    const tokens = await this.parse<AuthTokens>(await this.raw('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }))
    if (epoch === this.epoch) this.grant(tokens)
  }
  async refresh(): Promise<void> {
    if (!this.refreshPromise) {
      const epoch = this.epoch
      this.refreshPromise = this.lock(async () => {
        try {
          const tokens = await this.parse<AuthTokens>(await this.raw('/auth/refresh', { method: 'POST', body: '{}' }))
          if (epoch !== this.epoch) throw new AuthRequestError('会话状态已变化，请重新登录', 401)
          this.grant(tokens)
        } catch (error) { if (epoch === this.epoch && error instanceof AuthRequestError && error.status === 401) this.invalidate(); throw error }
      }).finally(() => { this.refreshPromise = null })
    }
    return this.refreshPromise
  }
  async restore(): Promise<boolean> {
    if (this.token && this.expiresAt > Date.now() + 10000) return true
    if (this.attemptedRestore && !this.user) return false
    try { await this.refresh(); return true }
    catch (error) { if (error instanceof AuthRequestError && error.status === 401) return false; throw error }
  }
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    init.signal?.throwIfAborted()
    if (!this.token || this.expiresAt <= Date.now() + 10000) await this.refresh()
    const token = this.token
    const run = () => this.raw(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${this.token}` } })
    let response = await run()
    if (response.status === 401) {
      await response.body?.cancel()
      // A concurrent request may already have renewed this tab's access token.
      if (token === this.token) await this.refresh()
      init.signal?.throwIfAborted()
      response = await run()
      if (response.status === 401) this.invalidate()
    }
    return response
  }
  async logout(): Promise<void> {
    await this.parse(await this.raw('/auth/logout', { method: 'POST', body: '{}', headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} }))
    this.invalidate()
  }
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.parse(await this.fetch('/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }))
    this.invalidate()
  }
}
