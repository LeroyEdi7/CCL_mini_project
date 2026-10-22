import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { AppError } from '../src/errors/app-error.js'
import type { AdminEvent, CertificateDraftInput, CertificateRecipient, CertificateRepository, IssuedCertificate, RevocationResult, VerificationResult } from '../src/repositories/certificates/certificate-repository.js'
import { CertificateService } from '../src/services/certificates/certificate-service.js'
import { renderCertificatePdf } from '../src/services/certificates/certificate-pdf.js'
import { StorageObjectNotFoundError, type CertificateStorage } from '../src/services/certificates/certificate-storage.js'
import type { AuthProvider, AuthSession, AuthUser } from '../src/services/auth/types.js'
import type { ParticipantService } from '../src/services/participants/participant-service.js'

const admin: AuthUser = { id: '11111111-1111-4111-8111-111111111111', name: 'Event Admin', email: 'admin@example.com', emailVerifiedAt: new Date() }
const other: AuthUser = { id: '22222222-2222-4222-8222-222222222222', name: 'Other User', email: 'other@example.com', emailVerifiedAt: new Date() }
const attendee: AuthUser = { id: '33333333-3333-4333-8333-333333333333', name: 'Avery Attendee', email: 'avery@example.com', emailVerifiedAt: new Date() }
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const p1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const p2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const p3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const p4 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const now = new Date('2026-10-20T00:00:00.000Z')

const auth = {
  register: async () => {}, verifyEmail: async () => admin,
  authenticate: async (): Promise<AuthSession> => ({ user: admin, expiresAt: now, sessionToken: 'x'.repeat(43) }),
  getSession: async (token: string) => ({ admin, other, attendee }[token]),
  endSession: async () => {}, requestPasswordReset: async () => {}, completePasswordReset: async () => {},
} satisfies AuthProvider

type StoredCert = CertificateDraftInput & { status: 'draft' | 'issued' | 'revoked'; issuedAt: Date | null; revokedAt: Date | null; revokedReason: string | null; storageKey?: string; fileSizeBytes?: number; checksumSha256?: string }
class MemoryCertificateRepository implements CertificateRepository {
  eventAdmins = new Set([admin.id])
  recipients = new Map<string, CertificateRecipient>([[p1, { participantId: p1, userId: attendee.id, name: attendee.name, registrationStatus: 'attended' }], [p2, { participantId: p2, userId: other.id, name: other.name, registrationStatus: 'registered' }], [p3, { participantId: p3, userId: other.id, name: 'Casey Participant', registrationStatus: 'registered' }]])
  certificates = new Map<string, StoredCert>()
  byParticipant = new Map<string, string>()
  tokens = new Map<string, string>()
  async findAdminEvent(actorId: string, id: string): Promise<AdminEvent | undefined> { return id === eventId && this.eventAdmins.has(actorId) ? { id, name: 'HMI Graduation 2026' } : undefined }
  async findEligibleRecipient(_eventId: string, participantId: string) { return this.recipients.get(participantId) }
  async createDraft(input: CertificateDraftInput) {
    const pair = `${input.eventId}:${input.participantId}`
    if (this.byParticipant.has(pair)) throw new AppError(409, 'A certificate already exists for this participant and event')
    this.byParticipant.set(pair, input.id)
    this.certificates.set(input.id, { ...input, status: 'draft', issuedAt: null, revokedAt: null, revokedReason: null })
    this.tokens.set(input.verificationToken, input.id)
    return { id: input.id }
  }
  async completeIssuance(input: { certificateId: string; actorId: string; storageKey: string; fileSizeBytes: number; checksumSha256: string; issuedAt: Date; verificationUrl: string }): Promise<IssuedCertificate> {
    const cert = this.certificates.get(input.certificateId)
    if (!cert) throw new Error('missing draft')
    Object.assign(cert, { status: 'issued', issuedAt: input.issuedAt, storageKey: input.storageKey, fileSizeBytes: input.fileSizeBytes, checksumSha256: input.checksumSha256 })
    return { id: cert.id, certificateNumber: cert.certificateNumber, eventId: cert.eventId, participantId: cert.participantId, title: cert.title, status: 'issued', issuedAt: input.issuedAt, verificationUrl: input.verificationUrl }
  }
  async deleteDraft(id: string) {
    const cert = this.certificates.get(id)
    if (!cert || cert.status !== 'draft') return
    this.certificates.delete(id)
    this.byParticipant.delete(`${cert.eventId}:${cert.participantId}`)
    this.tokens.delete(cert.verificationToken)
  }
  async recordPendingCleanup(input: { certificateId: string; actorId: string; storageKey: string; fileSizeBytes: number; checksumSha256: string }) {
    const cert = this.certificates.get(input.certificateId)
    if (cert) Object.assign(cert, { storageKey: input.storageKey, fileSizeBytes: input.fileSizeBytes, checksumSha256: input.checksumSha256 })
  }
  async findOwnedPdf(userId: string, id: string) {
    const cert = this.certificates.get(id)
    const recipient = cert && this.recipients.get(cert.participantId)
    if (!cert || !recipient || recipient.userId !== userId || !cert.storageKey || (cert.status !== 'issued' && cert.status !== 'revoked')) return undefined
    return { ownerUserId: userId, certificateNumber: cert.certificateNumber, status: cert.status, storageKey: cert.storageKey, mimeType: 'application/pdf', checksumSha256: cert.checksumSha256 ?? '' }
  }
  async listEventCertificates(id: string, input: { page: number; pageSize: number; search?: string; status?: 'draft' | 'issued' | 'revoked' }) {
    const matches = [...this.certificates.values()].filter((cert) => cert.eventId === id && (!input.status || cert.status === input.status) && (!input.search || `${cert.certificateNumber} ${cert.participantName} ${cert.title}`.toLowerCase().includes(input.search.toLowerCase())))
    return { certificates: matches.slice((input.page - 1) * input.pageSize, input.page * input.pageSize).map((cert) => ({ id: cert.id, certificateNumber: cert.certificateNumber, participantId: cert.participantId, participantName: cert.participantName, title: cert.title, status: cert.status as 'draft' | 'issued' | 'revoked', issuedAt: cert.issuedAt, revokedAt: cert.revokedAt, createdAt: now })), total: matches.length }
  }
  async revoke(actorId: string, id: string, reason: string, at: Date): Promise<RevocationResult | undefined> {
    const cert = this.certificates.get(id)
    if (!cert || !this.eventAdmins.has(actorId)) return undefined
    if (cert.status === 'revoked') return { id, certificateNumber: cert.certificateNumber, status: 'revoked', revokedAt: cert.revokedAt ?? at, alreadyRevoked: true }
    if (cert.status !== 'issued') throw new AppError(409, 'Only issued certificates can be revoked')
    Object.assign(cert, { status: 'revoked', revokedAt: at, revokedReason: reason })
    return { id, certificateNumber: cert.certificateNumber, status: 'revoked', revokedAt: at, alreadyRevoked: false }
  }
  async verify(token: string): Promise<VerificationResult | undefined> {
    const cert = this.certificates.get(this.tokens.get(token) ?? '')
    if (!cert || (cert.status !== 'issued' && cert.status !== 'revoked')) return undefined
    return { status: cert.status === 'revoked' ? 'revoked' : 'valid', certificateNumber: cert.certificateNumber, title: cert.title, participantName: cert.participantName, eventName: cert.eventName, issuedAt: cert.issuedAt, revokedAt: cert.revokedAt }
  }
}

