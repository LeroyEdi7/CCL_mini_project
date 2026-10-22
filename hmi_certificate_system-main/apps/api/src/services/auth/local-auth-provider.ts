import { randomBytes, createHash } from "node:crypto";
import * as argon2 from "argon2";
import { AppError } from "../../errors/app-error.js";
import type { AuthProvider, AuthRepository, AuthSession, AuthUser, EmailProvider } from "./types.js";

export type LocalAuthOptions = {
  sessionTtlSeconds: number;
  verificationTtlSeconds: number;
  passwordResetTtlSeconds: number;
  appBaseUrl: string;
  now?: () => Date;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class LocalAuthProvider implements AuthProvider {
  private readonly now: () => Date;

  constructor(
    private readonly repository: AuthRepository,
    private readonly emailProvider: EmailProvider,
    private readonly options: LocalAuthOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async register(input: { name: string; email: string; password: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const existing = await this.repository.findAccountByEmail(email);

    if (existing?.user.emailVerifiedAt) return;

    if (!existing) {
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const created = await this.repository.createAccount({
        name: input.name.trim(),
        email,
        passwordHash,
      });

      if (!created.created && created.user.emailVerifiedAt) return;
      await this.sendVerification(created.user);
      return;
    }

    await this.sendVerification(existing.user);
  }

  async verifyEmail(token: string): Promise<AuthUser> {
    const user = await this.repository.consumeEmailVerification(hashToken(token), this.now());
    if (!user) throw new AppError(400, "Verification link is invalid or expired");
    return user;
  }

  async authenticate(emailInput: string, password: string): Promise<AuthSession> {
    const account = await this.repository.findAccountByEmail(normalizeEmail(emailInput));
    if (!account?.passwordHash) {
      // Keep missing accounts close to the cost of a real Argon2id verification.
      await argon2.hash(password, { type: argon2.argon2id });
      throw new AppError(401, "Email or password is incorrect");
    }

    const passwordMatches = await argon2.verify(account.passwordHash, password);
    if (!passwordMatches) throw new AppError(401, "Email or password is incorrect");
    if (!account.user.emailVerifiedAt) throw new AppError(401, "Email or password is incorrect");

    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + this.options.sessionTtlSeconds * 1000);
    await this.repository.createSession(account.user.id, hashToken(sessionToken), expiresAt);
    return { user: account.user, expiresAt, sessionToken };
  }

  getSession(sessionToken: string): Promise<AuthUser | undefined> {
    return this.repository.findActiveSession(hashToken(sessionToken), this.now());
  }

  endSession(sessionToken: string): Promise<void> {
    return this.repository.revokeSession(hashToken(sessionToken), this.now());
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const account = await this.repository.findAccountByEmail(normalizeEmail(emailInput));
    if (!account?.passwordHash) return;

    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.options.passwordResetTtlSeconds * 1000);
    await this.repository.issuePasswordReset(account.user.id, hashToken(token), expiresAt, now);
    const resetUrl = `${this.options.appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.emailProvider.sendPasswordResetEmail(account.user.email, resetUrl);
  }

  async completePasswordReset(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const now = this.now();
    const userId = await this.repository.findPasswordResetUser(tokenHash, now);
    if (!userId) throw new AppError(400, "Password reset link is invalid or expired");

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    const reset = await this.repository.resetPassword(tokenHash, passwordHash, now);
    if (!reset) throw new AppError(400, "Password reset link is invalid or expired");
  }

  private async sendVerification(user: AuthUser): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.options.verificationTtlSeconds * 1000);
    await this.repository.issueEmailVerification(user.id, hashToken(token), expiresAt, now);
    const verificationUrl = `${this.options.appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.emailProvider.sendVerificationEmail(user.email, verificationUrl);
  }
}
