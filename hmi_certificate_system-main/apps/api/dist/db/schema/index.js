// ---------------------------------------------------------------------------
// Schema barrel export
// All table definitions and enum helpers are re-exported from here so that:
//   1. drizzle.config.ts can point to a single schema entry-point.
//   2. Application code can import from "@/db/schema" without knowing the
//      internal file layout.
// ---------------------------------------------------------------------------
export * from "./users.js";
export * from "./participants.js";
export * from "./events.js";
export * from "./event-registrations.js";
export * from "./certificate-templates.js";
export * from "./certificates.js";
export * from "./certificate-assets.js";
export * from "./audit-logs.js";
