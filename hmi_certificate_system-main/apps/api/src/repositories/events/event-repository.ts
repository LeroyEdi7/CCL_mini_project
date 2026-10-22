import type { Event, EventMemberRole } from '../../db/schema.js'

export type NewEventInput = Pick<Event, 'name' | 'description' | 'startDate' | 'endDate' | 'status'>
export type EventUpdateInput = Partial<NewEventInput>
export type AccessibleEvent = Event & { accessRole: EventMemberRole }

export interface EventRepository {
  createWithAdminMembership(creatorId: string, input: NewEventInput): Promise<AccessibleEvent>
  listAccessible(userId: string): Promise<AccessibleEvent[]>
  findAccessible(userId: string, eventId: string): Promise<AccessibleEvent | undefined>
  update(eventId: string, input: EventUpdateInput, now: Date): Promise<Event | undefined>
  archive(eventId: string, now: Date): Promise<Event | undefined>
}
