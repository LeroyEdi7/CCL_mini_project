import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Event, EventMemberRole } from '../src/db/schema.js'
import { createApp } from '../src/app.js'
import type { EventRepository, AccessibleEvent, EventUpdateInput, NewEventInput } from '../src/repositories/events/event-repository.js'
import { EventService } from '../src/services/events/event-service.js'
import type { AuthProvider, AuthSession, AuthUser } from '../src/services/auth/types.js'

const firstUser: AuthUser = { id: '11111111-1111-4111-8111-111111111111', name: 'First', email: 'first@example.com', emailVerifiedAt: new Date() }
const secondUser: AuthUser = { id: '22222222-2222-4222-8222-222222222222', name: 'Second', email: 'second@example.com', emailVerifiedAt: new Date() }
const unverifiedUser: AuthUser = { ...secondUser, id: '33333333-3333-4333-8333-333333333333', emailVerifiedAt: null }
const validId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const auth = {
  register: async () => {}, verifyEmail: async () => firstUser,
  authenticate: async (): Promise<AuthSession> => ({ user: firstUser, expiresAt: new Date(), sessionToken: 'x'.repeat(43) }),
  getSession: async (token: string) => token === 'first' ? firstUser : token === 'second' ? secondUser : token === 'unverified' ? undefined : undefined,
  endSession: async () => {}, requestPasswordReset: async () => {}, completePasswordReset: async () => {},
} satisfies AuthProvider

class MemoryEventRepository implements EventRepository {
  records = new Map<string, Event>()
  memberships = new Map<string, EventMemberRole>()
  certificateEventIds = new Set<string>()

  async createWithAdminMembership(creatorId: string, input: NewEventInput): Promise<AccessibleEvent> {
    const now = new Date()
    const event: Event = { id: validId, ...input, ownerId: creatorId, createdAt: now, updatedAt: now, archivedAt: null }
    this.records.set(event.id, event)
    this.memberships.set(`${event.id}:${creatorId}`, 'admin')
    return { ...event, accessRole: 'admin' }
  }

  async listAccessible(userId: string): Promise<AccessibleEvent[]> {
    return [...this.records.values()].flatMap((event) => {
      const role = this.memberships.get(`${event.id}:${userId}`)
      return role && !event.archivedAt ? [{ ...event, accessRole: role }] : []
    })
  }

  async findAccessible(userId: string, eventId: string): Promise<AccessibleEvent | undefined> {
    const event = this.records.get(eventId)
    const role = this.memberships.get(`${eventId}:${userId}`)
    return event && !event.archivedAt && role ? { ...event, accessRole: role } : undefined
  }

  async update(eventId: string, input: EventUpdateInput, now: Date): Promise<Event | undefined> {
    const event = this.records.get(eventId)
    if (!event || event.archivedAt) return undefined
    const updated = { ...event, ...input, updatedAt: now }
    this.records.set(eventId, updated)
    return updated
  }

  async archive(eventId: string, now: Date): Promise<Event | undefined> {
    const event = this.records.get(eventId)
    if (!event || event.archivedAt) return undefined
    const archived = { ...event, archivedAt: now, updatedAt: now }
    this.records.set(eventId, archived)
    return archived
  }
}

const repository = new MemoryEventRepository()
const eventService = new EventService(repository)
const app = createApp(auth, { webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false }, eventService)
const request = (method: string, token?: string, body?: unknown) => app.request('/api/events', {
  method,
  headers: {
    origin: 'http://localhost:5173',
    ...(token ? { cookie: `titlecert_session=${token}` } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const eventInput = { name: 'Conference', description: 'Annual meeting', startDate: '2026-11-01T10:00:00.000Z', endDate: '2026-11-02T10:00:00.000Z' }

test('event creation atomically grants creator admin, list/detail/edit are scoped to membership', async () => {
  const unauthenticated = await request('POST', undefined, eventInput)
  assert.equal(unauthenticated.status, 401)

  const created = await request('POST', 'first', eventInput)
  assert.equal(created.status, 201)
  const createdBody = await created.json() as { success: boolean; data: { event: { id: string; accessRole: string } } }
  assert.equal(createdBody.success, true)
  assert.equal(createdBody.data.event.accessRole, 'admin')
  assert.equal(repository.memberships.get(`${validId}:${firstUser.id}`), 'admin')

  const list = await request('GET', 'first')
  assert.equal(list.status, 200)
  const listBody = await list.json() as { data: { events: unknown[] } }
  assert.equal(listBody.data.events.length, 1)
  const slashList = await app.request('/api/events/', { headers: { cookie: 'titlecert_session=first' } })
  assert.equal(slashList.status, 200)

  const hidden = await app.request(`/api/events/${validId}`, { headers: { cookie: 'titlecert_session=second' } })
  assert.equal(hidden.status, 404)
  const detail = await app.request(`/api/events/${validId}`, { headers: { cookie: 'titlecert_session=first' } })
  assert.equal(detail.status, 200)

  const edited = await app.request(`/api/events/${validId}`, { method: 'PATCH', headers: { origin: 'http://localhost:5173', cookie: 'titlecert_session=first', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Updated' }) })
  assert.equal(edited.status, 200)
  assert.equal(repository.records.get(validId)?.name, 'Updated')
})

test('unverified users, members, other event admins, invalid dates, and missing events are rejected', async () => {
  const unverified = await request('GET', 'unverified')
  assert.equal(unverified.status, 401)

  repository.memberships.set(`${validId}:${secondUser.id}`, 'member')
  const nonAdmin = await app.request(`/api/events/${validId}`, { method: 'PATCH', headers: { origin: 'http://localhost:5173', cookie: 'titlecert_session=second', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Forbidden' }) })
  assert.equal(nonAdmin.status, 403)

  repository.memberships.set(`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:${secondUser.id}`, 'admin')
  const crossEvent = await app.request(`/api/events/${validId}`, { method: 'DELETE', headers: { origin: 'http://localhost:5173', cookie: 'titlecert_session=second' } })
  assert.equal(crossEvent.status, 403)

  const invalidDates = await request('POST', 'first', { ...eventInput, startDate: '2026-11-03T10:00:00.000Z' })
  assert.equal(invalidDates.status, 400)
  const nonexistent = await app.request('/api/events/cccccccc-cccc-4ccc-8ccc-cccccccccccc', { headers: { cookie: 'titlecert_session=first' } })
  assert.equal(nonexistent.status, 404)
  const malformedId = await app.request('/api/events/not-a-uuid', { headers: { cookie: 'titlecert_session=first' } })
  assert.equal(malformedId.status, 400)
})

test('delete archives the event and preserves certificate history references', async () => {
  repository.certificateEventIds.add(validId)
  const archived = await app.request(`/api/events/${validId}`, { method: 'DELETE', headers: { origin: 'http://localhost:5173', cookie: 'titlecert_session=first' } })
  assert.equal(archived.status, 200)
  assert.ok(repository.records.get(validId)?.archivedAt)
  assert.ok(repository.certificateEventIds.has(validId))
  const hiddenFromList = await request('GET', 'first')
  assert.equal((await hiddenFromList.json() as { data: { events: unknown[] } }).data.events.length, 0)
})
