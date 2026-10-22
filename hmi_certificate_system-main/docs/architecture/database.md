# Database Architecture & Schema Status: HMI Certificate System

## 1. Current Implementation State

> [!NOTE]
> **Domain and authentication schemas implemented.** Apply migrations in order. Event ownership is represented by event-scoped memberships; deletion is archival to preserve history.

### Verified Database Configuration

- **ORM**: Drizzle ORM (`drizzle-orm@^0.45.4`) with Drizzle Kit (`drizzle-kit@^0.31.11`).
- **Database Engine**: PostgreSQL via `pg` (`pg@^8.23.1`).
- **Provider**: Neon Serverless PostgreSQL (connection endpoint in `apps/api/.env`).
- **Configuration File**: `apps/api/drizzle.config.ts` — `verbose: true`, `strict: true`.
- **Schema Entry-Point**: `apps/api/src/db/schema.ts` (shim re-exporting `src/db/schema/index.ts`).
- **DB Connection Module**: `apps/api/src/db/index.ts` — pg Pool + Drizzle instance with schema and relations.

### File Locations

| File / Directory | Purpose | Status |
| :--- | :--- | :--- |
| `apps/api/src/db/schema.ts` | Drizzle Kit entry-point shim | **Implemented** |
| `apps/api/src/db/schema/` | Modular per-table schema files | **Implemented** |
| `apps/api/src/db/relations.ts` | Drizzle ORM query relations | **Implemented** |
| `apps/api/src/db/index.ts` | pg Pool + Drizzle db singleton | **Implemented** |
| `apps/api/drizzle/` | Generated SQL migration files | **Implemented** |
| `apps/api/drizzle.config.ts` | Drizzle Kit CLI configuration | **Implemented** |
| `apps/api/.env` | Environment configuration (`DATABASE_URL`) | **Implemented** |

---

## 2. Implemented Tables & Schema

### Tables

| Table | PK | Notable Constraints | Indexes |
| :--- | :--- | :--- | :--- |
| `users` | uuid | `email` UNIQUE | — |
| `user_credentials` | uuid | one row per user, Argon2id password hash | user_id UNIQUE |
| `auth_sessions` | uuid | hashed session token, expiry, revocation | token_hash UNIQUE, user_id |
| `email_verification_tokens` | uuid | hashed, expiring, consumable token | token_hash UNIQUE, user_id |
| `password_reset_tokens` | uuid | hashed, expiring, consumable token | token_hash UNIQUE, user_id |
| `external_identities` | uuid | provider subject mapped to stable app user | (provider, subject) UNIQUE |
| `participants` | uuid | `user_id` UNIQUE, age CHECK (0–150) | — |
| `events` | uuid | owner_id FK; end_date >= start_date CHECK; nullable archived_at | archived_at |
| `event_memberships` | uuid | UNIQUE(event_id, user_id); role is `admin` or `member` | event_id, user_id |
| `event_registrations` | uuid | UNIQUE(event_id, participant_id) | event_id, participant_id (+ unique) |
| `certificate_templates` | uuid | layout_config JSONB NOT NULL | — |
| `certificates` | uuid | certificate_number UNIQUE, verification_token UNIQUE | (event_id, status), (participant_id, issued_at) |
| `certificate_assets` | uuid | file_size_bytes > 0 CHECK | — |
| `audit_logs` | uuid | entity_id typed uuid | (entity_type, entity_id, created_at) |

### PostgreSQL Enums

| Enum | Values |
| :--- | :--- |
| `event_status` | `draft`, `published`, `completed`, `cancelled` |
| `registration_status` | `registered`, `attended`, `absent`, `cancelled` |
| `certificate_status` | `draft`, `issued`, `revoked` |
| `page_size` | `A4`, `Letter` |
| `orientation` | `landscape`, `portrait` |
| `asset_type` | `pdf`, `preview_image` |

### Foreign Key `ON DELETE` Policy

