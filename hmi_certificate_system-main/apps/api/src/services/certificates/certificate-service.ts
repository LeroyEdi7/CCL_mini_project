import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { AppError } from '../../errors/app-error.js'
import type { CertificateRepository, EventCertificateListInput, IssuedCertificate } from '../../repositories/certificates/certificate-repository.js'
import { StorageObjectNotFoundError, type CertificateStorage } from './certificate-storage.js'
import { renderCertificatePdf } from './certificate-pdf.js'

export type CertificatePdfGenerator = (input: Parameters<typeof renderCertificatePdf>[0]) => Promise<Uint8Array>
export type CertificateIssueInput = { participantId: string; title: string; description?: string | null }
export type CertificatePublicResult =
  | { result: 'not_found'; valid: false }
  | { result: 'valid' | 'revoked'; valid: boolean; certificate: { certificateNumber: string; title: string; participantName: string; eventName: string; issuedAt: string | null; revokedAt: string | null } }

export class CertificateService {
  constructor(
    private readonly repository: CertificateRepository,
    private readonly storage: CertificateStorage | undefined,
    private readonly publicVerifyBaseUrl: string,
    private readonly now: () => Date = () => new Date(),
    private readonly renderPdf: CertificatePdfGenerator = renderCertificatePdf,
  ) {}

  async issue(actor: { id: string; name: string }, eventId: string, input: CertificateIssueInput) {
    const event = await this.assertEventAdmin(actor.id, eventId)
    const storage = this.requireStorage()
    return this.issueForRecipient(actor, event, input, storage)
  }

  async issueBulk(actor: { id: string; name: string }, eventId: string, input: { participantIds: string[]; title: string; description?: string | null }) {
    const event = await this.assertEventAdmin(actor.id, eventId)
    const storage = this.requireStorage()
    const seen = new Set<string>()
    const results: Array<{ participantId: string; success: true; certificate: IssuedCertificate } | { participantId: string; success: false; error: { statusCode: number; message: string } }> = []
    for (const participantId of input.participantIds) {
      if (seen.has(participantId)) {
        results.push({ participantId, success: false, error: { statusCode: 409, message: 'Recipient appears more than once in this request' } })
        continue
      }
      seen.add(participantId)
      try {
        const certificate = await this.issueForRecipient(actor, event, { participantId, title: input.title, description: input.description }, storage)
        results.push({ participantId, success: true, certificate })
      } catch (error) {
        results.push({ participantId, success: false, error: toPublicIssueError(error) })
      }
    }
    return { results, issuedCount: results.filter((result) => result.success).length, failedCount: results.filter((result) => !result.success).length }
  }

  async listEventCertificates(actorId: string, eventId: string, input: EventCertificateListInput) {
    await this.assertEventAdmin(actorId, eventId)
    return this.repository.listEventCertificates(eventId, input)
  }

