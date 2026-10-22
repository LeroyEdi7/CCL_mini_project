import { pgTable, uuid, timestamp, pgEnum, uniqueIndex, index, } from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { participants } from "./participants.js";
// ---------------------------------------------------------------------------
// Enum: registration status
// ---------------------------------------------------------------------------
export const registrationStatusEnum = pgEnum("registration_status", [
    "registered",
    "attended",
    "absent",
    "cancelled",
]);
// ---------------------------------------------------------------------------
// event_registrations
// Junction table linking a participant to an event. The unique index on
// (event_id, participant_id) enforces the "no duplicate registrations" rule
// at the database level.
// ---------------------------------------------------------------------------
export const eventRegistrations = pgTable("event_registrations", {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
        .notNull()
        .references(() => events.id, { onDelete: "restrict" }),
    participantId: uuid("participant_id")
        .notNull()
        .references(() => participants.id, { onDelete: "restrict" }),
    status: registrationStatusEnum("status").notNull().default("registered"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // Prevents a participant from registering more than once per event.
    uniqueIndex("event_registrations_event_participant_uidx").on(table.eventId, table.participantId),
    // Support fast look-ups by event.
    index("event_registrations_event_id_idx").on(table.eventId),
    // Support fast look-ups by participant.
    index("event_registrations_participant_id_idx").on(table.participantId),
]);
