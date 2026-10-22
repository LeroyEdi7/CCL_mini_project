# Backend Architecture Map (`apps/api`): HMI Certificate System

## Application Overview

The API is a Node.js/TypeScript Hono application. `src/index.ts` wires the
Drizzle repositories, local authentication, event/participant/certificate
services, and the S3-compatible storage adapter. `src/app.ts` creates the
testable Hono app and mounts common error handling and route modules.

## Implemented Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| HTTP app | `src/app.ts` | Hono composition, response/error handlers, route registration |
| Auth | `src/middleware/auth.ts`, `src/services/auth/` | Verified local session via HttpOnly cookie or native bearer mode; Cognito is not configured |
| Event API | `src/routes/events.ts`, `src/services/events/` | Event CRUD, membership-scoped admin authorization |
| Participant API | `src/routes/participants.ts`, `src/services/participants/` | Event discovery/registration, participant admin/attendance, owner certificate metadata |
| Certificate API | `src/routes/certificates.ts`, `src/services/certificates/` | Individual/bulk issue, event-admin listing/search, owner-only PDF stream, public verification, revocation |
| Persistence | `src/repositories/`, `src/db/` | Drizzle/PostgreSQL queries, transactions, audit and asset metadata |
| Storage | `src/services/certificates/certificate-storage.ts` | `CertificateStorage` interface and S3-compatible AWS SDK adapter |
| Migrations | `drizzle/` | Tracked schema changes; `0003_certificate_event_recipient_unique.sql` enforces one certificate per event participant |

## Certificate Endpoints

- `POST /api/events/:eventId/certificates` and `/bulk`: event admin, CSRF Origin checked for browser requests.
- `GET /api/events/:eventId/certificates`: event-admin scoped search and pagination.
- `GET /api/certificates/:certificateId/pdf`: authenticated certificate owner only; streams a checksum-verified PDF.
- `GET /api/verify/:token`: public and database-backed; returns minimal valid/revoked/not-found details.
- `PATCH /api/certificates/:certificateId/revoke`: event admin, CSRF checked, audit record written transactionally.

See `docs/architecture/api-contracts.md` for request/response envelopes and
`docs/agent-context/certificate-workflow.md` for the UI and storage lifecycle.

## Configuration and Tests

Runtime configuration is validated in `src/config/auth-config.ts`. Certificate
storage requires region and bucket; custom S3 endpoints use path-style addressing.
Neon credentials are read by the AWS SDK default credential provider chain.
`CERTIFICATE_PUBLIC_VERIFY_BASE_URL` defaults to `AUTH_WEB_ORIGIN/verify`.

Run unit/route tests with `pnpm --filter api test`; run the gated PostgreSQL
suite with `pnpm --filter api test:db` after configuring an isolated,
migrated `TEST_DATABASE_URL` and `TEST_DATABASE_ISOLATED=true`.
