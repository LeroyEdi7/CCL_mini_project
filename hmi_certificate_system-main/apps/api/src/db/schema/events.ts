import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { EVENT_STATUSES } from "@hmi/shared";

// ---------------------------------------------------------------------------
// Enum: event status lifecycle
// ---------------------------------------------------------------------------

export const eventStatusEnum = pgEnum("event_status", [...EVENT_STATUSES]);

// ---------------------------------------------------------------------------
// events
// An event (workshop, seminar, course, etc.) to which participants can be
// registered and for which certificates can be issued.
//
// `owner_id` records the creator for compatibility; authorization is based on
// the event-scoped `event_memberships` relation.
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: eventStatusEnum("status").notNull().default("draft"),
    // The creator is retained as a stable application user reference.
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    // Prevent end_date < start_date at the DB layer.
    // Application layer must also validate this before writing.
    check(
      "events_end_date_check",
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`
    ),
    index("events_archived_at_idx").on(table.archivedAt),
  ]
);

// ---------------------------------------------------------------------------
// TypeScript type helpers
// ---------------------------------------------------------------------------

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
