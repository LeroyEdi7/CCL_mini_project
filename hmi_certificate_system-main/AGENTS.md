# AGENTS.md — Project Architecture and Engineering Rules

## 1. Project Purpose

This project is a Title Certificate Generation and Verification Management System.

The application must support:

- Public user registration and login.
- Event creation and management.
- Event-specific administrators and participants.
- Certificate generation, issuing, downloading, and revocation.
- Public certificate verification without login.
- A future React Native/Expo mobile application.
- Deployment to AWS in compliance with the faculty's cloud architecture requirements.

Every agent must understand the distinction between identity, authorization, event membership, and certificate ownership.

---

## 2. Technology and Deployment Direction

Current application stack:

- pnpm monorepo.
- React, TypeScript, Vite, Tailwind CSS, and shadcn/ui.
- Hono + TypeScript API.
- PostgreSQL and Drizzle ORM.
- Zod for validation.
- Shared TypeScript contracts and API utilities.
- A future React Native/Expo client.

Target AWS architecture:

- EC2 or equivalent cloud compute for the main application and backend.
- Custom VPC with appropriate public/private subnets, route tables, Internet Gateway, and security groups.
- Amazon RDS for PostgreSQL.
- Amazon S3 for certificate files and other genuine application storage requirements.
- Amazon Cognito User Pools for the intended production identity provider.
- AWS IAM roles and least-privilege permissions.
- Systems Manager Parameter Store or an appropriate AWS secret-management service.
- CloudWatch logs, metrics, and meaningful alarms.
- AWS Budgets for cost alerts.
- CloudFormation for infrastructure as code.
- SNS for meaningful operational notifications.

Do not replace the required EC2-based main application with an entirely serverless architecture.

Do not create or provision all AWS resources just because this file exists. Implement only the infrastructure relevant to the current task.

### Verified Monorepo Package Dependencies

| Layer | Technology | Version / Configuration | Notes |
| :--- | :--- | :--- | :--- |
| **Workspace** | pnpm Monorepo | `pnpm@12.11.2` (`pnpm-workspace.yaml`) | Monorepo managing `apps/*` and `packages/*` |
| **Backend API** | Hono | `hono@^4.13.13`, `@hono/node-server@^2.1.3` | Runs on Node.js; TypeScript with `tsx` watch mode |
| **Database / ORM** | Drizzle ORM & PostgreSQL | `drizzle-orm@^0.45.4`, `pg@^8.23.1`, `drizzle-kit@^0.31.11` | PostgreSQL target with connection pool in `apps/api/src/db` |
| **Frontend SPA** | React + Vite | `react@^19.2.8`, `vite@^8.3.0`, TypeScript | Single-page application configured with path alias `@/*` |
| **Styling & UI** | Tailwind CSS v4 & Shadcn | `tailwindcss@^4.3.3`, `@base-ui/react@^1.9.0` | Uses `@tailwindcss/vite`, Nova style preset, Geist font |
| **Linting** | Oxlint | `oxlint@^1.81.0` | Configured in `apps/web/.oxlintrc.json` |
| **Validation** | Zod | `zod@^4.6.6` | Installed in both `apps/api` and `apps/web` |
| **Routing & Query** | React Router & React Query | `react-router-dom@^7.18.4`, `@tanstack/react-query@^5.104.1` | Installed in `apps/web` |

---

## 3. Authentication Provider Independence

The current development authentication system may use local email/password authentication before Cognito is integrated.

All agents must preserve a clean separation between:

- Identity provider and credential verification.
- Application user profiles.
- Application authorization.
- Event membership and roles.
- Certificate ownership and access permissions.

Rules:

1. Use an immutable application user UUID as the primary key.
2. Never use email as the permanent identity key.
3. Keep provider-specific IDs separate from the application user ID.
4. Support a future external identity mapping with provider name and provider subject.
5. Never link identities automatically using an unverified email.
6. Keep passwords, tokens, and authentication-provider implementation details out of business services.
7. Do not implement custom cryptography or a custom token-issuer protocol.
8. Document authentication-provider assumptions in the relevant module.
9. Do not assume existing password hashes can be imported into Cognito.
10. Do not implement Cognito integration until a task explicitly requests it.

