import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { createEventSchema, updateEventSchema, type EventDto, type EventCreateInput, type EventUpdateInput } from '@hmi/shared'
import { AppError } from '../errors/app-error.js'
import { successResponse } from '../lib/api-response.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { createAuthMiddleware, createCsrfMiddleware } from '../middleware/auth.js'
import type { Event } from '../db/schema.js'
import type { EventUpdateInput as DatabaseEventUpdateInput } from '../repositories/events/event-repository.js'
import type { AuthProvider, AuthUser } from '../services/auth/types.js'
import type { EventService } from '../services/events/event-service.js'
import type { ParticipantService } from '../services/participants/participant-service.js'

type Variables = { authUser: AuthUser; authSessionToken: string }
async function parseBody<T extends z.ZodType>(c: Context<{ Variables: Variables }>, schema: T): Promise<z.output<T>> {
  let body: unknown
  try { body = await c.req.json() } catch { throw new AppError(400, 'Request body must be valid JSON') }
  return schema.parse(body)
}

function toEventDto(event: Event): Omit<EventDto, 'accessRole'> {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate?.toISOString() ?? null,
    status: event.status,
    ownerId: event.ownerId,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    archivedAt: event.archivedAt?.toISOString() ?? null,
  }
}

export async function listEventsResponse(c: Context<{ Variables: Variables }>, events: EventService, participants?: ParticipantService) {
  if (participants) {
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().min(1).max(100).optional() }).safeParse(c.req.query())
    if (!query.success) throw new AppError(400, 'Invalid query parameters', query.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })))
    const result = await participants.listDiscoverableEvents(c.get('authUser').id, query.data)
    return successResponse(c, { ...result, events: result.events.map(({ accessRole, ...event }) => ({ ...toEventDto(event as Event), accessRole, registrationEligible: event.registrationEligible })), page: query.data.page, pageSize: query.data.pageSize })
  }
  const accessibleEvents = await events.listAccessible(c.get('authUser').id)
  return successResponse(c, { events: accessibleEvents.map(({ accessRole, ...event }) => ({ ...toEventDto(event), accessRole })) })
}

export function createEventRoutes(auth: AuthProvider, events: EventService, webOrigin: string, participants?: ParticipantService) {
  const routes = new Hono<{ Variables: Variables }>()
  const requireAuth = createAuthMiddleware(auth)
  const requireCsrf = createCsrfMiddleware(webOrigin)

  const listEvents = asyncHandler((c: Context<{ Variables: Variables }>) => listEventsResponse(c, events, participants))

  routes.get('/', requireAuth, listEvents)
  routes.get('', requireAuth, listEvents)

  routes.post('/', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const input = await parseBody(c, createEventSchema) as EventCreateInput
    const event = await events.create(c.get('authUser').id, {
      name: input.name,
      description: input.description ?? null,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      status: input.status ?? 'draft',
    })
    const { accessRole, ...eventRecord } = event
    return successResponse(c, { event: { ...toEventDto(eventRecord), accessRole } }, 201)
  }))

  routes.get('/:eventId', requireAuth, asyncHandler(async (c) => {
    if (participants) {
      const result = await participants.getEventDetails(c.get('authUser').id, parseEventId(c.req.param('eventId')))
      return successResponse(c, { event: { ...toEventDto(result.event as Event), accessRole: result.accessRole, registrationEligible: result.registrationEligible, registrationStatus: result.registrationStatus } })
    }
    const event = await events.getAccessible(c.get('authUser').id, parseEventId(c.req.param('eventId')))
    const { accessRole, ...eventRecord } = event
    return successResponse(c, { event: { ...toEventDto(eventRecord), accessRole } })
  }))

  routes.patch('/:eventId', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const input = await parseBody(c, updateEventSchema) as EventUpdateInput
    const databaseInput: DatabaseEventUpdateInput = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.startDate === undefined ? {} : { startDate: new Date(input.startDate) }),
      ...(input.endDate === undefined ? {} : { endDate: input.endDate === null ? null : new Date(input.endDate) }),
      ...(input.status === undefined ? {} : { status: input.status }),
    }
    const event = await events.updateAsAdmin(c.get('authUser').id, parseEventId(c.req.param('eventId')), databaseInput)
    return successResponse(c, { event: { ...toEventDto(event), accessRole: 'admin' as const } })
  }))

  routes.delete('/:eventId', requireAuth, requireCsrf, asyncHandler(async (c) => {
    const event = await events.archiveAsAdmin(c.get('authUser').id, parseEventId(c.req.param('eventId')))
    return successResponse(c, { event: { ...toEventDto(event), accessRole: 'admin' as const } })
  }))

  return routes
}

function parseEventId(value: string | undefined) {
  const parsed = z.uuid().safeParse(value)
  if (!parsed.success) throw new AppError(400, 'Event ID must be a valid UUID')
  return parsed.data
}