class MemoryStorage implements CertificateStorage {
  objects = new Map<string, Uint8Array>()
  failPut = false
  failGet = false
  failDelete = false
  async put(key: string, bytes: Uint8Array) { if (this.failPut) throw new Error('upload failed'); this.objects.set(key, bytes) }
  async get(key: string) { if (this.failGet) throw new Error('download failed'); const bytes = this.objects.get(key); if (!bytes) throw new StorageObjectNotFoundError(); return { bytes, contentType: 'application/pdf' } }
  async delete(key: string) { if (this.failDelete) throw new Error('delete failed'); this.objects.delete(key) }
}

const repo = new MemoryCertificateRepository()
const storage = new MemoryStorage()
const service = new CertificateService(repo, storage, 'https://verify.example.test/api/verify', () => now, async () => Buffer.from('%PDF-test'))
const app = createApp(auth, { webOrigin: 'http://localhost:5173', sessionTtlSeconds: 3600, secureCookies: false }, undefined, {} as ParticipantService, service)
const request = (path: string, token?: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { cookie: `titlecert_session=${token}` } : {}) } })
const issueOne = (participantId: string, token = 'admin') => request(`/api/events/${eventId}/certificates`, token, { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ participantId, title: 'Certificate of Achievement' }) })

test('authorized issuance generates unique identifiers, stores PDFs, and rejects duplicate issuance', async () => {
  assert.equal((await issueOne(p1, 'other')).status, 404)
  const issued = await issueOne(p1)
  assert.equal(issued.status, 201)
  const payload = await issued.json() as { data: { certificate: IssuedCertificate } }
  const certificate = payload.data.certificate
  assert.match(certificate.certificateNumber, /^HMI-2026-[A-F0-9]{16}$/)
  assert.match(certificate.verificationUrl, /^https:\/\/verify\.example\.test\/api\/verify\/[A-Za-z0-9_-]{43}$/)
  assert.equal(repo.certificates.get(certificate.id)?.status, 'issued')
  assert.ok(storage.objects.has(repo.certificates.get(certificate.id)?.storageKey ?? ''))
  assert.equal((await issueOne(p1)).status, 409)
})

