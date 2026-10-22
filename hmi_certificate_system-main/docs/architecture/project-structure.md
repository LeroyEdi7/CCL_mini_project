# Project Directory Structure: HMI Certificate System

## 1. Overview & Architectural Principles

The **HMI Certificate System** is organized as a feature-driven TypeScript monorepo powered by `pnpm` workspaces. It establishes a modular vertical-slice architecture across the frontend and backend applications, alongside a shared package for type contracts and validation schemas:

- **Frontend Application (`apps/web`)**: React 19 Single Page Application built with Vite and Tailwind CSS v4, structured into domain feature modules, layout shells, and reusable UI building blocks.
- **Backend Application (`apps/api`)**: High-performance REST API built with Hono and Node.js, featuring modular route registration, middleware, vertical domain feature slices, and a Drizzle ORM PostgreSQL persistence layer.
- **Shared Package (`packages/shared`)**: Cross-app API contracts, Zod validation schemas, and domain constants shared between client and server to enforce end-to-end type safety without circular dependencies.

> [!NOTE]
> Both client and server employ vertical feature slicing (`features/`), collocating domain-specific components, routes, handlers, and business logic into isolated modules.

---

## 2. Monorepo Directory Tree

```
hmi-certificate-system/
│
├── apps/
│   │
│   ├── web/                           # React frontend
│   │   └── src/
│   │       ├── app/                   # App setup and providers
│   │       ├── routes/                # URL-to-page mapping
│   │       │
│   │       ├── features/              # Feature-specific frontend code
│   │       │   ├── auth/
│   │       │   ├── dashboard/
│   │       │   ├── events/
│   │       │   ├── participants/
│   │       │   ├── certificates/
│   │       │   └── verification/
│   │       │
│   │       ├── components/
│   │       │   ├── ui/                # Generic UI building blocks
│   │       │   └── layout/            # Sidebar, header, page shell
│   │       │
│   │       ├── hooks/                 # Truly app-wide React hooks
│   │       ├── lib/                   # Frontend infrastructure utilities
│   │       └── styles/                # Global styles and theme
│   │
│   └── api/                           # Hono backend
│       └── src/
│           ├── app/                   # API app setup
│           ├── routes/                # API route registration
│           ├── middleware/            # Authentication, errors, etc.
│           │
│           ├── features/              # Feature-specific backend code
│           │   ├── auth/
│           │   ├── events/
│           │   ├── participants/
│           │   ├── certificates/
│           │   └── verification/
│           │
│           ├── db/
│           │   ├── schema/            # Database table definitions
│           │   ├── migrations/        # Database structure changes
│           │   └── client/            # Database connection setup
│           │
│           ├── lib/                   # Backend infrastructure utilities
│           └── index.ts               # Server entry point
│
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas/               # Shared Zod validation schemas
│           ├── types/                 # Shared TypeScript contracts
│           └── constants/             # Shared domain constants
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
└── .gitignore
```

> [!IMPORTANT]
> The tree above is a conceptual layout, not a literal listing. The current
> implementation uses top-level `src/routes`, `src/services`, and
> `src/repositories` directories rather than `src/features` or `src/middleware`.
> Drizzle migrations are in `apps/api/drizzle/`, not `src/db/migrations/`.

### Current implementation locations

| Area | Current paths |
| :--- | :--- |
| Web entry and routing | `apps/web/src/main.tsx`, `apps/web/src/App.tsx` |
| Event UI | `apps/web/src/features/events/events.tsx`, `apps/web/src/features/certificates/EventCertificateManagement.tsx` |
| Certificate and public verification UI | `apps/web/src/features/certificates/certificates.tsx` |
| Certify design system foundation | `apps/web/src/features/design-system/`, `apps/web/src/features/design-system/design-system.css` |
| Shared browser API client | `apps/web/src/lib/api-client.ts` |
| Hono app and route registration | `apps/api/src/app.ts` |
| API route handlers | `apps/api/src/routes/` |
| Business services | `apps/api/src/services/` |
| Database repositories | `apps/api/src/repositories/` |
| Drizzle schemas and client | `apps/api/src/db/schema/`, `apps/api/src/db/index.ts` |
| Tracked migrations | `apps/api/drizzle/` |
| API tests | `apps/api/test/`; database integration is gated by `TEST_DATABASE_URL` and `TEST_DATABASE_ISOLATED=true` |

---

## 3. Detailed Directory Responsibilities

### A. Root Workspace Configuration

| File | Responsibility |
| :--- | :--- |
| `package.json` | Monorepo root manifest, global package scripts, and workspace dependencies. |
| `pnpm-workspace.yaml` | Declares workspace packages (`apps/*`, `packages/*`). |
| `pnpm-lock.yaml` | Workspace-wide frozen dependency tree. |
| `tsconfig.base.json` | Shared TypeScript base configuration extended by child packages. |
| `.gitignore` | Monorepo git ignore patterns (`node_modules`, `dist`, `.env`, build outputs). |

