export type PageInput = { page: number; pageSize: number; search?: string; status?: string; eventId?: string }

export type EventRecord = {
  id: string; name: string; description: string | null; startDate: Date; endDate: Date | null
  status: 'draft' | 'published' | 'completed' | 'cancelled'; ownerId: string; createdAt: Date; updatedAt: Date; archivedAt: Date | null
}

export interface ParticipantRepository {
  listDiscoverableEvents(userId: string, input: PageInput): Promise<{ events: Array<EventRecord & { accessRole: 'admin' | 'member' | null }>; total: number }>
  findEvent(eventId: string): Promise<EventRecord | undefined>
  listUserEvents(userId: string, input: PageInput): Promise<{ events: Array<EventRecord & { registrationId: string; registrationStatus: string; registeredAt: Date }>; total: number }>
  findRegistration(userId: string, eventId: string): Promise<{ id: string; eventId: string; status: string; registeredAt: Date; updatedAt: Date } | undefined>
  register(userId: string, eventId: string, now: Date): Promise<{ registration: { id: string; eventId: string; status: string; registeredAt: Date; updatedAt: Date } | undefined; created: boolean }>
  cancelRegistration(userId: string, eventId: string, now: Date): Promise<{ id: string; eventId: string; status: string; registeredAt: Date; updatedAt: Date } | undefined>
  isEventMember(userId: string, eventId: string): Promise<boolean>
  isEventAdmin(userId: string, eventId: string): Promise<boolean>
  listEventParticipants(eventId: string, input: PageInput): Promise<{ participants: Array<{ participantId: string; userId: string; name: string; email: string; registrationId: string; status: string; registeredAt: Date }>; total: number }>
  updateRegistrationStatus(eventId: string, participantId: string, status: 'registered' | 'attended' | 'absent', now: Date): Promise<{ id: string; eventId: string; participantId: string; status: string; registeredAt: Date; updatedAt: Date } | undefined>
  listUserCertificates(userId: string, input: PageInput): Promise<{ certificates: CertificateRecord[]; total: number }>
  findOwnedCertificate(userId: string, certificateId: string): Promise<CertificateRecord | undefined>
}

export type CertificateRecord = {
  id: string; certificateNumber: string; participantId: string; eventId: string; eventName: string
  title: string; description: string | null; status: 'draft' | 'issued' | 'revoked'; issuedAt: Date | null
  revokedAt: Date | null; createdAt: Date; updatedAt: Date
}
