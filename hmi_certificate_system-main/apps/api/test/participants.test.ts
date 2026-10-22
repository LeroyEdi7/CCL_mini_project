import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import type { ParticipantRepository, PageInput, EventRecord, CertificateRecord } from '../src/repositories/participants/participant-repository.js'
import { ParticipantService } from '../src/services/participants/participant-service.js'
import type { AuthProvider, AuthSession, AuthUser } from '../src/services/auth/types.js'

const first: AuthUser = { id: '11111111-1111-4111-8111-111111111111', name: 'First', email: 'first@example.com', emailVerifiedAt: new Date() }
const second: AuthUser = { id: '22222222-2222-4222-8222-222222222222', name: 'Second', email: 'second@example.com', emailVerifiedAt: new Date() }
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const certificateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const now = new Date('2026-10-20T00:00:00.000Z')
const event: EventRecord = { id: eventId, name: 'Published event', description: null, startDate: new Date('2026-11-01T00:00:00.000Z'), endDate: null, status: 'published', ownerId: first.id, createdAt: now, updatedAt: now, archivedAt: null }
const certificate: CertificateRecord = { id: certificateId, certificateNumber: 'CERT-1', participantId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', eventId, eventName: event.name, title: 'Completion', description: null, status: 'issued', issuedAt: now, revokedAt: null, createdAt: now, updatedAt: now }
const auth = {
  register: async () => {}, verifyEmail: async () => first,
  authenticate: async (): Promise<AuthSession> => ({ user: first, expiresAt: now, sessionToken: 'x'.repeat(43) }),
  getSession: async (token: string) => token === 'first' ? first : token === 'second' ? second : undefined,
  endSession: async () => {}, requestPasswordReset: async () => {}, completePasswordReset: async () => {},
} satisfies AuthProvider

class MemoryParticipantRepository implements ParticipantRepository {
  registration: { id: string; eventId: string; status: string; registeredAt: Date; updatedAt: Date } | undefined
  ownerId = first.id
  async listDiscoverableEvents() { return { events: [{ ...event, accessRole: null }], total: 1 } }
  async findEvent() { return event }
  async listUserEvents() { return { events: this.registration ? [{ ...event, registrationId: this.registration.id, registrationStatus: this.registration.status, registeredAt: this.registration.registeredAt }] : [], total: this.registration ? 1 : 0 } }
  async findRegistration(userId: string) { return userId === first.id ? this.registration : undefined }
  async register(userId: string, id: string, at: Date) {
    if (this.registration) return { registration: this.registration, created: false }
    this.registration = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', eventId: id, status: 'registered', registeredAt: at, updatedAt: at }
    return { registration: this.registration, created: true }
  }
  async cancelRegistration() { if (!this.registration) return undefined; this.registration = { ...this.registration, status: 'cancelled' }; return this.registration }
  async isEventMember(userId: string) { return userId === this.ownerId }
  async isEventAdmin(userId: string) { return userId === this.ownerId }
  async listEventParticipants(_id: string, _input: PageInput) { return { participants: [{ participantId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userId: first.id, name: first.name, email: first.email, registrationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'registered', registeredAt: now }], total: 1 } }
  async updateRegistrationStatus(id: string, participantId: string, status: 'registered' | 'attended' | 'absent', at: Date) {
    if (!this.registration || id !== eventId) return undefined
    this.registration = { ...this.registration, status, updatedAt: at }
    return { ...this.registration, participantId }
  }
  async listUserCertificates(userId: string) { return { certificates: userId === first.id ? [certificate] : [], total: userId === first.id ? 1 : 0 } }
  async findOwnedCertificate(userId: string, id: string) { return userId === this.ownerId && id === certificateId ? certificate : undefined }
  async findPdfAsset() { return undefined }
}

const repository = new MemoryParticipantRepository()
const app = createApp(auth, { webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false }, undefined, new ParticipantService(repository, () => now))
const request = (path: string, token?: string, options: RequestInit = {}) => app.request(path, {
  ...options,
  headers: { ...(options.headers ?? {}), ...(token ? { cookie: `titlecert_session=${token}` } : {}) },
})

test('registration is authenticated, scoped to the user, and duplicate-safe', async () => {
  assert.equal((await request(`/api/events/${eventId}/registration`, undefined, { method: 'POST' })).status, 401)
  const created = await request(`/api/events/${eventId}/registration`, 'first', { method: 'POST', headers: { origin: 'http://localhost:5173' } })
  assert.equal(created.status, 201)
  const body = await created.json() as { data: { eventId: string; registrationStatus: string; membershipId: string } }
  assert.deepEqual([body.data.eventId, body.data.registrationStatus], [eventId, 'registered'])
  assert.ok(body.data.membershipId)
  assert.equal((await request(`/api/events/${eventId}/registration`, 'first', { method: 'POST', headers: { origin: 'http://localhost:5173' } })).status, 409)
  assert.equal((await request('/api/me/events', 'first')).status, 200)
  assert.equal((await request('/api/me/events', 'second')).status, 200)
  assert.equal((await request(`/api/me/events/${eventId}/registration`, 'second')).status, 200)
})

test('certificate access is derived from ownership and admins are event-scoped', async () => {
  assert.equal((await request('/api/me/certificates', 'first')).status, 200)
  assert.equal((await request(`/api/certificates/${certificateId}`, 'first')).status, 200)
  assert.equal((await request(`/api/certificates/${certificateId}`, 'second')).status, 404)
  assert.equal((await request(`/api/events/${eventId}/participants`, 'first')).status, 200)
  assert.equal((await request(`/api/events/${eventId}/participants/cccccccc-cccc-4ccc-8ccc-cccccccccccc`, 'first', { method: 'PATCH', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'attended' }) })).status, 200)
  repository.ownerId = second.id
  assert.equal((await request(`/api/events/${eventId}/participants`, 'first')).status, 404)
  assert.equal((await request(`/api/events/${eventId}/participants/cccccccc-cccc-4ccc-8ccc-cccccccccccc`, 'first', { method: 'PATCH', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'absent' }) })).status, 404)
  assert.equal((await request(`/api/events/${eventId}/participants`, 'second')).status, 200)
})
