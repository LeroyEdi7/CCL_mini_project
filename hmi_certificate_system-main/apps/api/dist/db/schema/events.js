import { pgTable, uuid, text, timestamp, pgEnum, check, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
// ---------------------------------------------------------------------------
// Enum: event status lifecycle
// ---------------------------------------------------------------------------
export const eventStatusEnum = pgEnum("event_status", [
    "draft",
    "published",
    "completed",
    "cancelled",
]);
// ---------------------------------------------------------------------------
// events
// An event (workshop, seminar, course, etc.) to which participants can be
// registered and for which certificates can be issued.
//
// `owner_id` references a single organiser user. The schema intentionally
// allows a future `event_organizers` junction table to be added without
// requiring changes here — just add the junction table and leave this FK as
// a canonical single-owner field for backward compatibility.
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: eventStatusEnum("status").notNull().default("draft"),
    // Nullable allows importing events whose owner may not yet exist locally,
    // but business logic must enforce ownership before publication.
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // Prevent end_date < start_date at the DB layer.
    // Application layer must also validate this before writing.
    check("events_end_date_check", sql `${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
]);
