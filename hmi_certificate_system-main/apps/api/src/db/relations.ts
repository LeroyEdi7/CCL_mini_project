import { relations } from "drizzle-orm";
import { users } from "./schema/users.js";
import { participants } from "./schema/participants.js";
import { events } from "./schema/events.js";
import { eventMemberships } from "./schema/event-memberships.js";
import { eventRegistrations } from "./schema/event-registrations.js";
import { certificateTemplates } from "./schema/certificate-templates.js";
import { certificates } from "./schema/certificates.js";
import { certificateAssets } from "./schema/certificate-assets.js";
import { auditLogs } from "./schema/audit-logs.js";

// ---------------------------------------------------------------------------
// Drizzle ORM query relations
// These declarations power the `db.query.*` relational API (joinWith, with)
// and are SEPARATE from the foreign-key constraints defined on the tables.
// They do NOT replace FK constraints as data-integrity mechanisms.
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  participant: one(participants, {
    fields: [users.id],
    references: [participants.userId],
  }),
  ownedEvents: many(events),
  eventMemberships: many(eventMemberships),
  ownedTemplates: many(certificateTemplates),
  issuedCertificates: many(certificates),
  auditActions: many(auditLogs),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  user: one(users, {
    fields: [participants.userId],
    references: [users.id],
  }),
  registrations: many(eventRegistrations),
  certificates: many(certificates),
}));

export const eventMembershipsRelations = relations(eventMemberships, ({ one }) => ({
  event: one(events, {
    fields: [eventMemberships.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventMemberships.userId],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  owner: one(users, {
    fields: [events.ownerId],
    references: [users.id],
  }),
  registrations: many(eventRegistrations),
  certificates: many(certificates),
  memberships: many(eventMemberships),
}));

export const eventRegistrationsRelations = relations(
  eventRegistrations,
  ({ one }) => ({
    event: one(events, {
      fields: [eventRegistrations.eventId],
      references: [events.id],
    }),
    participant: one(participants, {
      fields: [eventRegistrations.participantId],
      references: [participants.id],
    }),
  })
);

export const certificateTemplatesRelations = relations(
  certificateTemplates,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [certificateTemplates.ownerId],
      references: [users.id],
    }),
    certificates: many(certificates),
  })
);

export const certificatesRelations = relations(certificates, ({ one, many }) => ({
  participant: one(participants, {
    fields: [certificates.participantId],
    references: [participants.id],
  }),
  event: one(events, {
    fields: [certificates.eventId],
    references: [events.id],
  }),
  template: one(certificateTemplates, {
    fields: [certificates.templateId],
    references: [certificateTemplates.id],
  }),
  issuer: one(users, {
    fields: [certificates.issuerId],
    references: [users.id],
  }),
  assets: many(certificateAssets),
}));

export const certificateAssetsRelations = relations(
  certificateAssets,
  ({ one }) => ({
    certificate: one(certificates, {
      fields: [certificateAssets.certificateId],
      references: [certificates.id],
    }),
  })
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));
