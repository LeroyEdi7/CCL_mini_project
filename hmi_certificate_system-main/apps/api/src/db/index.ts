import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

// ---------------------------------------------------------------------------
// Database connection
// Uses a pg connection pool for efficient connection reuse in the Node.js
// server process. The DATABASE_URL is loaded from the .env file via dotenv.
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon Serverless PostgreSQL requires SSL.
  ssl: { rejectUnauthorized: false },
});

// Merge schema tables and relations into the Drizzle instance so the
// `db.query.*` relational API is fully available throughout the application.
export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
});

export type Database = typeof db;
