import type { z } from 'zod'
import type { EventCreateInput, EventMemberRole, EventStatus, EventUpdateInput } from './types/index.js'

export type { ApiFailure, ApiResponse, ApiSuccess, BrowserLoginResponse, EventCreateInput, EventData, EventDto, EventListData, EventMemberRole, EventStatus, EventUpdateInput, ForgotPasswordInput, LoginInput, MessageResponse, NativeLoginResponse, PublicUser, RegisterInput, ResetPasswordInput, UserResponse, VerificationTokenInput } from './types/index.js'

export declare const EVENT_STATUSES: readonly ['draft', 'published', 'completed', 'cancelled']
export declare const EVENT_MEMBER_ROLES: readonly ['admin', 'member']
export declare const eventStatusSchema: z.ZodType<EventStatus>
export declare const createEventSchema: z.ZodType<EventCreateInput>
export declare const updateEventSchema: z.ZodType<EventUpdateInput>
export declare const registerSchema: z.ZodType<import('./types/index.js').RegisterInput>
export declare const loginSchema: z.ZodType<import('./types/index.js').LoginInput>
export declare const verificationTokenSchema: z.ZodType<import('./types/index.js').VerificationTokenInput>
export declare const forgotPasswordSchema: z.ZodType<import('./types/index.js').ForgotPasswordInput>
export declare const resetPasswordSchema: z.ZodType<import('./types/index.js').ResetPasswordInput>