| FK | Policy | Rationale |
| :--- | :--- | :--- |
| `participants.user_id → users.id` | CASCADE | Participant profile follows account deletion |
| `events.owner_id → users.id` | RESTRICT | Prevent orphaned events |
| `event_memberships.event_id/user_id` | CASCADE | Membership belongs to an event and stable application user UUID |
| `event_registrations.event_id/participant_id` | RESTRICT | Preserve registration history |
| `certificate_templates.owner_id → users.id` | RESTRICT | Templates belong to an owner |
| `certificates.participant_id / event_id / issuer_id` | RESTRICT | Preserve issued certificate history |
| `certificates.template_id` | SET NULL | Templates can be retired without invalidating certificates |
| `certificate_assets.certificate_id` | RESTRICT | Clean storage before deleting certificate |
| `audit_logs.actor_user_id` | SET NULL | Preserve audit trail even if actor account is removed |

---

## 3. Migration

- **Initial schema**: `apps/api/drizzle/0000_curved_tyger_tiger.sql`.
- **Authentication**: `apps/api/drizzle/0001_magical_steve_rogers.sql` creates auth tables and drops legacy `users.password_hash` and `users.auth_provider` columns. The data-free legacy table is intentionally modified.
- **Event management**: `apps/api/drizzle/0002_nasty_anthem.sql` adds `events.archived_at` and event-scoped memberships, then backfills each existing event owner as its admin. Event create plus initial membership is transactional. DELETE archives; it does not delete registration or certificate rows.
- **Participant API**: Current participant routes reuse `participants`, `event_registrations`, `event_memberships`, `certificates`, and `certificate_assets`; no schema change or migration is needed. Registration uses the existing unique `(event_id, participant_id)` constraint to handle concurrent requests.
- **Certificate issuance**: `apps/api/drizzle/0003_certificate_event_recipient_unique.sql` adds a unique index on `(event_id, participant_id)` so concurrent issuance cannot create duplicate certificates. A preflight raises an error if existing duplicate records need review; it does not delete or rewrite data. Certificate file metadata remains in the existing `certificate_assets` table.
- **Configured development target (2026-10-20)**: A read-only check identified the configured `DATABASE_URL` as Neon in `NODE_ENV=development`. It found zero duplicate `(event_id, participant_id)` groups and confirmed migration `0003` is applied. The database name did not identify an isolated test database, and no `TEST_DATABASE_URL` was configured. No migration or test fixture was written to this target.
- **Database integration tests**: Set `TEST_DATABASE_URL` to a disposable migrated database and `TEST_DATABASE_ISOLATED=true` only after confirming it is isolated. The suite refuses to run against the same host/database path as `DATABASE_URL`; it creates random fixture identities and removes only records created by the suite.
- **Apply locally**: set `DATABASE_URL` in `apps/api/.env` and run `pnpm --filter api db:migrate` from the repository root.

### Commands

```bash
# Apply migrations to the configured database
pnpm --filter api db:migrate
```

For an isolated database integration target, set `TEST_DATABASE_URL`, verify
that it is disposable, then apply migrations from `apps/api` with `DATABASE_URL`
pointing to that test target before running `pnpm test:db`.

> [!WARNING]
> Do NOT run `drizzle-kit migrate` against production without explicit environment confirmation, a backup, and review of the generated SQL. Database tests must use the isolated test URL only.

---

## 4. Application-Layer Validation Required

The following invariants cannot be fully enforced at the DB layer alone:

| Rule | Where to enforce |
| :--- | :--- |
| `certificate_status` state machine (draft→issued→revoked only) | Service layer before DB write |
| `layout_config` JSONB structure | Zod schema validation in API route handler |
| Duplicate certificate issuance (same participant + event) | Service checks plus unique database index |
| Age sensibility beyond 0–150 range | Zod schema + form validation |
| `issued_at` must be set when status transitions to `issued` | Service layer |
| `revoked_at` + `revoked_reason` required on revocation | Service layer |
