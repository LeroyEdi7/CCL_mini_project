import { AppError } from '../../errors/app-error.js'
import type { EventUpdateInput, NewEventInput, EventRepository } from '../../repositories/events/event-repository.js'

export class EventService {
  constructor(private readonly repository: EventRepository, private readonly now: () => Date = () => new Date()) {}

  async create(userId: string, input: NewEventInput) {
    this.validateDateRange(input.startDate, input.endDate)
    return this.repository.createWithAdminMembership(userId, input)
  }

  listAccessible(userId: string) {
    return this.repository.listAccessible(userId)
  }

  async getAccessible(userId: string, eventId: string) {
    const event = await this.repository.findAccessible(userId, eventId)
    if (!event) throw new AppError(404, 'Event not found')
    return event
  }

  async updateAsAdmin(userId: string, eventId: string, input: EventUpdateInput) {
    const current = await this.getAccessible(userId, eventId)
    if (current.accessRole !== 'admin') throw new AppError(403, 'Event admin access is required')

    const startDate = input.startDate ?? current.startDate
    const endDate = input.endDate === undefined ? current.endDate : input.endDate
    this.validateDateRange(startDate, endDate)

    const updated = await this.repository.update(eventId, input, this.now())
    if (!updated) throw new AppError(404, 'Event not found')
    return updated
  }

  async archiveAsAdmin(userId: string, eventId: string) {
    const current = await this.getAccessible(userId, eventId)
    if (current.accessRole !== 'admin') throw new AppError(403, 'Event admin access is required')

    const archived = await this.repository.archive(eventId, this.now())
    if (!archived) throw new AppError(404, 'Event not found')
    return archived
  }

  private validateDateRange(startDate: Date, endDate: Date | null) {
    if (!Number.isFinite(startDate.getTime()) || (endDate && !Number.isFinite(endDate.getTime()))) {
      throw new AppError(400, 'Event dates must be valid')
    }
    if (endDate && endDate < startDate) throw new AppError(400, 'Event end date must be on or after the start date')
  }
}
