import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LocalAuthProvider } from '../src/services/auth/local-auth-provider.js'
import type { AccountRecord, AuthRepository, AuthUser, CreatedAccount, EmailProvider } from '../src/services/auth/types.js'

type Token = { userId: string; expiresAt: Date; consumedAt?: Date }

class MemoryAuthRepository implements AuthRepository {
  accounts = new Map<string, AccountRecord>()
  verification = new Map<string, Token>()
  resets = new Map<string, Token>()
  sessions = new Map<string, { userId: string; expiresAt: Date; revoked: boolean }>()
  sequence = 0

  async findAccountByEmail(email: string) { return this.accounts.get(email) }
  async createAccount(input: { name: string; email: string; passwordHash: string }): Promise<CreatedAccount> {
    const existing = this.accounts.get(input.email)
    if (existing) return { user: existing.user, created: false }
    const user: AuthUser = { id: String(++this.sequence), name: input.name, email: input.email, emailVerifiedAt: null }
    this.accounts.set(input.email, { user, passwordHash: input.passwordHash })
    return { user, created: true }
  }
  async issueEmailVerification(userId: string, tokenHash: string, expiresAt: Date) { this.verification.set(tokenHash, { userId, expiresAt }) }
  async consumeEmailVerification(tokenHash: string, now: Date) {
    const item = this.verification.get(tokenHash)
    if (!item || item.consumedAt || item.expiresAt <= now) return undefined
    item.consumedAt = now
    const account = [...this.accounts.values()].find((record) => record.user.id === item.userId)
    if (!account) return undefined
    account.user.emailVerifiedAt ??= now
    return account.user
  }
  async createSession(userId: string, tokenHash: string, expiresAt: Date) { this.sessions.set(tokenHash, { userId, expiresAt, revoked: false }) }
  async findActiveSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash)
    if (!session || session.revoked || session.expiresAt <= now) return undefined
    return [...this.accounts.values()].find((account) => account.user.id === session.userId)?.user
  }
  async revokeSession(tokenHash: string) { const session = this.sessions.get(tokenHash); if (session) session.revoked = true }
  async findPasswordResetUser(tokenHash: string, now: Date) {
    const item = this.resets.get(tokenHash)
    return item && !item.consumedAt && item.expiresAt > now ? item.userId : undefined
  }
  async issuePasswordReset(userId: string, tokenHash: string, expiresAt: Date) { this.resets.set(tokenHash, { userId, expiresAt }) }
  async resetPassword(tokenHash: string, passwordHash: string, now: Date) {
    const item = this.resets.get(tokenHash)
    if (!item || item.consumedAt || item.expiresAt <= now) return false
    item.consumedAt = now
    const account = [...this.accounts.values()].find((record) => record.user.id === item.userId)
    if (!account) return false
    account.passwordHash = passwordHash
    for (const session of this.sessions.values()) if (session.userId === item.userId) session.revoked = true
    return true
  }
}

class CapturingEmailProvider implements EmailProvider {
  verificationUrl = ''
  resetUrl = ''
  async sendVerificationEmail(_email: string, url: string) { this.verificationUrl = url }
  async sendPasswordResetEmail(_email: string, url: string) { this.resetUrl = url }
}

const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!
const setup = () => {
  let now = new Date('2026-01-01T00:00:00Z')
  const repository = new MemoryAuthRepository()
  const email = new CapturingEmailProvider()
  const provider = new LocalAuthProvider(repository, email, {
    sessionTtlSeconds: 3600,
    verificationTtlSeconds: 3600,
    passwordResetTtlSeconds: 3600,
    appBaseUrl: 'http://localhost:5173',
    now: () => now,
  })
  return { provider, repository, email, advance: (ms: number) => { now = new Date(now.getTime() + ms) } }
}

test('registration verifies once, allows verified login, and logout invalidates session', async () => {
  const { provider, email } = setup()
  await provider.register({ name: 'Sample User', email: 'USER@example.com', password: 'long-test-password' })
  await assert.rejects(provider.authenticate('user@example.com', 'long-test-password'), /incorrect/)
  const verified = await provider.verifyEmail(tokenFrom(email.verificationUrl))
  assert.equal(verified.emailVerifiedAt instanceof Date, true)
  await assert.rejects(provider.verifyEmail(tokenFrom(email.verificationUrl)), /invalid or expired/)
  const session = await provider.authenticate('USER@example.com', 'long-test-password')
  assert.equal((await provider.getSession(session.sessionToken))?.id, verified.id)
  await provider.endSession(session.sessionToken)
  assert.equal(await provider.getSession(session.sessionToken), undefined)
})

test('duplicate registration does not replace a verified account and wrong passwords fail generically', async () => {
  const { provider, email, repository } = setup()
  await provider.register({ name: 'Sample User', email: 'user@example.com', password: 'long-test-password' })
  const verificationToken = tokenFrom(email.verificationUrl)
  const verified = await provider.verifyEmail(verificationToken)
  const originalHash = repository.accounts.get('user@example.com')?.passwordHash
  await provider.register({ name: 'Other Name', email: 'USER@example.com', password: 'other-long-password' })
  assert.equal(repository.accounts.size, 1)
  assert.equal(repository.accounts.get('user@example.com')?.passwordHash, originalHash)
  await assert.rejects(provider.authenticate('user@example.com', 'wrong-password'), /incorrect/)
  assert.equal(verified.name, 'Sample User')
})

test('expired reset token is rejected and expired verification cannot activate an account', async () => {
  const { provider, email, advance } = setup()
  await provider.register({ name: 'Sample User', email: 'user@example.com', password: 'long-test-password' })
  const verificationToken = tokenFrom(email.verificationUrl)
  advance(3_600_001)
  await assert.rejects(provider.verifyEmail(verificationToken), /invalid or expired/)
  await assert.rejects(provider.authenticate('user@example.com', 'long-test-password'), /incorrect/)
})

test('password reset tokens are single-use and reset revokes prior sessions', async () => {
  const { provider, email } = setup()
  await provider.register({ name: 'Sample User', email: 'user@example.com', password: 'long-test-password' })
  await provider.verifyEmail(tokenFrom(email.verificationUrl))
  const session = await provider.authenticate('user@example.com', 'long-test-password')
  await provider.requestPasswordReset('user@example.com')
  const resetToken = tokenFrom(email.resetUrl)
  await provider.completePasswordReset(resetToken, 'new-long-password')
  await assert.rejects(provider.completePasswordReset(resetToken, 'another-long-password'), /invalid or expired/)
  assert.equal(await provider.getSession(session.sessionToken), undefined)
  assert.equal((await provider.authenticate('user@example.com', 'new-long-password')).user.email, 'user@example.com')
})

test('password reset token expires', async () => {
  const { provider, email, advance } = setup()
  await provider.register({ name: 'Sample User', email: 'user@example.com', password: 'long-test-password' })
  await provider.verifyEmail(tokenFrom(email.verificationUrl))
  await provider.requestPasswordReset('user@example.com')
  const resetToken = tokenFrom(email.resetUrl)
  advance(3_600_001)
  await assert.rejects(provider.completePasswordReset(resetToken, 'new-long-password'), /invalid or expired/)
})

test('expired sessions are rejected', async () => {
  const { provider, email, advance } = setup()
  await provider.register({ name: 'Sample User', email: 'user@example.com', password: 'long-test-password' })
  await provider.verifyEmail(tokenFrom(email.verificationUrl))
  const session = await provider.authenticate('user@example.com', 'long-test-password')
  advance(3_600_001)
  assert.equal(await provider.getSession(session.sessionToken), undefined)
})

