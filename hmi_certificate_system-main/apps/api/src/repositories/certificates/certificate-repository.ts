export type AdminEvent = { id: string; name: string }
export type CertificateRecipient = { participantId: string; userId: string; name: string; registrationStatus: string }
export type CertificateDraftInput = {
  id: string; certificateNumber: string; verificationToken: string; eventId: string; participantId: string
  issuerId: string; issuerName: string; participantName: string; eventName: string; title: string; description: string | null
}
export type IssuedCertificate = { id: string; certificateNumber: string; eventId: string; participantId: string; title: string; status: 'issued'; issuedAt: Date; verificationUrl: string }
export type CertificatePdfAccess = { ownerUserId: string; certificateNumber: string; status: string; storageKey: string; mimeType: string; checksumSha256: string }
export type EventCertificateRecord = { id: string; certificateNumber: string; participantId: string; participantName: string; title: string; status: 'draft' | 'issued' | 'revoked'; issuedAt: Date | null; revokedAt: Date | null; createdAt: Date }
export type EventCertificateListInput = { page: number; pageSize: number; search?: string; status?: 'draft' | 'issued' | 'revoked' }
export type VerificationResult = { status: 'valid' | 'revoked'; certificateNumber: string; title: string; participantName: string; eventName: string; issuedAt: Date | null; revokedAt: Date | null }
export type RevocationResult = { id: string; certificateNumber: string; status: 'revoked'; revokedAt: Date; alreadyRevoked: boolean }

export interface CertificateRepository {
  findAdminEvent(actorId: string, eventId: string): Promise<AdminEvent | undefined>
  findEligibleRecipient(eventId: string, participantId: string): Promise<CertificateRecipient | undefined>
  createDraft(input: CertificateDraftInput): Promise<{ id: string }>
  completeIssuance(input: { certificateId: string; actorId: string; storageKey: string; fileSizeBytes: number; checksumSha256: string; issuedAt: Date; verificationUrl: string }): Promise<IssuedCertificate>
  recordPendingCleanup(input: { certificateId: string; actorId: string; storageKey: string; fileSizeBytes: number; checksumSha256: string }): Promise<void>
  deleteDraft(certificateId: string): Promise<void>
  findOwnedPdf(userId: string, certificateId: string): Promise<CertificatePdfAccess | undefined>
  listEventCertificates(eventId: string, input: EventCertificateListInput): Promise<{ certificates: EventCertificateRecord[]; total: number }>
  revoke(actorId: string, certificateId: string, reason: string, now: Date): Promise<RevocationResult | undefined>
  verify(token: string): Promise<VerificationResult | undefined>
}
