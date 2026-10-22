export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerifiedAt: Date | null
}

export type AccountRecord = {
  user: AuthUser
  passwordHash: string | null
}

export type CreatedAccount = {
  user: AuthUser
  created: boolean
}

export type AuthSession = {
  user: AuthUser
  expiresAt: Date
  sessionToken: string
}

export interface AuthRepository {
  findAccountByEmail(email: string): Promise<AccountRecord | undefined>
  createAccount(input: { name: string; email: string; passwordHash: string }): Promise<CreatedAccount>
  issueEmailVerification(userId: string, tokenHash: string, expiresAt: Date, now: Date): Promise<void>
  consumeEmailVerification(tokenHash: string, now: Date): Promise<AuthUser | undefined>
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>
  findActiveSession(tokenHash: string, now: Date): Promise<AuthUser | undefined>
  revokeSession(tokenHash: string, now: Date): Promise<void>
  findPasswordResetUser(tokenHash: string, now: Date): Promise<string | undefined>
  issuePasswordReset(userId: string, tokenHash: string, expiresAt: Date, now: Date): Promise<void>
  resetPassword(tokenHash: string, passwordHash: string, now: Date): Promise<boolean>
}

export interface EmailProvider {
  sendVerificationEmail(email: string, verificationUrl: string): Promise<void>
  sendPasswordResetEmail(email: string, resetUrl: string): Promise<void>
}

export interface AuthProvider {
  register(input: { name: string; email: string; password: string }): Promise<void>
  verifyEmail(token: string): Promise<AuthUser>
  authenticate(email: string, password: string): Promise<AuthSession>
  getSession(sessionToken: string): Promise<AuthUser | undefined>
  endSession(sessionToken: string): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  completePasswordReset(token: string, newPassword: string): Promise<void>
}
