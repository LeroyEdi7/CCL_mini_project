import { getCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../errors/app-error.js'
import type { AuthProvider, AuthUser } from '../services/auth/types.js'

type AuthVariables = { authUser: AuthUser; authSessionToken: string }

export function createAuthMiddleware(provider: AuthProvider): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const native = c.req.header('x-auth-client') === 'native'
    const authorization = native ? c.req.header('authorization') : undefined
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    const token = native ? bearer : getCookie(c, 'titlecert_session') ?? getCookie(c, '__Host-titlecert_session')
    if (!token) throw new AppError(401, 'Authentication required')

    const user = await provider.getSession(token)
    if (!user) throw new AppError(401, 'Session is invalid or expired')
    c.set('authUser', user)
    c.set('authSessionToken', token)
    await next()
  }
}

export function createCsrfMiddleware(webOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header('x-auth-client') === 'native') return next()
    const origin = c.req.header('origin')
    let originMatches = false
    try { originMatches = new URL(origin ?? '').origin === webOrigin } catch { /* malformed origins are rejected */ }
    if (!originMatches) throw new AppError(403, 'Request origin is not allowed')
    await next()
  }
}
