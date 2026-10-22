import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { certificates } from "./certificates.js";

// ---------------------------------------------------------------------------
// Enum: stored asset type
// ---------------------------------------------------------------------------

export const assetTypeEnum = pgEnum("asset_type", ["pdf", "preview_image"]);

// ---------------------------------------------------------------------------
// certificate_assets
// Stores object-storage references (keys / paths) for generated PDFs and
// preview images. Binary content is never stored in PostgreSQL.
//
// onDelete RESTRICT: prevents deleting a certificate while its generated
// files still exist in object storage — the storage layer must be cleaned
// up first via the application.
// ---------------------------------------------------------------------------

export const certificateAssets = pgTable(
  "certificate_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificateId: uuid("certificate_id")
      .notNull()
      .references(() => certificates.id, { onDelete: "restrict" }),
    type: assetTypeEnum("type").notNull(),
    // Object storage key / path (e.g. S3 key, GCS object name).
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    // Must be a positive byte count.
    fileSizeBytes: integer("file_size_bytes").notNull(),
    // SHA-256 hex digest for integrity verification.
    checksumSha256: text("checksum_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "certificate_assets_file_size_check",
      sql`${table.fileSizeBytes} > 0`
    ),
  ]
);

// ---------------------------------------------------------------------------
// TypeScript type helpers
// ---------------------------------------------------------------------------

export type CertificateAsset = typeof certificateAssets.$inferSelect;
export type NewCertificateAsset = typeof certificateAssets.$inferInsert;
export type AssetType = (typeof assetTypeEnum.enumValues)[number];
