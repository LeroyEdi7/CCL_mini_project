import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '../errors/app-error.js'
import { successResponse } from '../lib/api-response.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { createAuthMiddleware, createCsrfMiddleware } from '../middleware/auth.js'
import type { AuthProvider, AuthUser } from '../services/auth/types.js'
import type { CertificateService } from '../services/certificates/certificate-service.js'

type Variables = { authUser: AuthUser; authSessionToken: string }
const idSchema = z.uuid()
const issueSchema = z.object({
  participantId: idSchema,
  title: z.string().trim().min(1).max(140).default('Certificate of Achievement'),
  description: z.string().trim().max(2000).nullable().optional(),
}).strict()
const bulkIssueSchema = z.object({
  participantIds: z.array(idSchema).min(1).max(100),
  title: z.string().trim().min(1).max(140).default('Certificate of Achievement'),
  description: z.string().trim().max(2000).nullable().optional(),
}).strict()
const revokeSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict()
const verificationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Verification token is invalid')
const certificateListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['draft', 'issued', 'revoked']).optional(),
})
const pdfQuerySchema = z.object({ disposition: z.enum(['inline', 'attachment']).default('attachment') })

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown
  try { body = await c.req.json() } catch { throw new AppError(400, 'Request body must be valid JSON') }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, 'Invalid request body', parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })))
  return parsed.data
}

function parseUuid(value: string | undefined, label: string) {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw new AppError(400, `${label} must be a valid UUID`)
  return parsed.data
}

export function createCertificateRoutes(auth: AuthProvider, certificates: CertificateService, webOrigin: string) {
  const routes = new Hono<{ Variables: Variables }>()
  const requireAuth = createAuthMiddleware(auth)
  const requireCsrf = createCsrfMiddleware(webOrigin)

  routes.get('/verify/:token', asyncHandler(async (c) => {
    const token = verificationTokenSchema.safeParse(c.req.param('token'))
    if (!token.success) return successResponse(c, { result: 'not_found', valid: false })
    return successResponse(c, await certificates.verify(token.data))
  }))

  routes.post('/events/:eventId/certificates', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const input = await parseBody(c, issueSchema)
    const certificate = await certificates.issue({ id: c.get('authUser').id, name: c.get('authUser').name }, parseUuid(c.req.param('eventId'), 'Event ID'), input)
    return successResponse(c, { certificate }, 201)
  }))
  routes.post('/events/:eventId/certificates/bulk', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const input = await parseBody(c, bulkIssueSchema)
    const result = await certificates.issueBulk({ id: c.get('authUser').id, name: c.get('authUser').name }, parseUuid(c.req.param('eventId'), 'Event ID'), input)
    return successResponse(c, result)
  }))
  routes.get('/events/:eventId/certificates', requireAuth, asyncHandler(async (c) => {
    const query = certificateListQuerySchema.safeParse(c.req.query())
    if (!query.success) throw new AppError(400, 'Invalid query parameters', query.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })))
    const result = await certificates.listEventCertificates(c.get('authUser').id, parseUuid(c.req.param('eventId'), 'Event ID'), query.data)
    return successResponse(c, { ...result, ...query.data })
  }))
  routes.get('/certificates/:certificateId/pdf', requireAuth, asyncHandler(async (c) => {
    const query = pdfQuerySchema.safeParse(c.req.query())
    if (!query.success) throw new AppError(400, 'Invalid query parameters', query.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })))
    const file = await certificates.downloadPdf(c.get('authUser').id, parseUuid(c.req.param('certificateId'), 'Certificate ID'))
    const safeNumber = file.certificateNumber.replace(/[^A-Za-z0-9_-]/g, '')
    return c.body(new Uint8Array(file.bytes), 200, {
      'content-type': file.contentType,
      'content-disposition': `${query.data.disposition}; filename="${safeNumber}.pdf"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    })
  }))
  routes.patch('/certificates/:certificateId/revoke', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const { reason } = await parseBody(c, revokeSchema)
    const result = await certificates.revoke(c.get('authUser').id, parseUuid(c.req.param('certificateId'), 'Certificate ID'), reason)
    return successResponse(c, { certificate: result })
  }))
  return routes
}
