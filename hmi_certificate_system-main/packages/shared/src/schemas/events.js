import { z } from 'zod'
import { EVENT_STATUSES } from '../constants/events.js'

export const eventStatusSchema = z.enum(EVENT_STATUSES)

const dateTimeSchema = z.iso.datetime({ offset: true })
const eventFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  startDate: dateTimeSchema,
  endDate: dateTimeSchema.nullable().optional(),
  status: eventStatusSchema.optional(),
}

function validateDateRange(input, context) {
  if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Event end date must be on or after the start date' })
  }
}

export const createEventSchema = z.object(eventFields).strict().superRefine(validateDateRange)
export const updateEventSchema = z.object(eventFields).partial().strict()
  .refine((input) => Object.keys(input).length > 0, 'At least one event field must be provided')
  .superRefine(validateDateRange)