---

### B. Frontend Application (`apps/web`)

The frontend follows a feature-oriented layout prioritizing colocation of feature logic over technical grouping.

| Directory / File | Description & Contents |
| :--- | :--- |
| `src/app/` | Global application bootstrap, query client setup, router and theme providers. |
| `src/routes/` | Route definitions and URL-to-page mappings connecting pages to layout shells. |
| `src/features/` | Self-contained domain modules containing feature UI, local state, queries, and mutations. |
| `src/features/auth/` | Authentication flows: login forms, session status, credentials, and protected routes. |
| `src/features/dashboard/` | Admin overview, metrics summary cards, recent activity, and system status. |
| `src/features/events/` | Event creation, listing, configuration, and event detail interfaces. |
| `src/features/participants/` | Attendee lists, CSV file import/export, registration, and attendance status. |
| `src/features/certificates/` | Certificate template builder, issuance triggers, revoke actions, and previews. |
| `src/features/verification/` | Public-facing certificate verification portal and validity status view. |
| `src/components/ui/` | Generic, domain-agnostic UI primitives (Button, Dialog, Input, Dropdown, Table). |
| `src/components/layout/` | Structural page scaffolding: App Header, Sidebar navigation, and PageShell. |
| `src/hooks/` | Cross-cutting custom React hooks used across multiple features (e.g., `useDebounce`). |
| `src/lib/` | Reusable utilities and client helpers (`cn` classnames utility, HTTP fetch client). |
| `src/styles/` | Global CSS stylesheets, Tailwind CSS v4 setup, Geist font rules, and theme tokens. |

---

### C. Backend Application (`apps/api`)

The backend REST API organizes request pipelines, business logic, and database operations into clean layers.

| Directory / File | Description & Contents |
| :--- | :--- |
| `src/index.ts` | Server bootstrap and runtime entry point using `@hono/node-server`. |
| `src/app/` | Hono app factory, initialization, base routing, and application lifecycle setup. |
| `src/routes/` | Central route registration aggregating sub-routers across feature domains. |
| `src/middleware/` | Global request middleware (JWT verification, CORS, error boundaries, request logging). |
| `src/features/` | Feature vertical slices encapsulating endpoints, controllers, and services. |
| `src/features/auth/` | Authentication routes, password hashing, and token issuance/refresh logic. |
| `src/features/events/` | Event management endpoints, query handlers, and data transformations. |
| `src/features/participants/` | Attendee endpoints, CSV batch ingestion, and participant queries. |
| `src/features/certificates/` | Certificate issuance engine, PDF generation, QR code generation, and revocation. |
| `src/features/verification/` | Public verification API endpoint checking database status and tamper evidence. |
| `src/db/` | Database layer using Drizzle ORM and PostgreSQL. |
| `src/db/schema/` | Table schemas and relational definitions for all domain entities. |
| `src/db/migrations/` | Generated SQL migration scripts managed via Drizzle Kit. |
| `src/db/client/` | Database client connection initialization and connection pooling. |
| `src/lib/` | Infrastructure helpers (crypto utilities, token signing, logging, email dispatch). |

---

### D. Shared Package (`packages/shared`)

Central single source of truth for contracts shared between `apps/web` and `apps/api`.

| Directory / File | Description & Contents |
| :--- | :--- |
| `src/schemas/events.js` | Shared Zod event create/update request schemas. |
| `src/types/index.d.ts` | TypeScript event DTO/input, public user, and response envelope contracts. |
| `src/constants/events.js` | Event status and membership role values used by the API and web app. |

The package exposes these through `@hmi/shared`. Runtime schemas/constants are
JavaScript ESM, with declarations alongside the package entry point; this lets
the API's compiled JavaScript and the Vite frontend import the same runtime
validation without a separate shared build step.

---

## 4. Architectural Rules & Invariants

1. **Colocation & Isolation**: Code inside `features/<name>` should only contain items specific to that domain feature. Common utilities must be elevated to `components/ui/`, `hooks/`, `lib/`, or `packages/shared`.
2. **Contract Authority**: API inputs and outputs must adhere to schemas defined in `packages/shared/src/schemas/`. Both frontend query hooks and backend route validators consume these shared schemas.
3. **Database Guardrail**: Direct database queries via Drizzle ORM are strictly restricted to `apps/api/src/db/` and backend feature services. The client application never has database access.
4. **Dependency Flow**:
   - `packages/shared` has zero internal workspace dependencies and must not import from any app.
   - `apps/web` and `apps/api` import from `packages/shared`.
   - `apps/web` and `apps/api` must never directly import from each other.
