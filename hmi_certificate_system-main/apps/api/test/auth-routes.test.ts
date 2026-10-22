import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { AppError } from '../src/errors/app-error.js'
import type { AuthProvider, AuthSession, AuthUser } from '../src/services/auth/types.js'

const user: AuthUser = { id: 'user-id', name: 'Test User', email: 'test@example.com', emailVerifiedAt: new Date('2026-01-01T00:00:00Z') }
const auth = {
  register: async () => {}, verifyEmail: async () => user,
  authenticate: async (): Promise<AuthSession> => ({ user, expiresAt: new Date('2026-01-01T01:00:00Z'), sessionToken: 'a'.repeat(43) }),
  getSession: async (token: string) => token === 'valid-session' ? user : undefined,
  endSession: async () => {}, requestPasswordReset: async () => {}, completePasswordReset: async () => {},
} satisfies AuthProvider
const app = createApp(auth, { webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false })
const browserPost = { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' } }

test('validation and unknown routes use the standardized error envelope and HTTP status', async () => {
  const invalid = await app.request('/api/auth/login', { ...browserPost, body: JSON.stringify({ email: 'bad', password: '' }) })
  assert.equal(invalid.status, 400)
  const invalidBody = await invalid.json() as { success: boolean; error?: { statusCode: number } }
  assert.equal(invalidBody.success, false)
  assert.equal(invalidBody.error?.statusCode, 400)

  const missing = await app.request('/missing')
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { success: false, error: { statusCode: 404, message: 'Route not found' } })
  const missingAuthRoute = await app.request('/api/auth/not-a-route')
  assert.equal(missingAuthRoute.status, 404)
  assert.deepEqual(await missingAuthRoute.json(), { success: false, error: { statusCode: 404, message: 'Route not found' } })
})

test('successful login returns the envelope and sets an HttpOnly session cookie without exposing internal data', async () => {
  const response = await app.request('/api/auth/login', { ...browserPost, body: JSON.stringify({ email: user.email, password: 'password' }) })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/)
  const body = await response.json() as { success: boolean; data: { user: Record<string, unknown> } }
  assert.equal(body.success, true)
  assert.equal(body.data.user.id, user.id)
  assert.equal('passwordHash' in body.data.user, false)
  assert.equal('accessToken' in body.data, false)
})

test('logout clears the configured development session cookie without a serialization error', async () => {
  const response = await app.request('/api/auth/logout', {
    ...browserPost,
    body: '{}',
    headers: { ...browserPost.headers, cookie: 'titlecert_session=valid-session' },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: { message: 'Signed out' } })
  assert.match(response.headers.get('set-cookie') ?? '', /titlecert_session=;/)
})

test('protected current-user endpoint rejects missing sessions and restores a valid session user', async () => {
  const denied = await app.request('/api/auth/me')
  assert.equal(denied.status, 401)
  const accepted = await app.request('/api/auth/me', { headers: { cookie: 'titlecert_session=valid-session' } })
  assert.equal(accepted.status, 200)
  const body = await accepted.json() as { data: { user: { email: string } } }
  assert.equal(body.data.user.email, user.email)
})

test('application errors keep their status and unexpected errors return a safe 500', async () => {
  const badTokenApp = createApp({ ...auth, verifyEmail: async () => { throw new AppError(400, 'Verification link is invalid or expired') } }, {
    webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false,
  })
  const badToken = await badTokenApp.request('/api/auth/verify-email', { ...browserPost, body: JSON.stringify({ token: 'a'.repeat(43) }) })
  assert.equal(badToken.status, 400)
  assert.deepEqual(await badToken.json(), { success: false, error: { statusCode: 400, message: 'Verification link is invalid or expired' } })

  const brokenApp = createApp({ ...auth, authenticate: async () => { throw new Error('private database detail') } }, {
    webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false,
  })
  const unexpected = await brokenApp.request('/api/auth/login', { ...browserPost, body: JSON.stringify({ email: user.email, password: 'password' }) })
  assert.equal(unexpected.status, 500)
  const safeBody = await unexpected.text()
  assert.match(safeBody, /Internal server error/)
  assert.doesNotMatch(safeBody, /private database detail|stack/i)
})

test('browser state-changing requests without the configured Origin are rejected', async () => {
  const response = await app.request('/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: user.email, password: 'long-enough-password' }),
  })
  assert.equal(response.status, 403)
})
