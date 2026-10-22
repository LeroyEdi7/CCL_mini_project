import { pgTable, uuid, text, integer, timestamp, check, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
// ---------------------------------------------------------------------------
// participants
// Extends user accounts with profile attributes specific to certificate
// recipients. Kept separate from `users` so participant data can evolve
// independently without polluting core account identity.
// ---------------------------------------------------------------------------
export const participants = pgTable("participants", {
    id: uuid("id").primaryKey().defaultRandom(),
    // One-to-one: each user account maps to at most one participant profile.
    userId: uuid("user_id")
        .notNull()
        .unique()
        .references(() => users.id, { onDelete: "cascade" }),
    // Age is optional; when supplied it must be a sensible positive value.
    age: integer("age"),
    course: text("course"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // Application-layer age validation should also run; this is a safety net.
    check("participants_age_check", sql `${table.age} IS NULL OR (${table.age} >= 0 AND ${table.age} <= 150)`),
]);