test('event certificate listing is event-admin-only and supports search and status filtering', async () => {
  const unauthorized = await request(`/api/events/${eventId}/certificates`, 'other')
  assert.equal(unauthorized.status, 404)
  const response = await request(`/api/events/${eventId}/certificates?search=Avery&status=issued`, 'admin')
  assert.equal(response.status, 200)
  const data = await response.json() as { data: { certificates: Array<{ participantName: string; status: string }>; total: number } }
  assert.ok(data.data.certificates.some((certificate) => certificate.participantName === 'Avery Attendee' && certificate.status === 'issued'))
})

test('bulk issuance returns a result for every recipient and does not retain failed drafts', async () => {
  const response = await request(`/api/events/${eventId}/certificates/bulk`, 'admin', { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ participantIds: [p2, p4, p2], title: 'Graduation' }) })
  assert.equal(response.status, 200)
  const data = await response.json() as { data: { issuedCount: number; failedCount: number; results: Array<{ success: boolean; error?: { statusCode: number } }> } }
  assert.deepEqual([data.data.issuedCount, data.data.failedCount], [1, 2])
  assert.deepEqual(data.data.results.map((result) => result.success), [true, false, false])
  assert.equal(data.data.results[1].error?.statusCode, 422)
  assert.equal(data.data.results[2].error?.statusCode, 409)

  storage.failPut = true
  const failed = await issueOne(p3)
  storage.failPut = false
  assert.equal(failed.status, 502)
  assert.equal([...repo.certificates.values()].filter((cert) => cert.status === 'draft').length, 0)

  storage.failPut = true
  storage.failDelete = true
  const cleanupPending = await issueOne(p3)
  storage.failDelete = false
  storage.failPut = false
  assert.equal(cleanupPending.status, 502)
  const pending = [...repo.certificates.values()].find((cert) => cert.participantId === p3)
  assert.equal(pending?.status, 'draft')
  assert.ok(pending?.storageKey)
})

test('PDF download is owner-only and storage failures are mapped safely', async () => {
  const certId = [...repo.certificates.values()].find((cert) => cert.participantId === p1)?.id
  assert.ok(certId)
  assert.equal((await request(`/api/certificates/${certId}/pdf`)).status, 401)
  assert.equal((await request(`/api/certificates/${certId}/pdf`, 'other')).status, 404)
  const downloaded = await request(`/api/certificates/${certId}/pdf`, 'attendee')
  assert.equal(downloaded.status, 200)
  assert.match(downloaded.headers.get('content-disposition') ?? '', /\.pdf/)
  const previewed = await request(`/api/certificates/${certId}/pdf?disposition=inline`, 'attendee')
  assert.equal(previewed.headers.get('content-disposition')?.startsWith('inline;'), true)
  storage.objects.clear()
  assert.equal((await request(`/api/certificates/${certId}/pdf`, 'attendee')).status, 404)
  storage.failGet = true
  assert.equal((await request(`/api/certificates/${certId}/pdf`, 'attendee')).status, 502)
  storage.failGet = false
})

test('revocation is event-admin-only, idempotent, audited, and public verification reflects current status', async () => {
  const cert = [...repo.certificates.values()].find((value) => value.participantId === p1)
  assert.ok(cert)
  const noAuth = await request(`/api/certificates/${cert.id}/revoke`, undefined, { method: 'PATCH' })
  assert.equal(noAuth.status, 401)
  const unauthorized = await request(`/api/certificates/${cert.id}/revoke`, 'other', { method: 'PATCH', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Issued in error' }) })
  assert.equal(unauthorized.status, 404)
  const revoked = await request(`/api/certificates/${cert.id}/revoke`, 'admin', { method: 'PATCH', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Issued in error' }) })
  assert.equal(revoked.status, 200)
  const repeated = await request(`/api/certificates/${cert.id}/revoke`, 'admin', { method: 'PATCH', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Issued in error' }) })
  assert.equal((await repeated.json() as { data: { certificate: { alreadyRevoked: boolean } } }).data.certificate.alreadyRevoked, true)
  const publicResult = await request(`/api/verify/${cert.verificationToken}`)
  assert.equal((await publicResult.json() as { data: { result: string; valid: boolean } }).data.result, 'revoked')
  const unknown = await request(`/api/verify/${'Z'.repeat(43)}`)
  assert.equal((await unknown.json() as { data: { result: string } }).data.result, 'not_found')
})

test('predefined renderer creates a PDF with embedded verification QR code', async () => {
  const pdf = await renderCertificatePdf({ certificateNumber: 'HMI-2026-1234567890', participantName: 'Avery Attendee', eventName: 'HMI Graduation 2026', title: 'Certificate of Achievement', description: null, issuerName: 'Event Admin', issuedAt: now, verificationUrl: 'https://verify.example.test/api/verify/token' })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.ok(pdf.byteLength > 1000)
})
