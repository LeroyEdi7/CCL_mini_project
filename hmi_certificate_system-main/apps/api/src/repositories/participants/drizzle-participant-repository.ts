import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import type { Database } from '../../db/index.js'
import { certificates, eventMemberships, eventRegistrations, events, participants, users } from '../../db/schema.js'
import type { CertificateRecord, PageInput, ParticipantRepository } from './participant-repository.js'

const eventColumns = {
  id: events.id, name: events.name, description: events.description, startDate: events.startDate,
  endDate: events.endDate, status: events.status, ownerId: events.ownerId, createdAt: events.createdAt,
  updatedAt: events.updatedAt, archivedAt: events.archivedAt,
}

const certificateColumns = {
  id: certificates.id, certificateNumber: certificates.certificateNumber, participantId: certificates.participantId,
  eventId: certificates.eventId, eventName: certificates.eventNameSnapshot, title: certificates.title,
  description: certificates.description, status: certificates.status, issuedAt: certificates.issuedAt,
  revokedAt: certificates.revokedAt, createdAt: certificates.createdAt, updatedAt: certificates.updatedAt,
}

function offset(input: PageInput) { return (input.page - 1) * input.pageSize }
function searchCondition(search?: string) { return search ? ilike(events.name, `%${search}%`) : undefined }

export class DrizzleParticipantRepository implements ParticipantRepository {
  constructor(private readonly db: Database) {}

  async listDiscoverableEvents(userId: string, input: PageInput) {
    const visibility = or(eq(events.status, 'published'), sql`${eventMemberships.userId} IS NOT NULL`)
    const conditions = [isNull(events.archivedAt), visibility, searchCondition(input.search)].filter(Boolean)
    const where = and(...conditions)
    const [totalRow] = await this.db.select({ total: count() }).from(events)
      .leftJoin(eventMemberships, and(eq(eventMemberships.eventId, events.id), eq(eventMemberships.userId, userId)))
      .where(where)
    const rows = await this.db.select({ ...eventColumns, accessRole: eventMemberships.role }).from(events)
      .leftJoin(eventMemberships, and(eq(eventMemberships.eventId, events.id), eq(eventMemberships.userId, userId)))
      .where(where).orderBy(asc(events.startDate), asc(events.createdAt)).limit(input.pageSize).offset(offset(input))
    return { events: rows, total: totalRow.total }
  }

  async findEvent(eventId: string) {
    const [event] = await this.db.select(eventColumns).from(events).where(and(eq(events.id, eventId), isNull(events.archivedAt))).limit(1)
    return event
  }

