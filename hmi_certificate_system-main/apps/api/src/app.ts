import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verificationTokenSchema } from '@hmi/shared'
import { AppError } from './errors/app-error.js'
import { successResponse } from './lib/api-response.js'
import { asyncHandler } from './middleware/async-handler.js'
import { createAuthMiddleware, createCsrfMiddleware } from './middleware/auth.js'
import { apiErrorHandler, apiNotFoundHandler } from './middleware/error-handler.js'
import { createRateLimiter } from './middleware/rate-limit.js'
import type { AuthProvider, AuthUser } from './services/auth/types.js'
import { createEventRoutes, listEventsResponse } from './routes/events.js'
import { createParticipantRoutes } from './routes/participants.js'
import type { EventService } from './services/events/event-service.js'
import type { ParticipantService } from './services/participants/participant-service.js'
import { createCertificateRoutes } from './routes/certificates.js'
import type { CertificateService } from './services/certificates/certificate-service.js'
import type { PublicUser } from '@hmi/shared'

export type AuthAppConfig = {
  webOrigin: string
  sessionTtlSeconds: number
  secureCookies: boolean
}

type Variables = { authUser: AuthUser; authSessionToken: string }

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown
  try { body = await c.req.json() } catch { throw new AppError(400, 'Request body must be valid JSON') }
  return schema.parse(body)
}

function setSessionCookie(c: Context, token: string, config: AuthAppConfig) {
  setCookie(c, config.secureCookies ? '__Host-titlecert_session' : 'titlecert_session', token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: config.sessionTtlSeconds,
  })
}

function clearSessionCookie(c: Context, config: AuthAppConfig) {
  deleteCookie(c, config.secureCookies ? '__Host-titlecert_session' : 'titlecert_session', {
    path: '/',
    secure: config.secureCookies,
  })
}

export function createApp(auth: AuthProvider, config: AuthAppConfig, eventService?: EventService, participantService?: ParticipantService, certificateService?: CertificateService) {
  const app = new Hono<{ Variables: Variables }>()
  app.onError(apiErrorHandler)
  app.notFound(apiNotFoundHandler)
  const csrf = createCsrfMiddleware(config.webOrigin)
  const authRequired = createAuthMiddleware(auth)
  const recoveryLimit = createRateLimiter({ limit: 8, windowMs: 15 * 60_000 })
  const loginLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 })

  app.get('/', asyncHandler((c) => successResponse(c, { message: 'Hello Hono!' })))

  const routes = new Hono<{ Variables: Variables }>()
  routes.post('/register', csrf, recoveryLimit, asyncHandler(async (c) => {
    const input = await parseBody(c, registerSchema)
    await auth.register(input)
    return successResponse(c, { message: 'If the address can be registered, a verification email has been sent.' }, 202)
  }))
  routes.post('/verify-email', csrf, recoveryLimit, asyncHandler(async (c) => {
    const { token } = await parseBody(c, verificationTokenSchema)
    const user = await auth.verifyEmail(token)
    return successResponse(c, { user: publicUser(user), message: 'Email verified. You can now sign in.' })
  }))
  routes.post('/login', csrf, loginLimit, asyncHandler(async (c) => {
    const input = await parseBody(c, loginSchema)
    const session = await auth.authenticate(input.email, input.password)
    if (c.req.header('x-auth-client') === 'native') {
      return successResponse(c, { user: publicUser(session.user), accessToken: session.sessionToken, expiresAt: session.expiresAt.toISOString() })
    }
    setSessionCookie(c, session.sessionToken, config)
    return successResponse(c, { user: publicUser(session.user), expiresAt: session.expiresAt.toISOString() })
  }))
  routes.post('/logout', csrf, asyncHandler(async (c) => {
    const native = c.req.header('x-auth-client') === 'native'
    const token = native
      ? c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      : getCookie(c, 'titlecert_session') ?? getCookie(c, '__Host-titlecert_session')
    if (token) await auth.endSession(token)
    clearSessionCookie(c, config)
    return successResponse(c, { message: 'Signed out' })
  }))
  routes.get('/me', authRequired, asyncHandler((c) => successResponse(c, { user: publicUser(c.get('authUser')) })))
  routes.post('/forgot-password', csrf, recoveryLimit, asyncHandler(async (c) => {
    const { email } = await parseBody(c, forgotPasswordSchema)
    await auth.requestPasswordReset(email)
    return successResponse(c, { message: 'If an account exists for that address, password reset instructions have been sent.' }, 202)
  }))
  routes.post('/reset-password', csrf, recoveryLimit, asyncHandler(async (c) => {
    const { token, password } = await parseBody(c, resetPasswordSchema)
    await auth.completePasswordReset(token, password)
    return successResponse(c, { message: 'Password updated. Please sign in again.' })
  }))
  app.route('/api/auth', routes)
  if (eventService) {
    app.route('/api/events', createEventRoutes(auth, eventService, config.webOrigin, participantService))
    app.get('/api/events/', authRequired, asyncHandler((c) => listEventsResponse(c, eventService, participantService)))
  }
  if (certificateService) {
    app.route('/api', createCertificateRoutes(auth, certificateService, config.webOrigin))
  }
  if (participantService) {
    app.route('/api', createParticipantRoutes(auth, participantService, config.webOrigin))
  }
  return app
}

function publicUser(user: AuthUser): PublicUser {
  return { id: user.id, name: user.name, email: user.email, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null }
}
