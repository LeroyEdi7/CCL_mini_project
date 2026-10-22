import type { EmailProvider } from "./types.js";

export class DisabledEmailProvider implements EmailProvider {
  async sendVerificationEmail(): Promise<void> {}
  async sendPasswordResetEmail(): Promise<void> {}
}

export class DevelopmentConsoleEmailProvider implements EmailProvider {
  async sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
    console.info(`[development email] Verification link for ${email}: ${verificationUrl}`);
  }

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    console.info(`[development email] Password reset link for ${email}: ${resetUrl}`);
  }
}
