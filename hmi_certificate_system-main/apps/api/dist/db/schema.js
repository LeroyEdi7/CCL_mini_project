// ---------------------------------------------------------------------------
// schema.ts — Drizzle Kit entry-point shim
// drizzle.config.ts points here. This file simply re-exports the modular
// schema so Drizzle Kit discovers all tables from a single path while
// application code can import from the fine-grained "./schema/index.js".
// ---------------------------------------------------------------------------
export * from "./schema/index.js";
