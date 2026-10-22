import { pgTable, uuid, text, timestamp, } from "drizzle-orm/pg-core";
// ---------------------------------------------------------------------------
// users
// Stores application account identity. Authentication fields (password_hash,
// auth_provider) are optional so the table supports both local credentials
// and external OAuth providers without schema duplication.
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    // Nullable when an external auth provider (e.g. OAuth) is used exclusively.
    passwordHash: text("password_hash"),
    // Provider identifier ("google", "github", etc.) for external auth.
    authProvider: text("auth_provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
