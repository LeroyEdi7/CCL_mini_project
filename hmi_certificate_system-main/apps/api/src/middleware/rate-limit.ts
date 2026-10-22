import type { MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { AppError } from '../errors/app-error.js'

export function createRateLimiter(options: { limit: number; windowMs: number }): MiddlewareHandler {
  const attempts = new Map<string, { count: number; resetsAt: number }>()
  return async (c, next) => {
    let ip = 'unknown'
    try { ip = getConnInfo(c).remote.address ?? ip } catch { /* Hono test adapters have no Node socket metadata */ }
    const now = Date.now()
    let bucket = attempts.get(ip)
    if (!bucket || bucket.resetsAt <= now) {
      bucket = { count: 0, resetsAt: now + options.windowMs }
      attempts.set(ip, bucket)
    }
    bucket.count += 1
    if (bucket.count > options.limit) throw new AppError(429, 'Too many requests. Please try again later.')
    if (attempts.size > 5_000) {
      for (const [key, value] of attempts) if (value.resetsAt <= now) attempts.delete(key)
    }
    await next()
  }
}
