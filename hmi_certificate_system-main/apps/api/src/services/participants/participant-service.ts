import { AppError } from '../../errors/app-error.js'
import type { PageInput, ParticipantRepository } from '../../repositories/participants/participant-repository.js'

export class ParticipantService {
  constructor(private readonly repository: ParticipantRepository, private readonly now: () => Date = () => new Date()) {}

  async listDiscoverableEvents(userId: string, input: PageInput) {
    const result = await this.repository.listDiscoverableEvents(userId, input)
    return { ...result, events: result.events.map(({ accessRole, ...event }) => ({ ...event, accessRole, registrationEligible: event.status === 'published' && event.startDate > this.now() })) }
  }

  async getEventDetails(userId: string, eventId: string) {
    const event = await this.repository.findEvent(eventId)
    if (!event) throw new AppError(404, 'Event not found')
    const isAdmin = await this.repository.isEventAdmin(userId, eventId)
    const isMember = isAdmin || await this.repository.isEventMember(userId, eventId)
    if (event.status !== 'published' && !isMember) throw new AppError(404, 'Event not found')
    const registration = await this.repository.findRegistration(userId, eventId)
    return { event, accessRole: isAdmin ? 'admin' as const : isMember ? 'member' as const : null, registrationEligible: event.status === 'published' && event.startDate > this.now(), registrationStatus: registration?.status ?? null }
  }

  listMyEvents(userId: string, input: PageInput) { return this.repository.listUserEvents(userId, input) }

  async registrationStatus(userId: string, eventId: string) {
    const event = await this.repository.findEvent(eventId)
    if (!event) throw new AppError(404, 'Event not found')
    return { eventId, registration: await this.repository.findRegistration(userId, eventId) ?? null }
  }

  async register(userId: string, eventId: string) {
    const event = await this.repository.findEvent(eventId)
    if (!event) throw new AppError(404, 'Event not found')
    if (event.status !== 'published' || event.startDate <= this.now()) throw new AppError(422, 'This event is not open for registration')
    const result = await this.repository.register(userId, eventId, this.now())
    if (!result.registration) throw new AppError(422, 'This event is not open for registration')
    if (!result.created) throw new AppError(409, 'You are already registered for this event')
    return result.registration
  }

  async cancel(userId: string, eventId: string) {
    const event = await this.repository.findEvent(eventId)
    if (!event) throw new AppError(404, 'Event not found')
    if (event.startDate <= this.now()) throw new AppError(422, 'Registration can no longer be cancelled')
    const registration = await this.repository.cancelRegistration(userId, eventId, this.now())
    if (!registration) throw new AppError(404, 'Active registration not found')
    return registration
  }

  async listEventParticipants(userId: string, eventId: string, input: PageInput) {
    if (!(await this.repository.isEventAdmin(userId, eventId))) throw new AppError(404, 'Event not found')
    return this.repository.listEventParticipants(eventId, input)
  }

  async updateParticipantStatus(userId: string, eventId: string, participantId: string, status: 'registered' | 'attended' | 'absent') {
    if (!(await this.repository.isEventAdmin(userId, eventId))) throw new AppError(404, 'Event not found')
    const registration = await this.repository.updateRegistrationStatus(eventId, participantId, status, this.now())
    if (!registration) throw new AppError(404, 'Registration not found')
    return registration
  }

  listMyCertificates(userId: string, input: PageInput) { return this.repository.listUserCertificates(userId, input) }

  async getMyCertificate(userId: string, certificateId: string) {
    const certificate = await this.repository.findOwnedCertificate(userId, certificateId)
    if (!certificate) throw new AppError(404, 'Certificate not found')
    return certificate
  }

}
