import { pgTable, uuid, text, timestamp, pgEnum, index, } from "drizzle-orm/pg-core";
import { participants } from "./participants.js";
import { events } from "./events.js";
import { certificateTemplates } from "./certificate-templates.js";
import { users } from "./users.js";
// ---------------------------------------------------------------------------
// Enum: certificate status lifecycle
// draft  → issued  → revoked
// Transitions must be enforced in backend service layer; the DB stores
// the current state only. No separate accepted/revoked boolean flags.
// ---------------------------------------------------------------------------
export const certificateStatusEnum = pgEnum("certificate_status", [
    "draft",
    "issued",
    "revoked",
]);
// ---------------------------------------------------------------------------
// certificates
// Core entity representing an issued credential. Name snapshots preserve
// the printed text as-of issuance time, preventing profile/event edits
// from silently altering historical records.
//
// onDelete behaviour:
//   - participants / events / users (issuer): RESTRICT — prevents deleting
//     an entity that owns issued certificates. Historical records must be
//     preserved; deletion should be blocked at the application layer first.
//   - certificate_templates: SET NULL — a template can be retired without
//     invalidating the certificates already generated from it.
// ---------------------------------------------------------------------------
export const certificates = pgTable("certificates", {
    id: uuid("id").primaryKey().defaultRandom(),
    // Human-readable unique identifier printed on the certificate.
    certificateNumber: text("certificate_number").notNull().unique(),
    participantId: uuid("participant_id")
        .notNull()
        .references(() => participants.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
        .notNull()
        .references(() => events.id, { onDelete: "restrict" }),
    // Nullable — a certificate may be generated without a saved template.
    templateId: uuid("template_id").references(() => certificateTemplates.id, {
        onDelete: "set null",
    }),
    issuerId: uuid("issuer_id")
        .notNull()
        .references(() => users.id, { onDelete: "restrict" }),
    // Snapshots — immutable after issuance.
    issuerNameSnapshot: text("issuer_name_snapshot").notNull(),
    participantNameSnapshot: text("participant_name_snapshot").notNull(),
    eventNameSnapshot: text("event_name_snapshot").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // Cryptographically random token for public verification URLs.
    verificationToken: text("verification_token").notNull().unique(),
    status: certificateStatusEnum("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Plain text reason stored for audit; never deleted.
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // Query: all certificates for an event filtered by status.
    index("certificates_event_status_idx").on(table.eventId, table.status),
    // Query: a participant's issuance timeline.
    index("certificates_participant_issued_at_idx").on(table.participantId, table.issuedAt),
]);
