# API Contracts & Endpoint Specification: HMI Certificate System

## 1. Implemented Endpoints

The Hono API exposes a health endpoint and local authentication endpoints.

### `GET /`

- **Purpose**: Basic connectivity check.
- **Authentication**: None.
- **Response**: `200 OK`, `application/json`:

```json
{
  "success": true,
  "data": { "message": "Hello Hono!" }
}
```

### Authentication (`/api/auth`)

All request bodies are JSON. Registration requires `{ "name", "email", "password" }`; verification accepts `{ "token" }`; login accepts `{ "email", "password" }`; forgot-password accepts `{ "email" }`; reset accepts `{ "token", "password" }`. Passwords must be 12–128 characters. Registration and recovery return `202` with generic text to limit account enumeration. Accounts must verify their email before sign-in. `GET /me` requires a web session cookie; native clients can send `X-Auth-Client: native` with `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register and request email verification |
| `POST` | `/api/auth/verify-email` | Consume a one-time verification token |
| `POST` | `/api/auth/login` | Create a server-managed session |
| `POST` | `/api/auth/logout` | Revoke the active session |
| `GET` | `/api/auth/me` | Restore the current user |
| `POST` | `/api/auth/forgot-password` | Request a password reset |
| `POST` | `/api/auth/reset-password` | Consume reset token and replace password |

Successful authenticated responses expose only `id`, `name`, `email`, and `emailVerifiedAt`; credentials and token hashes are never returned. Browser mutations require a matching `Origin` header and use `HttpOnly; SameSite=Lax` cookies. Native login returns an access token for platform secure storage.

### Local setup and client portability

Copy `apps/api/.env.example` to `apps/api/.env`, set `DATABASE_URL`, and run the database migration before starting the API. For local verification/reset links set `DEV_EMAIL_ENABLED=true` while `NODE_ENV=development`; the API prints links to its console. The default is disabled. Production startup is blocked until a real `EmailProvider` is configured. Run `pnpm --filter api test` for auth tests.

For Expo/React Native, send `X-Auth-Client: native` and use the returned bearer token on `/me` and `/logout`. Store it only in Expo SecureStore and clear it after logout. `AuthProvider` keeps provider operations separate from application user UUIDs and authorization. A future Cognito adapter should validate Cognito identities and attach a verified provider subject to the existing `users.id` through controlled linking; do not match/link based on unverified email. Event memberships and certificate ownership continue to reference the application UUID.

### Event management (`/api/events`)

All event routes require a valid session for an email-verified user. Browser requests use the session cookie; native requests use the existing `X-Auth-Client: native` bearer convention.

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `POST` | `/api/events` | Create an event and its creator's admin membership atomically | Any authenticated verified user |
| `GET` | `/api/events` or `/api/events/` | Paginated published events plus non-archived events where the user has membership | Authenticated |
| `GET` | `/api/events/:eventId` | Get published event details, or private event details for a member/admin | Authenticated |
| `PATCH` | `/api/events/:eventId` | Update name, description, dates, or status | Event admin |
| `DELETE` | `/api/events/:eventId` | Archive an event | Event admin |

Create example:

```json
{
  "name": "HMI Graduation 2026",
  "description": "Annual graduation ceremony",
  "startDate": "2026-11-01T10:00:00.000Z",
  "endDate": "2026-11-01T15:00:00.000Z",
  "status": "draft"
}
```

Success data contains `{ "event": { ...event, "accessRole": "admin" } }` (HTTP `201` on create); list data contains `{ "events": [...] }`. Dates must be ISO date-time values and the end must not precede the start. User IDs and roles are derived from the session and database membership, never request bodies. Admin is scoped to one event. DELETE sets `archivedAt`; it preserves the event row and its registration, participant, and certificate history. Archived events are omitted from list and detail access.

Shared JSON contracts live in `packages/shared` (`@hmi/shared`): authentication request schemas/types, event statuses/roles and create/update schemas, event DTOs, public user and auth response types, and success/error envelope types. API route validation and frontend form validation use the shared auth and event schemas. Database records and authorization logic remain in the API.

### Participant routes (`/api`)

Participant endpoints use the existing verified local session (cookie for web,
`X-Auth-Client: native` plus bearer token for native clients). Cognito is not
configured in this application yet. List endpoints use `page` (default `1`),
`pageSize` (default `20`, maximum `100`) and return `total`, `page`, and
`pageSize`. Search is a trimmed event-name or participant-name substring.
Only `published` events are discoverable to non-members and eligible for new
registration; the schema has no separate visibility, registration-window, or
capacity fields. Registration is allowed before `startDate`. Cancellation is
allowed before `startDate` for an active registration. The unique
`event_registrations(event_id, participant_id)` index plus transactional
conflict handling prevents concurrent duplicates. Cancellation marks the
registration row instead of deleting it; an eligible participant can register
again before the event starts, reusing that row.

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `GET` | `/api/me/events` | Paginated registrations belonging to the current user | Authenticated |
| `GET` | `/api/me/events/:eventId/registration` | Current user's registration or `null` | Authenticated |
| `POST` | `/api/events/:eventId/registration` | Register current user; `409` on duplicate | Authenticated, Origin protected for web |
| `DELETE` | `/api/events/:eventId/registration` | Cancel an active registration before event start | Authenticated, Origin protected for web |
| `GET` | `/api/events/:eventId/participants` | List participant registrations and contact details | Admin of that event |
| `PATCH` | `/api/events/:eventId/participants/:participantId` | Set a registration to `registered`, `attended`, or `absent` | Admin of that event |
| `GET` | `/api/me/certificates` | Paginated current-user certificates, optional `eventId` and `status` | Authenticated |
| `GET` | `/api/certificates/:certificateId` | Certificate metadata when owned by current user | Authenticated |
| `GET` | `/api/certificates/:certificateId/pdf` | Stream the authorized private PDF | Certificate owner |
| `GET` | `/api/events/:eventId/certificates` | Search and page event certificate records | Admin of that event |

Registration responses include `eventId`, `membershipId` (the
`event_registrations.id`), `registrationStatus`, `registeredAt`, and
`updatedAt`. Certificate metadata derives ownership through
`certificates.participant_id → participants.user_id`; it never accepts a
client-supplied owner ID. Revoked certificates remain visible with
`status: "revoked"` and `revokedAt` populated when present. PDF metadata is
stored in `certificate_assets`; the AWS SDK adapter streams the private file
only after ownership authorization. S3 must be configured before issuing or
downloading PDFs. Participant metadata routes need no migration; issuance uses
the additive uniqueness migration described below.

Example registration success (`201`):

```json
{
  "success": true,
  "data": {
    "eventId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "membershipId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "registrationStatus": "registered",
    "registeredAt": "2026-10-20T00:00:00.000Z",
    "updatedAt": "2026-10-20T00:00:00.000Z"
  }
}
```

`GET /api/me/certificates` returns a `certificates` array with
`certificateNumber`, `eventId`, `eventName`, `issuedAt`, `status`, and
certificate metadata, along with pagination fields. It accepts `search` for
certificate number, title, or event name. Event-admin certificate search
accepts `search` for certificate number, recipient name, or title, and an
optional `status` filter. A private certificate requested by a different user
returns the same `404 Certificate not found` as an unknown certificate.

### Issuance, verification, PDF, and revocation

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| `POST` | `/api/events/:eventId/certificates` | Issue one certificate to an active event registrant | Event admin |
| `POST` | `/api/events/:eventId/certificates/bulk` | Issue certificates to up to 100 registrants and report each result | Event admin |
| `GET` | `/api/events/:eventId/certificates` | Search and list event certificate records | Event admin |
| `GET` | `/api/verify/:token` | Public current-status verification | Public |
| `GET` | `/api/certificates/:certificateId/pdf` | Stream PDF bytes from private storage | Certificate owner |
| `PATCH` | `/api/certificates/:certificateId/revoke` | Revoke and audit a certificate | Admin of its event |

Single-issuance example request:

```json
{ "participantId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "title": "Certificate of Achievement", "description": "Completed the workshop" }
```

Issuance accepts participants with `registered` or `attended` status in the
specified event. A unique index permits one certificate per participant and
event, including after revocation. Bulk responses return one success or
failure result per submitted participant ID; each successful certificate is
fully stored. Failed rows trigger object deletion and draft cleanup; if object
deletion fails, the draft and cleanup asset reference are retained where the
database remains available. The service does not claim an all-or-none
bulk transaction across PostgreSQL and S3.

Public verification returns `result: "valid"`, `"revoked"`, or `"not_found"`
and only the certificate number, title, recipient name, event name, issue
date, and revocation date. Draft certificates resolve as not found. The PDF
contains a QR code to the verification URL. Revocation updates the database
and audit record in one transaction; repeated requests return success with
`alreadyRevoked: true`. The web UI serves a public verification page at
`/verify/:token`. When `CERTIFICATE_PUBLIC_VERIFY_BASE_URL` is omitted, the
API derives the QR target from `AUTH_WEB_ORIGIN` plus `/verify`.

The API streams PDFs only after checking the current session's ownership via
the participant relationship. PDF responses default to attachment;
`?disposition=inline` enables the same owner-authorized preview path. S3 keys and credentials are never returned.
Configure `AWS_REGION`, `CERTIFICATE_S3_BUCKET`, and optionally
`AWS_ENDPOINT_URL_S3` in `apps/api/.env`. Neon Object Storage also requires
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`; AWS S3 should use the default
credential chain, preferably an EC2 instance role. The bucket must have
Block Public Access enabled and must not grant public object access. EC2
should use an instance role with only `s3:PutObject`, `s3:GetObject`, and
`s3:DeleteObject` on `arn:aws:s3:::<bucket>/certificate-pdfs/*`; no bucket-list
permission is needed. The AWS S3 path sends SSE-S3 and uses the SDK default
credential chain. Custom S3 endpoints use path-style requests and omit the
AWS-specific SSE-S3 header; keep Neon buckets private and manage bucket access
in Neon. Never put storage keys in frontend variables. The app does not
provision buckets or cloud infrastructure.

Example identity policy for the application role (replace the bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET/certificate-pdfs/*"
  }]
}
```

S3 charges vary by Region and storage class and can include stored bytes,
PUT/GET requests, and outbound transfer; estimate AWS deployment costs in the
[AWS S3 pricing page](https://aws.amazon.com/s3/pricing/). AWS S3 uses S3
Standard defaults and server-side AES256 encryption.

## 2. Response Conventions

Successful responses use `successResponse(c, data, statusCode?)`. The status
defaults to `200`; use a 2xx status such as `201` for a newly created resource.

```json
{
  "success": true,
  "data": { "id": "example-id" }
}
```

Failed responses use a 4xx or 5xx HTTP status and the `errorResponse` envelope.
`details` is omitted when it is not provided.

```json
{
  "success": false,
  "error": {
    "statusCode": 404,
    "message": "Certificate not found",
    "details": { "certificateId": "example-id" }
  }
}
```

The `statusCode` in the body matches the HTTP status. Never mark a failed
operation as a success. Only include client-safe information in `details`.

## 3. `AppError`

`AppError` extends `Error` and takes an HTTP error status, a client-facing
message, and optional client-safe details. Throw it from a route or service;
the global handler converts it to the standardized error response.

```typescript
throw new AppError(404, 'Certificate not found')

throw new AppError(400, 'Invalid certificate data', [
  { field: 'participantId', message: 'Required' }
])
```

## 4. Async Routes and Global Error Handling

Wrap new Hono route callbacks with `asyncHandler`. It preserves the callback's
parameter and response types and lets rejected async work reach Hono's global
error handler. Do not add route-level `try-catch` blocks just to format errors.

```typescript
app.get('/api/certificates/:id', asyncHandler(async (c) => {
  const certificate = await loadCertificate(c.req.param('id'))
  if (!certificate) throw new AppError(404, 'Certificate not found')

  return successResponse(c, certificate)
}))
```

`createApp` in `apps/api/src/app.ts` registers `apiErrorHandler` with `app.onError` and
`apiNotFoundHandler` with `app.notFound` before route definitions. The global
handler:

- Returns `AppError` with its status, message, and optional details.
- Converts thrown Zod validation errors to `400 Validation failed`, exposing
  only issue paths and messages.
- Converts Hono `HTTPException` 4xx errors to the same envelope and status.
- Logs unexpected errors server-side and returns a generic `500 Internal
  server error` response without a stack trace or internal error details.
- Returns unknown routes as `404 Route not found` in the same envelope.

Hono awaits route handlers and forwards rejected promises to `onError`.
`asyncHandler` provides a consistent async route signature; it does not replace
the global error handler.

## 5. Adding Endpoints

Add a route in the relevant `apps/api/src/routes/` module and mount it from
`apps/api/src/app.ts`. For each endpoint:

1. Keep its existing validation, authorization, and business logic.
2. Wrap async handlers in `asyncHandler`.
3. Return successful data through `successResponse`; choose an appropriate 2xx
   status when needed.
4. Throw `AppError` for expected failures, using an appropriate 4xx status and
   client-safe message/details. Let unexpected errors propagate to `onError`.
5. Avoid manual response envelopes and redundant `try-catch` blocks.

Additional future workflows not implemented by this task include certificate
template selection and standalone participant CRUD:

| Endpoint | Method | Purpose | Auth |
| :--- | :--- | :--- | :--- |
| `/api/participants` | `GET` / `POST` | Manage participants | Admin |
