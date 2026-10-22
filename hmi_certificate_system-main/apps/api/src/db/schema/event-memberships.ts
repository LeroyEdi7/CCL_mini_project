import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { events } from "./events.js";
import { users } from "./users.js";
import { EVENT_MEMBER_ROLES } from "@hmi/shared";

export const eventMemberRoleEnum = pgEnum("event_member_role", [...EVENT_MEMBER_ROLES]);

export const eventMemberships = pgTable("event_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: eventMemberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("event_memberships_event_user_uidx").on(table.eventId, table.userId),
  index("event_memberships_user_id_idx").on(table.userId),
  index("event_memberships_event_id_idx").on(table.eventId),
]);

export type EventMemberRole = (typeof eventMemberRoleEnum.enumValues)[number];
export type EventMembership = typeof eventMemberships.$inferSelect;
export type NewEventMembership = typeof eventMemberships.$inferInsert;