The future Cognito implementation must validate tokens on the backend and map the verified Cognito subject to the existing application user. It must not rewrite user IDs or invalidate event relationships unnecessarily.

---

## 4. Authorization and Business Rules

Roles are contextual, not global.

- Any registered user may create an event.
- The event creator receives admin membership for that event.
- An event admin can appoint other admins according to the application's authorization rules.
- A user can administer one event and participate in another.
- A user must not receive admin rights for every event merely because they created an event elsewhere.
- Event permissions must be checked by the backend for every protected operation.
- Public certificate verification must not require authentication.
- Public verification responses must expose only the minimum information needed to verify authenticity.
- Certificate download permissions must be enforced by the backend.
- Never trust a role, user ID, ownership claim, or permission supplied only by the frontend.

Store event membership and authorization data in PostgreSQL, not as one global `isAdmin` flag in Cognito or the user profile.

---

## 5. Shared API Contracts

Maintain one consistent API response and error contract for the web client, future mobile client, and backend.

Use the existing shared response types and error codes. Do not create a competing response format.

Expected principles:

- Predictable success and error shapes.
- Appropriate HTTP status codes.
- Consistent validation error details.
- Stable machine-readable error codes.
- No stack traces, secrets, database credentials, or internal implementation details in production responses.
- Request IDs or correlation IDs where supported by the existing architecture.

Validate incoming requests on the server. Reuse shared contracts where appropriate without trusting client-side validation as a security boundary.

Avoid redundant try/catch blocks when centralized Hono error handling already provides the required behavior.

---

## 6. Future React Native and Cross-Platform Support

The backend is a shared API for the React web application and future React Native/Expo app.

Therefore:

- Keep business logic out of React components.
- Keep API request and response contracts independent of browser APIs.
- Keep reusable domain types and schemas in the shared package where appropriate.
- Do not require `window`, browser cookies, or localStorage inside shared domain logic.
- Isolate platform-specific storage and authentication transport behind interfaces.
- Use secure, platform-appropriate token storage for a future native client, such as Expo SecureStore.
- Never store authentication tokens or secrets in ordinary mobile persistent storage.
- Do not build mobile screens unless explicitly requested.
- Do not assume web cookies and native token storage behave identically.
- Document any platform-specific differences in authentication, redirects, uploads, and downloads.

Prefer portable domain logic and shared API contracts, not an artificial attempt to share every UI component between React and React Native.

---

## 7. Database and ORM Rules

- PostgreSQL is the target database.
- Use Drizzle ORM and tracked migrations.
- Keep schema changes explicit, reviewable, and reversible where practical.
- Use stable UUID primary keys where appropriate.
- Enforce data integrity with database constraints, foreign keys, unique indexes, and transactions.
- Store file metadata and S3 object keys in PostgreSQL; store file contents in S3.
- Never store passwords or raw reset/session tokens.
- Do not rely only on application code for critical uniqueness or referential integrity.
- Avoid destructive schema changes without a documented migration plan.
- Keep provider-specific identity data separate from business entities.

---

## 8. AWS Security and Configuration

- Never hardcode AWS access keys or production credentials.
- Use IAM roles and temporary credentials for AWS workloads.
- Follow least privilege and restrict S3, Parameter Store, and other permissions to the resources required.
- Keep RDS private and restrict database access to the application security group.
- Keep certificate files private by default.
- Validate all environment variables and configuration at startup.
- Maintain an `.env.example` with placeholders only.
- Never commit `.env` files containing secrets.
- Do not put server secrets in `VITE_` variables or any other frontend bundle.
- Separate local development, test, and production configuration.
- Use TLS for deployed authentication and application traffic.
- Avoid NAT Gateway, load balancers, multi-AZ resources, and other recurring costs unless justified.
- Configure cost monitoring and document any expected charges.