  async downloadPdf(userId: string, certificateId: string) {
    const access = await this.repository.findOwnedPdf(userId, certificateId)
    if (!access) throw new AppError(404, 'Certificate PDF not found')
    if (!this.storage) throw new AppError(503, 'Certificate file storage is not configured')
    try {
      const object = await this.storage.get(access.storageKey)
      if (Buffer.from(object.bytes).subarray(0, 5).toString() !== '%PDF-') throw new AppError(502, 'Stored certificate file is invalid')
      if (createHash('sha256').update(object.bytes).digest('hex') !== access.checksumSha256) throw new AppError(502, 'Stored certificate file failed integrity verification')
      return { bytes: object.bytes, contentType: 'application/pdf', certificateNumber: access.certificateNumber }
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError) throw new AppError(404, 'Certificate PDF not found')
      throw new AppError(502, 'Certificate file could not be retrieved')
    }
  }

  async verify(token: string): Promise<CertificatePublicResult> {
    const certificate = await this.repository.verify(token)
    if (!certificate) return { result: 'not_found', valid: false }
    const revoked = certificate.status === 'revoked'
    return {
      result: revoked ? 'revoked' : 'valid',
      valid: !revoked,
      certificate: {
        certificateNumber: certificate.certificateNumber,
        title: certificate.title,
        participantName: certificate.participantName,
        eventName: certificate.eventName,
        issuedAt: certificate.issuedAt?.toISOString() ?? null,
        revokedAt: certificate.revokedAt?.toISOString() ?? null,
      },
    }
  }

  async revoke(actorId: string, certificateId: string, reason: string) {
    const result = await this.repository.revoke(actorId, certificateId, reason, this.now())
    if (!result) throw new AppError(404, 'Certificate not found')
    return { ...result, revokedAt: result.revokedAt.toISOString() }
  }

  private async assertEventAdmin(actorId: string, eventId: string) {
    const event = await this.repository.findAdminEvent(actorId, eventId)
    if (!event) throw new AppError(404, 'Event not found')
    return event
  }

  private requireStorage(): CertificateStorage {
    if (!this.storage) throw new AppError(503, 'Certificate file storage is not configured')
    return this.storage
  }

  private async issueForRecipient(actor: { id: string; name: string }, event: { id: string; name: string }, input: CertificateIssueInput, storage: CertificateStorage): Promise<IssuedCertificate> {
    const recipient = await this.repository.findEligibleRecipient(event.id, input.participantId)
    if (!recipient) throw new AppError(422, 'Participant is not registered for this event')
    const verificationToken = randomBytes(32).toString('base64url')
    const certificateNumber = `HMI-${this.now().getUTCFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`
    const id = randomUUID()
    const verifyUrl = `${this.publicVerifyBaseUrl.replace(/\/$/, '')}/${verificationToken}`
    const storageKey = `certificate-pdfs/${event.id}/${id}.pdf`
    const draft = await this.repository.createDraft({
      id,
      certificateNumber,
      verificationToken,
      eventId: event.id,
      participantId: recipient.participantId,
      issuerId: actor.id,
      issuerName: actor.name,
      participantName: recipient.name,
      eventName: event.name,
      title: input.title,
      description: input.description ?? null,
    })
    let pdf: Uint8Array | undefined
    try {
      const issuedAt = this.now()
      pdf = await this.renderPdf({ certificateNumber, participantName: recipient.name, eventName: event.name, title: input.title, description: input.description ?? null, issuerName: actor.name, issuedAt, verificationUrl: verifyUrl })
      await storage.put(storageKey, pdf, 'application/pdf')
      return await this.repository.completeIssuance({ certificateId: draft.id, actorId: actor.id, storageKey, fileSizeBytes: pdf.byteLength, checksumSha256: createHash('sha256').update(pdf).digest('hex'), issuedAt, verificationUrl: verifyUrl })
    } catch (error) {
      let cleanupComplete = !pdf
      if (pdf) {
        try { await storage.delete(storageKey); cleanupComplete = true } catch {
          try {
            await this.repository.recordPendingCleanup({ certificateId: draft.id, actorId: actor.id, storageKey, fileSizeBytes: pdf.byteLength, checksumSha256: createHash('sha256').update(pdf).digest('hex') })
          } catch { /* keep the draft and log enough to alert operators */ }
          console.error(`Certificate storage cleanup remains pending for ${draft.id}`)
        }
      }
      if (cleanupComplete) {
        try { await this.repository.deleteDraft(draft.id) } catch { console.error(`Certificate draft cleanup failed for ${draft.id}`) }
      }
      if (error instanceof AppError) throw error
      throw new AppError(502, 'Certificate could not be generated or stored')
    }
  }
}

function toPublicIssueError(error: unknown) {
  if (error instanceof AppError) return { statusCode: error.statusCode as number, message: error.message }
  return { statusCode: 500, message: 'Certificate issuance failed' }
}
