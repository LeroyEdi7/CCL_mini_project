export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled'
export type EventMemberRole = 'admin' | 'member'

export type EventCreateInput = {
  name: string
  description?: string | null
  startDate: string
  endDate?: string | null
  status?: EventStatus
}
export type EventUpdateInput = Partial<EventCreateInput>
export type RegisterInput = { name: string; email: string; password: string }
export type LoginInput = { email: string; password: string }
export type VerificationTokenInput = { token: string }
export type ForgotPasswordInput = { email: string }
export type ResetPasswordInput = { token: string; password: string }

export type EventDto = {
  id: string
  name: string
  description: string | null
  startDate: string
  endDate: string | null
  status: EventStatus
  ownerId: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  accessRole: EventMemberRole
}
export type EventData = { event: EventDto }
export type EventListData = { events: EventDto[] }

export type PublicUser = {
  id: string
  name: string
  email: string
  emailVerifiedAt: string | null
}

export type ApiSuccess<T> = { success: true; data: T }
export type ApiFailure = {
  success: false
  error: { statusCode: number; message: string; details?: unknown }
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
export type UserResponse = { user: PublicUser }
export type MessageResponse = { message: string }
export type BrowserLoginResponse = UserResponse & { expiresAt: string }
export type NativeLoginResponse = BrowserLoginResponse & { accessToken: string }
