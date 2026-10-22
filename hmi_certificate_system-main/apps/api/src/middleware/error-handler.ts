import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { AppError } from '../errors/app-error.js'
import { errorResponse } from '../lib/api-response.js'

export const apiErrorHandler: ErrorHandler = (error, c) => {
  if (error instanceof AppError) {
    return errorResponse(c, error)
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message
    }))

    return errorResponse(c, new AppError(400, 'Validation failed', details))
  }

  if (error instanceof HTTPException && error.status >= 400 && error.status < 500) {
    return errorResponse(c, new AppError(error.status, error.message))
  }

  console.error('Unhandled API error', error)
  return errorResponse(c, new AppError(500, 'Internal server error'))
}

export const apiNotFoundHandler: NotFoundHandler = (c) => {
  return errorResponse(c, new AppError(404, 'Route not found'))
}
