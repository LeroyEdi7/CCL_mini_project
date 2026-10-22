import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ---------------------------------------------------------------------------
// audit_logs
// Append-only record of sensitive operations (certificate issuance /
// revocation, event ownership changes, permission mutations, etc.).
//
// Design choices:
//   - actor_user_id is nullable to support system-initiated actions.
//   - entity_type + entity_id allow the log to reference any table without
//     a FK (which would block deletions in referenced tables).
//   - metadata is unstructured JSONB to accommodate different action shapes
//     without schema changes.
//   - No UPDATE or DELETE operations should ever target this table.
//     Application-layer access control must enforce this.
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable — NULL indicates a system or background job actor.
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    // UUID stored as text to reference any table without a hard FK.
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Primary access pattern: "give me all audit events for entity X in time order."
    index("audit_logs_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt
    ),
  ]
);

// ---------------------------------------------------------------------------
// TypeScript type helpers
// ---------------------------------------------------------------------------

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
