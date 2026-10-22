# Frontend Architecture Map (`apps/web`): HMI Certificate System

## Application Overview

The web SPA uses React 19, TypeScript, Vite, React Router, TanStack Query,
Tailwind CSS v4, and the existing authentication styles. `src/main.tsx` provides
the shared QueryClient; `src/App.tsx` defines public and authenticated routes.
The browser uses same-origin `/api` requests with the existing HttpOnly local
session cookie. Cognito is not configured.

## Feature Areas

| Path | Responsibility |
| --- | --- |
| `src/features/auth/` | Login, registration, recovery, email verification |
| `src/features/events/events.tsx` | Event list/details and create/edit forms |
| `src/features/admin/AdminWorkspace.tsx` | Authenticated admin dashboard, events, four-step creation wizard, event detail, participants, certificate registry, activity log, templates, settings, and session-persisted preview data |
| `src/features/admin/admin-workspace.css` | Responsive admin workspace layout, tables, dialogs, certificate preview states, and visual tokens |
| `src/features/admin/csv-import.ts` | Streaming CSV parser for participant uploads with progress callbacks, validation, and a row cap |
| `src/features/certificates/EventCertificateManagement.tsx` | Event-admin participant search, attendance updates, individual/bulk certificate issue, event certificate search, status/revocation |
| `src/features/certificates/certificates.tsx` | Owner certificate listing/search, authorized PDF preview/download, public verification page |
| `src/features/design-system/` | Certify theme tokens, shared status pills, print-style certificate preview, and participant/admin layouts |
| `src/lib/api-client.ts` | Standard JSON envelope client plus authenticated PDF blob downloads |
| `src/App.css` | Event, participant, certificate table and verification layouts |

## Routes and Authorization

- Successful sign-in and the authenticated `/` route land on `/admin/dashboard`.
- `/events/:eventId`: authenticated event detail. Admin-only management controls
  are shown only when API data reports `accessRole: "admin"`; the API remains
  the authorization boundary.
- `/admin/*`: authenticated administrative preview workspace. Mock actions are
  session-persisted and explicitly labeled when they do not call the API; real
  `/events` and `/certificates` routes continue to use the backend.
- `/certificates`: authenticated user's own certificates and owner-authorized
  PDF actions.
- `/verify/:token`: public verification, no login required.

TanStack Query keys include event IDs and active search/filter/page values.
Attendance, issue, and revoke mutations invalidate their dependent event and
certificate queries. Zod validates issue/revoke inputs; existing event forms
continue to use their shared Zod schemas. React Hook Form is installed but the
current form modules do not use it.

The admin preview streams CSV participant files in-browser, limits uploads to
20 MB and 20,000 participant rows, yields during parsing, and renders only the
first 50 imported rows while validating the full file. XLSX is accepted by the
picker but reports that spreadsheet parsing support is not configured.
Issuance, email delivery, PDF download, and template editing remain
preview-only unless the user follows the corresponding existing API-backed
flow.

## Development and Validation

From the repository root, run `pnpm --filter web dev`, `pnpm --filter web
build`, and `pnpm --filter web lint`. There is no separate frontend unit-test
script configured.