  async listUserEvents(userId: string, input: PageInput) {
    const where = and(eq(participants.userId, userId), ne(eventRegistrations.status, 'cancelled'), isNull(events.archivedAt), searchCondition(input.search))
    const [totalRow] = await this.db.select({ total: count() }).from(eventRegistrations)
      .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id)).where(where)
    const rows = await this.db.select({ ...eventColumns, registrationId: eventRegistrations.id, registrationStatus: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt })
      .from(eventRegistrations).innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id)).where(where)
      .orderBy(desc(eventRegistrations.registeredAt)).limit(input.pageSize).offset(offset(input))
    return { events: rows, total: totalRow.total }
  }

  async findRegistration(userId: string, eventId: string) {
    const [row] = await this.db.select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
      .from(eventRegistrations).innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
      .where(and(eq(participants.userId, userId), eq(eventRegistrations.eventId, eventId))).limit(1)
    return row
  }

  async register(userId: string, eventId: string, now: Date) {
    return this.db.transaction(async (tx) => {
      const [event] = await tx.select({ id: events.id, status: events.status, startDate: events.startDate }).from(events)
        .where(and(eq(events.id, eventId), isNull(events.archivedAt))).limit(1)
      if (!event || event.status !== 'published' || event.startDate <= now) return { registration: undefined, created: false }
      let [participant] = await tx.insert(participants).values({ userId }).onConflictDoNothing({ target: participants.userId }).returning({ id: participants.id })
      if (!participant) [participant] = await tx.select({ id: participants.id }).from(participants).where(eq(participants.userId, userId)).limit(1)
      const [existing] = await tx.select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, participantId: eventRegistrations.participantId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
        .from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.participantId, participant.id))).limit(1)
      if (existing) {
        if (existing.status !== 'cancelled') return { registration: existing, created: false }
        const [reopened] = await tx.update(eventRegistrations).set({ status: 'registered', registeredAt: now, updatedAt: now })
          .where(and(eq(eventRegistrations.id, existing.id), eq(eventRegistrations.status, 'cancelled')))
          .returning({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
        if (reopened) return { registration: reopened, created: true }
        const [current] = await tx.select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
          .from(eventRegistrations).where(eq(eventRegistrations.id, existing.id)).limit(1)
        return { registration: current, created: false }
      }
      const [inserted] = await tx.insert(eventRegistrations).values({ eventId, participantId: participant.id, status: 'registered', registeredAt: now, updatedAt: now })
        .onConflictDoNothing({ target: [eventRegistrations.eventId, eventRegistrations.participantId] }).returning({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
      if (inserted) return { registration: inserted, created: true }
      const [current] = await tx.select({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
        .from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.participantId, participant.id))).limit(1)
      return { registration: current, created: false }
    })
  }

  async cancelRegistration(userId: string, eventId: string, now: Date) {
    const activeBeforeStart = sql`${eventRegistrations.id} IN (
      SELECT er.id FROM event_registrations er
      INNER JOIN participants p ON p.id = er.participant_id
      INNER JOIN events e ON e.id = er.event_id
      WHERE p.user_id = ${userId} AND er.event_id = ${eventId}
        AND er.status = 'registered' AND e.start_date > ${now} AND e.archived_at IS NULL
    )`
    const [row] = await this.db.update(eventRegistrations).set({ status: 'cancelled', updatedAt: now })
      .where(and(eq(eventRegistrations.eventId, eventId), activeBeforeStart))
      .returning({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
    return row
  }

  async isEventAdmin(userId: string, eventId: string) {
    const [row] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .innerJoin(events, eq(events.id, eventMemberships.eventId))
      .where(and(eq(eventMemberships.userId, userId), eq(eventMemberships.eventId, eventId), eq(eventMemberships.role, 'admin'), isNull(events.archivedAt))).limit(1)
    return Boolean(row)
  }

  async isEventMember(userId: string, eventId: string) {
    const [row] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .innerJoin(events, eq(events.id, eventMemberships.eventId))
      .where(and(eq(eventMemberships.userId, userId), eq(eventMemberships.eventId, eventId), isNull(events.archivedAt))).limit(1)
    return Boolean(row)
  }

  async listEventParticipants(eventId: string, input: PageInput) {
    const where = and(eq(eventRegistrations.eventId, eventId), input.status ? eq(eventRegistrations.status, input.status as 'registered' | 'attended' | 'absent' | 'cancelled') : undefined, input.search ? ilike(users.name, `%${input.search}%`) : undefined)
    const [totalRow] = await this.db.select({ total: count() }).from(eventRegistrations).innerJoin(participants, eq(eventRegistrations.participantId, participants.id)).innerJoin(users, eq(participants.userId, users.id)).where(where)
    const rows = await this.db.select({ participantId: participants.id, userId: users.id, name: users.name, email: users.email, registrationId: eventRegistrations.id, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt })
      .from(eventRegistrations).innerJoin(participants, eq(eventRegistrations.participantId, participants.id)).innerJoin(users, eq(participants.userId, users.id))
      .where(where).orderBy(asc(users.name)).limit(input.pageSize).offset(offset(input))
    return { participants: rows, total: totalRow.total }
  }

  async updateRegistrationStatus(eventId: string, participantId: string, status: 'registered' | 'attended' | 'absent', now: Date) {
    const [row] = await this.db.update(eventRegistrations).set({ status, updatedAt: now })
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.participantId, participantId)))
      .returning({ id: eventRegistrations.id, eventId: eventRegistrations.eventId, participantId: eventRegistrations.participantId, status: eventRegistrations.status, registeredAt: eventRegistrations.registeredAt, updatedAt: eventRegistrations.updatedAt })
    return row
  }

  async listUserCertificates(userId: string, input: PageInput) {
    const where = and(
      eq(participants.userId, userId),
      input.eventId ? eq(certificates.eventId, input.eventId) : undefined,
      input.status ? eq(certificates.status, input.status as 'draft' | 'issued' | 'revoked') : undefined,
      input.search ? or(ilike(certificates.certificateNumber, `%${input.search}%`), ilike(certificates.title, `%${input.search}%`), ilike(certificates.eventNameSnapshot, `%${input.search}%`)) : undefined,
    )
    const [totalRow] = await this.db.select({ total: count() }).from(certificates).innerJoin(participants, eq(certificates.participantId, participants.id)).where(where)
    const rows = await this.db.select(certificateColumns).from(certificates).innerJoin(participants, eq(certificates.participantId, participants.id)).where(where)
      .orderBy(desc(certificates.issuedAt), desc(certificates.createdAt)).limit(input.pageSize).offset(offset(input))
    return { certificates: rows as CertificateRecord[], total: totalRow.total }
  }

  async findOwnedCertificate(userId: string, certificateId: string) {
    const [row] = await this.db.select(certificateColumns).from(certificates).innerJoin(participants, eq(certificates.participantId, participants.id))
      .where(and(eq(participants.userId, userId), eq(certificates.id, certificateId))).limit(1)
    return row as CertificateRecord | undefined
  }

}
