import { z } from 'zod'

const emailSchema = z.string().trim().email().max(254)
const passwordSchema = z.string().min(12).max(128)
const tokenSchema = z.string().min(32).max(256)

export const registerSchema = z.object({ name: z.string().trim().min(1).max(120), email: emailSchema, password: passwordSchema }).strict()
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict()
export const verificationTokenSchema = z.object({ token: tokenSchema }).strict()
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict()
export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema }).strict()
