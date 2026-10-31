import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv(process.env.ENV_FILE || resolve(process.cwd(), '.env'))

function stringEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim()
  return value || fallback
}

function intEnv(name: string, fallback: number, min: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) ? Math.max(min, value) : fallback
}

function pathEnv(name: string, fallback: string): string {
  const value = stringEnv(name, fallback)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

export interface AppConfig {
  env: string
  host: string
  port: number
  dataDir: string
  dbPath: string
  novelsDir: string
  episodesDir: string
  auditLogPath: string
  fetchConcurrency: number
  fetchIntervalMs: number
  fetchTimeoutMs: number
  fetchMaxRetries: number
  corsOrigins: string[]
}

const dataDir = pathEnv('DATA_DIR', './data')

export const appConfig: AppConfig = {
  env: stringEnv('APP_ENV', 'development'),
  host: stringEnv('HTTP_HOST', '0.0.0.0'),
  port: intEnv('HTTP_PORT', 8080, 1),
  dataDir,
  dbPath: pathEnv('DB_PATH', join(dataDir, 'library.db')),
  novelsDir: pathEnv('NOVELS_DIR', join(dataDir, 'novels')),
  episodesDir: pathEnv('EPISODES_DIR', join(dataDir, 'episodes')),
  auditLogPath: pathEnv('AUDIT_LOG_PATH', join(dataDir, 'audit.log')),
  fetchConcurrency: intEnv('FETCH_CONCURRENCY', 4, 1),
  fetchIntervalMs: intEnv('FETCH_INTERVAL_MS', 200, 0),
  fetchTimeoutMs: intEnv('FETCH_TIMEOUT_MS', 20_000, 1_000),
  fetchMaxRetries: intEnv('FETCH_MAX_RETRIES', 3, 0),
  corsOrigins: stringEnv('CORS_ORIGINS', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
}
