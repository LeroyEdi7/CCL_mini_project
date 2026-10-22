import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError } from '../errors/app-error.js'

export function successResponse<T>(
  c: Context,
  data: T,
  statusCode: ContentfulStatusCode = 200
) {
  if (statusCode < 200 || statusCode >= 300) {
    throw new RangeError('Success responses require an HTTP success status (2xx)')
  }

  return c.json({ success: true as const, data }, statusCode)
}

export function errorResponse(c: Context, error: AppError) {
  const errorBody = {
    statusCode: error.statusCode,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details })
  }

  return c.json({ success: false as const, error: errorBody }, error.statusCode)
}