---

## 9. AWS Integration Rules

When a task introduces or changes AWS services:

1. Read the latest official AWS documentation and current pricing.
2. Check current service capabilities, regional availability, prerequisites, and relevant quotas.
3. Prefer official documentation over outdated tutorials.
4. Explain the functional purpose of each service.
5. Ensure the service performs a real application or operational function.
6. Use least-privilege IAM permissions.
7. Document required configuration, environment variables, and deployment steps.
8. Identify potential recurring costs and cleanup requirements.
9. Avoid claiming that a resource is free without checking the current account plan, pricing, and eligibility.
10. Do not silently create expensive or public-facing infrastructure.

Infrastructure should ultimately be reproducible through CloudFormation or another explicitly approved infrastructure-as-code approach.

---

## 10. File Storage and Certificate Security

- Use an application storage interface rather than scattering direct S3 SDK calls throughout business logic.
- Local development can use an appropriate local implementation or a configured development bucket.
- The future AWS implementation must use the EC2 IAM role rather than embedded credentials.
- Store object keys, not publicly exposed permanent URLs, in database records.
- Keep the S3 bucket private.
- Authorize every certificate download.
- Use short-lived presigned URLs only where appropriate.
- Validate file type, size, ownership, and access permissions.
- Never allow a user to access a certificate merely by guessing its object key.
- Public verification should return verification information, not automatically expose the PDF.

---

## 11. Code Quality and Agent Workflow

Before making changes:

1. Inspect existing files and project conventions.
2. Search for reusable modules and utilities.
3. Confirm installed package versions and consult relevant official documentation for version-sensitive changes.
4. State the implementation plan for significant tasks.
5. Make the smallest coherent change that satisfies the task.
6. Avoid duplicating utilities, contracts, schemas, or authentication checks.
7. Do not modify unrelated modules or introduce unrequested features.
8. Add or update tests for changed behavior.
9. Run relevant tests, type checks, linting, migrations, and builds when possible.
10. Report actual results and unresolved issues honestly.

Do not claim that a test, deployment, AWS integration, or security check succeeded unless it was actually performed.

### Targeted Code Exploration Workflow

Agents MUST NOT perform unguided, repository-wide searches. Instead, follow this structured 10-step exploration protocol for all tasks:

1. **Read `AGENTS.md`**: Understand verified project boundaries, engineering rules, and execution rules.
2. **Read `docs/agent-context/codebase-map.md`**: Locate the files responsible for the relevant area.
3. **Identify the affected layer**: Determine if the task touches backend (`apps/api`), frontend (`apps/web`), shared contracts (`packages/shared`), or database schema.
4. **Read relevant context documents**: Consult specific docs (e.g., `docs/agent-context/frontend-map.md` or `docs/agent-context/backend-map.md`) before viewing code.
5. **Inspect target implementation files**: Read only the relevant files and their direct imports.
6. **Expand investigation only as needed**: Trace dependencies only when necessary to understand contracts, types, or data flow.
7. **Make changes strictly within authorized scope**: Adhere strictly to the requested feature or fix without modifying unrelated code.
8. **Update documentation**: When making meaningful structural or behavioral changes, update the corresponding markdown context files.
9. **Run validation checks**: Execute existing lint, typecheck, or build commands relevant to the modified package.
10. **Report outcome**: Provide a clear summary of modified files, verification checks executed, and any remaining questions or risks.

---

## 12. Documentation and Deliverables

When introducing a feature or infrastructure dependency, document:

- What it does.
- Why it is needed.
- How it integrates with the current architecture.
- Required environment variables and configuration.
- Local development and testing instructions.
- Deployment steps where relevant.
- Security considerations.
- Cost implications for AWS resources.
- Tests and verification steps.

Keep documentation concise and aligned with the actual implementation.

### Context Maintenance & Documentation Map

When modifying or expanding the codebase, consult and update the following context documents:

