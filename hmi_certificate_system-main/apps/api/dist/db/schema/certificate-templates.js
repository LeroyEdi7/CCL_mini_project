import { pgTable, uuid, text, jsonb, boolean, integer, timestamp, pgEnum, } from "drizzle-orm/pg-core";
import { users } from "./users.js";
// ---------------------------------------------------------------------------
// Enums: page size and orientation
// ---------------------------------------------------------------------------
export const pageSizeEnum = pgEnum("page_size", ["A4", "Letter"]);
export const orientationEnum = pgEnum("orientation", ["landscape", "portrait"]);
// ---------------------------------------------------------------------------
// certificate_templates
// Stores reusable visual layouts for certificate generation. The
// `layout_config` JSONB column holds flexible, renderer-specific
// configuration (field positions, fonts, colours). Its internal structure
// must be validated at the application layer against a Zod schema before
// being written.
// ---------------------------------------------------------------------------
export const certificateTemplates = pgTable("certificate_templates", {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    backgroundUrl: text("background_url"),
    // JSONB: renderer configuration (field positions, fonts, logo refs, etc.)
    // Must be validated by application-layer Zod schema before writing.
    layoutConfig: jsonb("layout_config").notNull(),
    pageSize: pageSizeEnum("page_size").notNull().default("A4"),
    orientation: orientationEnum("orientation").notNull().default("landscape"),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
