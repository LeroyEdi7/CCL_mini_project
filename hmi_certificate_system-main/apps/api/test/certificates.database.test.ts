import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { and, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../src/db/schema.js'
import { auditLogs, certificateAssets, certificates, eventMemberships, eventRegistrations, events, participants, users } from '../src/db/schema.js'
import { createApp } from '../src/app.js'
import type { CertificateRepository } from '../src/repositories/certificates/certificate-repository.js'
import { DrizzleCertificateRepository } from '../src/repositories/certificates/drizzle-certificate-repository.js'
import { DrizzleParticipantRepository } from '../src/repositories/participants/drizzle-participant-repository.js'
import { CertificateService } from '../src/services/certificates/certificate-service.js'
import { StorageObjectNotFoundError, type CertificateStorage } from '../src/services/certificates/certificate-storage.js'
import { ParticipantService } from '../src/services/participants/participant-service.js'
import type { AuthProvider, AuthSession, AuthUser } from '../src/services/auth/types.js'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const explicitlyIsolated = process.env.TEST_DATABASE_ISOLATED === 'true'
function sameDatabaseTarget(first?: string, second?: string) {
  if (!first || !second) return false
  try {
    const a = new URL(first); const b = new URL(second)
    return a.hostname === b.hostname && a.port === b.port && a.pathname === b.pathname
  } catch { return false }
}
const usesApplicationDatabase = sameDatabaseTarget(testDatabaseUrl, process.env.DATABASE_URL)
const skipReason = !testDatabaseUrl ? 'Set TEST_DATABASE_URL to a migrated isolated PostgreSQL test database.'
  : !explicitlyIsolated ? 'Set TEST_DATABASE_ISOLATED=true only after confirming TEST_DATABASE_URL is disposable and isolated.'
    : usesApplicationDatabase ? 'TEST_DATABASE_URL must not equal the application DATABASE_URL.' : false

class TestStorage implements CertificateStorage {
  objects = new Map<string, Uint8Array>()
  failNextPut = false
  failGet = false
  failDelete = false
  async put(key: string, bytes: Uint8Array) {
    if (this.failNextPut) { this.failNextPut = false; throw new Error('simulated storage upload failure') }
    this.objects.set(key, bytes)
  }
  async get(key: string) {
    if (this.failGet) throw new Error('simulated storage download failure')
    const bytes = this.objects.get(key)
    if (!bytes) throw new StorageObjectNotFoundError()
    return { bytes, contentType: 'application/pdf' }
  }
  async delete(key: string) {
    if (this.failDelete) throw new Error('simulated storage deletion failure')
    this.objects.delete(key)
  }
}

test('PostgreSQL-backed certificate HTTP lifecycle', { skip: skipReason }, async (t) => {
  assert.ok(testDatabaseUrl)
  const pool = new Pool({ connectionString: testDatabaseUrl, ssl: { rejectUnauthorized: false }, max: 4 })
  const database = drizzle(pool, { schema })
  const ids = {
    admin: randomUUID(), member: randomUUID(),
    recipients: Array.from({ length: 5 }, () => ({ userId: randomUUID(), participantId: randomUUID() })),
    event: randomUUID(),
  }
  const eventName = `Certificate integration ${randomUUID()}`
  const adminUser: AuthUser = { id: ids.admin, name: 'Integration Event Admin', email: `${randomUUID()}@integration.invalid`, emailVerifiedAt: new Date() }
  const memberUser: AuthUser = { id: ids.member, name: 'Integration Event Member', email: `${randomUUID()}@integration.invalid`, emailVerifiedAt: new Date() }
  const recipientUsers: AuthUser[] = ids.recipients.map((item, index) => ({ id: item.userId, name: `Integration Recipient ${index + 1}`, email: `${randomUUID()}@integration.invalid`, emailVerifiedAt: new Date() }))
  const identities: Record<string, AuthUser> = { 'integration-admin': adminUser, 'integration-member': memberUser }
  recipientUsers.forEach((user, index) => { identities[`integration-recipient-${index + 1}`] = user })
  const auth = {
    register: async () => {}, verifyEmail: async () => adminUser,
    authenticate: async (): Promise<AuthSession> => ({ user: adminUser, expiresAt: new Date(Date.now() + 60_000), sessionToken: 'integration-admin' }),
    getSession: async (token: string) => identities[token], endSession: async () => {},
    requestPasswordReset: async () => {}, completePasswordReset: async () => {},
  } satisfies AuthProvider
  const storage = new TestStorage()
  const repository = new DrizzleCertificateRepository(database)
  const participantsRepository = new DrizzleParticipantRepository(database)
  const service = new CertificateService(repository, storage, 'https://verify.test/verify')
  const config = { webOrigin: 'https://app.test', sessionTtlSeconds: 3600, secureCookies: true }
  const app = createApp(auth, config, undefined, new ParticipantService(participantsRepository), service)
  const headers = (identity?: string, method = 'GET', json = false) => ({
    ...(identity ? { cookie: `titlecert_session=${identity}` } : {}),
    ...(method !== 'GET' ? { origin: config.webOrigin } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
  })
  const issue = (participantId: string, identity = 'integration-admin', targetApp = app) => targetApp.request(`/api/events/${ids.event}/certificates`, {
    method: 'POST', headers: headers(identity, 'POST', true), body: JSON.stringify({ participantId, title: 'Database Integration Certificate' }),
  })
  let seeded = false

  try {
    await t.test('preflight confirms isolated target has no duplicate recipients and migration 0003', async () => {
      const connection = await pool.connect()
      try {
        const duplicates = await connection.query('SELECT COUNT(*)::int AS groups FROM (SELECT event_id, participant_id FROM certificates GROUP BY event_id, participant_id HAVING COUNT(*) > 1) d')
        assert.equal(duplicates.rows[0].groups, 0, 'resolve certificate duplicates before running integration tests')
        const index = await connection.query("SELECT to_regclass('public.certificates_event_participant_uidx') IS NOT NULL AS present")
        assert.equal(index.rows[0].present, true, 'run migrations against the isolated test database before the integration suite')
      } finally { connection.release() }
    })

    await database.transaction(async (tx) => {
      await tx.insert(users).values([
        { id: ids.admin, name: adminUser.name, email: adminUser.email, emailVerifiedAt: adminUser.emailVerifiedAt },
        { id: ids.member, name: memberUser.name, email: memberUser.email, emailVerifiedAt: memberUser.emailVerifiedAt },
        ...recipientUsers.map((user) => ({ id: user.id, name: user.name, email: user.email, emailVerifiedAt: user.emailVerifiedAt })),
      ])
      await tx.insert(events).values({ id: ids.event, name: eventName, description: 'Temporary integration fixture', startDate: new Date('2020-01-01T00:00:00.000Z'), status: 'completed', ownerId: ids.admin })
      await tx.insert(eventMemberships).values([{ eventId: ids.event, userId: ids.admin, role: 'admin' }, { eventId: ids.event, userId: ids.member, role: 'member' }])
      await tx.insert(participants).values(ids.recipients.map((recipient) => ({ id: recipient.participantId, userId: recipient.userId })))
      await tx.insert(eventRegistrations).values(ids.recipients.map((recipient, index) => ({ eventId: ids.event, participantId: recipient.participantId, status: index === 0 ? 'attended' as const : 'registered' as const })))
    })
    seeded = true

    await t.test('HTTP issuance persists certificate, PDF metadata, audit record, and owner-only PDF response', async () => {
      const response = await issue(ids.recipients[0].participantId)
      assert.equal(response.status, 201)
      const body = await response.json() as { data: { certificate: { id: string; certificateNumber: string; verificationUrl: string } } }
      const issued = body.data.certificate
      const [record] = await database.select().from(certificates).where(eq(certificates.id, issued.id))
      const [asset] = await database.select().from(certificateAssets).where(and(eq(certificateAssets.certificateId, issued.id), eq(certificateAssets.type, 'pdf')))
      const [audit] = await database.select().from(auditLogs).where(and(eq(auditLogs.entityId, issued.id), eq(auditLogs.action, 'CERTIFICATE_ISSUED')))
      assert.equal(record?.status, 'issued')
      assert.equal(asset?.mimeType, 'application/pdf')
      assert.ok(asset && asset.fileSizeBytes > 0)
      assert.match(asset?.checksumSha256 ?? '', /^[a-f0-9]{64}$/)
      assert.ok(audit)

      assert.equal((await app.request(`/api/certificates/${issued.id}/pdf`)).status, 401)
      assert.equal((await app.request(`/api/certificates/${issued.id}/pdf`, { headers: headers('integration-admin') })).status, 404)
      const pdf = await app.request(`/api/certificates/${issued.id}/pdf`, { headers: headers('integration-recipient-1') })
      assert.equal(pdf.status, 200)
      assert.equal(pdf.headers.get('content-type'), 'application/pdf')
      assert.equal(pdf.headers.get('cache-control'), 'private, no-store')
      assert.match(pdf.headers.get('content-disposition') ?? '', /\.pdf/)
      const bytes = new Uint8Array(await pdf.arrayBuffer())
      assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-')
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset?.checksumSha256)
      storage.failGet = true
      assert.equal((await app.request(`/api/certificates/${issued.id}/pdf`, { headers: headers('integration-recipient-1') })).status, 502)
      storage.failGet = false

      const token = new URL(issued.verificationUrl).pathname.split('/').at(-1)
      assert.ok(token)
      const verification = await app.request(`/api/verify/${token}`)
      const verificationBody = await verification.json() as { data: { result: string; valid: boolean; certificate: Record<string, unknown> } }
      assert.equal(verificationBody.data.result, 'valid')
      assert.equal(verificationBody.data.valid, true)
      assert.equal('email' in verificationBody.data.certificate, false)
      assert.equal('participantId' in verificationBody.data.certificate, false)

      const listing = await app.request(`/api/events/${ids.event}/certificates?search=${encodeURIComponent(issued.certificateNumber)}`, { headers: headers('integration-admin') })
      assert.equal(listing.status, 200)
      const listingBody = await listing.json() as { data: { total: number; certificates: Array<{ id: string }> } }
      assert.equal(listingBody.data.total, 1)
      assert.equal(listingBody.data.certificates[0].id, issued.id)
      assert.equal((await app.request(`/api/events/${ids.event}/certificates`, { headers: headers('integration-member') })).status, 404)
    })

    await t.test('non-admin issuance is denied; duplicates and concurrent requests obey the unique constraint', async () => {
      assert.equal((await issue(ids.recipients[1].participantId, 'integration-member')).status, 404)
      const concurrent = await Promise.all([issue(ids.recipients[1].participantId), issue(ids.recipients[1].participantId)])
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409])
      assert.equal((await issue(ids.recipients[1].participantId)).status, 409)
      const rows = await database.select().from(certificates).where(and(eq(certificates.eventId, ids.event), eq(certificates.participantId, ids.recipients[1].participantId)))
      assert.equal(rows.length, 1)
    })

    await t.test('bulk issuance reports a storage failure per recipient and cleans up its draft', async () => {
      storage.failNextPut = true
      const response = await app.request(`/api/events/${ids.event}/certificates/bulk`, { method: 'POST', headers: headers('integration-admin', 'POST', true), body: JSON.stringify({ participantIds: [ids.recipients[2].participantId, ids.recipients[3].participantId], title: 'Bulk Integration' }) })
      assert.equal(response.status, 200)
      const body = await response.json() as { data: { issuedCount: number; failedCount: number; results: Array<{ participantId: string; success: boolean }> } }
      assert.deepEqual([body.data.issuedCount, body.data.failedCount], [1, 1])
      assert.equal(body.data.results[0].success, false)
      assert.equal(body.data.results[1].success, true)
      const failedRows = await database.select().from(certificates).where(and(eq(certificates.eventId, ids.event), eq(certificates.participantId, ids.recipients[2].participantId)))
      assert.equal(failedRows.length, 0)
    })

    await t.test('revocation is event-admin-only and public verification reads current database state', async () => {
      const issuedRows = await database.select().from(certificates).where(and(eq(certificates.eventId, ids.event), eq(certificates.participantId, ids.recipients[0].participantId)))
      const cert = issuedRows[0]
      assert.ok(cert)
      const body = JSON.stringify({ reason: 'Integration test revocation' })
      const unauthorized = await app.request(`/api/certificates/${cert.id}/revoke`, { method: 'PATCH', headers: headers('integration-member', 'PATCH', true), body })
      assert.equal(unauthorized.status, 404)
      const revoked = await app.request(`/api/certificates/${cert.id}/revoke`, { method: 'PATCH', headers: headers('integration-admin', 'PATCH', true), body })
      assert.equal(revoked.status, 200)
      const token = cert.verificationToken
      const verification = await app.request(`/api/verify/${token}`)
      const result = await verification.json() as { data: { result: string; valid: boolean } }
      assert.equal(result.data.result, 'revoked')
      assert.equal(result.data.valid, false)
    })

    await t.test('database transaction failures roll back metadata and exercise both cleanup paths', async () => {
      const originalComplete = repository.completeIssuance.bind(repository)
      const failingRepository = new Proxy(repository, {
        get(target, property) {
          if (property === 'completeIssuance') return (input: Parameters<CertificateRepository['completeIssuance']>[0]) => originalComplete({ ...input, actorId: randomUUID() })
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        },
      }) as CertificateRepository
      const failureService = new CertificateService(failingRepository, storage, 'https://verify.test/verify')
      const failureApp = createApp(auth, config, undefined, new ParticipantService(participantsRepository), failureService)
      const failure = await issue(ids.recipients[4].participantId, 'integration-admin', failureApp)
      assert.equal(failure.status, 502)
      const rolledBack = await database.select().from(certificates).where(and(eq(certificates.eventId, ids.event), eq(certificates.participantId, ids.recipients[4].participantId)))
      assert.equal(rolledBack.length, 0)

      storage.failDelete = true
      const pendingFailure = await issue(ids.recipients[4].participantId, 'integration-admin', failureApp)
      storage.failDelete = false
      assert.equal(pendingFailure.status, 502)
      const pending = await database.select().from(certificates).where(and(eq(certificates.eventId, ids.event), eq(certificates.participantId, ids.recipients[4].participantId)))
      assert.equal(pending[0]?.status, 'draft')
      const pendingAsset = await database.select().from(certificateAssets).where(eq(certificateAssets.certificateId, pending[0]?.id ?? ''))
      assert.equal(pendingAsset.length, 1)
      assert.ok(storage.objects.has(pendingAsset[0].storageKey))
      await storage.delete(pendingAsset[0].storageKey)
    })
  } finally {
    if (seeded) {
      const certificateRows = await database.select({ id: certificates.id }).from(certificates).where(eq(certificates.eventId, ids.event))
      const certificateIds = certificateRows.map((row) => row.id)
      if (certificateIds.length) {
        await database.delete(certificateAssets).where(inArray(certificateAssets.certificateId, certificateIds))
        await database.delete(auditLogs).where(and(eq(auditLogs.entityType, 'certificate'), inArray(auditLogs.entityId, certificateIds)))
        await database.delete(certificates).where(inArray(certificates.id, certificateIds))
      }
      await database.delete(eventRegistrations).where(eq(eventRegistrations.eventId, ids.event))
      await database.delete(participants).where(inArray(participants.id, ids.recipients.map((recipient) => recipient.participantId)))
      await database.delete(eventMemberships).where(eq(eventMemberships.eventId, ids.event))
      await database.delete(events).where(eq(events.id, ids.event))
      await database.delete(users).where(inArray(users.id, [ids.admin, ids.member, ...ids.recipients.map((recipient) => recipient.userId)]))
    }
    await pool.end()
  }
})