- **System Architecture**: `docs/architecture/overview.md`
- **Project Directory Structure**: `docs/architecture/project-structure.md`
- **Database Schema & Migrations**: `docs/architecture/database.md`
- **API Endpoints & Contracts**: `docs/architecture/api-contracts.md`
- **Architectural Decisions**: `docs/architecture/decisions.md`
- **Codebase Navigation Index**: `docs/agent-context/codebase-map.md`
- **Frontend Organization**: `docs/agent-context/frontend-map.md`
- **Backend Organization**: `docs/agent-context/backend-map.md`
- **Certificate Workflow**: `docs/agent-context/certificate-workflow.md`
- **External Integrations**: `docs/agent-context/integrations.md`

---

## 13. Priority Order

When requirements conflict, prioritize:

1. Security and data integrity.
2. Explicit project and faculty requirements.
3. Existing architecture and established contracts.
4. Maintainability and provider independence.
5. Cross-platform API compatibility.
6. Cost-conscious deployment.
7. Convenience and implementation speed.

Do not prematurely implement future infrastructure, mobile UI, or provider integrations. Prepare the architecture now, and implement those capabilities only when requested.

---

## 14. Repository Structure & Workspace Layout

```
hmi_certificate_system/
├── AGENTS.md                  # Primary architecture, engineering rules, and agent guidelines
├── package.json               # Root monorepo manifest
├── pnpm-workspace.yaml        # Workspace definition (apps/*, packages/*)
├── pnpm-lock.yaml             # Workspace lockfile
├── apps/
│   ├── api/                   # Backend application (Hono REST API)
│   │   ├── package.json       # API dependencies & scripts
│   │   ├── tsconfig.json      # NodeNext TypeScript configuration
│   │   ├── drizzle.config.ts  # Drizzle kit configuration (PostgreSQL)
│   │   ├── .env               # Environment configuration (PORT, DATABASE_URL)
│   │   ├── src/
│   │   │   ├── index.ts       # Hono API entry point
│   │   │   └── db/            # Drizzle database client & schema definitions
│   │   └── dist/
│   │       └── index.js       # Compiled JavaScript output
│   └── web/                   # Frontend SPA application (React 19 + Vite)
│       ├── package.json       # Frontend dependencies & scripts
│       ├── vite.config.ts     # Vite bundler configuration (@/ path alias)
│       ├── tsconfig.json      # Project references (app & node)
│       ├── tsconfig.app.json  # Application TypeScript configuration
│       ├── tsconfig.node.json # Bundler TypeScript configuration
│       ├── components.json    # Shadcn UI configuration (base-nova preset)
│       ├── .oxlintrc.json     # Oxlint linter configuration
│       ├── index.html         # HTML entry point
│       └── src/
│           ├── main.tsx       # React entry point
│           ├── App.tsx        # Starter UI component
│           ├── index.css      # Design tokens, Tailwind v4 imports, theme
│           ├── components/ui/ # Reusable UI components (button.tsx)
│           └── lib/utils.ts   # Helper utilities (cn export)
├── packages/
│   └── shared/                # Shared types, schemas, and contracts (Zod DTOs)
└── docs/                      # Architectural documentation & agent context maps
    ├── architecture/          # Overview, database, API contracts, ADRs
    └── agent-context/         # Feature maps, codebase maps, workflow docs
```

---

## 15. Development, Validation & Build Commands

All commands use `pnpm` from the repository root:

### Workspace Root
```bash
# Workspace status / test placeholder
pnpm test
```

### Backend (`apps/api`)
```bash
# Start development server with hot-reload (tsx watch)
pnpm --filter api dev

# Typecheck / build backend to dist/
pnpm --filter api build

# Run compiled backend server
pnpm --filter api start
```

### Frontend (`apps/web`)
```bash
# Start Vite development server
pnpm --filter web dev

# Run TypeScript checks and Vite production build
pnpm --filter web build

# Run Oxlint linter
pnpm --filter web lint

# Preview production build locally
pnpm --filter web preview
```
