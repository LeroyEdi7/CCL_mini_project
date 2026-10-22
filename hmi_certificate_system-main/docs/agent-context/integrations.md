# External Integrations: HMI Certificate System

## 1. Verified External Integrations

### PostgreSQL Database (Neon Serverless)
- **Service**: Neon Serverless PostgreSQL.
- **Responsibility**: Primary persistent data store for the application, including users, events, participants, registrations, certificates, assets, and audit records.
- **Integration Layer**: Drizzle ORM (`drizzle-orm`) via `pg` client and Drizzle Kit (`drizzle-kit`).
- **Configuration Path**: `apps/api/drizzle.config.ts` and `apps/api/.env`.
- **Environment Variable**: `DATABASE_URL` (connection string with SSL/channel binding parameters).
- **Security Rule**: The database connection string contains credentials and must strictly remain in `apps/api/.env`. It must never be checked into version control or exposed to the frontend bundle.
- **Read-only check (2026-10-20)**: The configured development Neon target had migration `0003` applied and zero duplicate event-participant certificate groups. No isolated `TEST_DATABASE_URL` was configured, so no database mutation tests were run there.

### Local Authentication and Email
- **Identity**: Email/password authentication is behind `AuthProvider`; immutable `users.id` UUIDs remain the application identity.
- **Passwords and sessions**: Argon2id hashes credentials. Only SHA-256 hashes of random session and one-time email tokens are stored.
- **Email**: `EmailProvider` separates delivery from auth services. `DEV_EMAIL_ENABLED=true` enables console links in development only. A production mail provider remains to be implemented, and production startup refuses until configured.
- **Web sessions**: HttpOnly SameSite cookies; browser write requests require the configured frontend Origin. Native clients use explicit bearer mode and should keep tokens in Expo SecureStore.

---

## 2. Planned Target AWS Architecture & External Integrations

Per `AGENTS.md` (Sections 2, 8, 9, 10), the target deployment environment is AWS conforming to faculty cloud architecture guidelines. These services are implemented iteratively as tasks demand, not prematurely:

| Service | Target Architecture Role | Current Status | Notes & Constraints |
| :--- | :--- | :--- | :--- |
| **Compute (EC2 / VPC)** | Main application & Hono backend | Planned (Node.js local) | Main app runs on EC2 or equivalent cloud compute within a custom VPC (public/private subnets, security groups, IGW). Do not replace with an entirely serverless architecture. |
| **Database (Amazon RDS)** | Production PostgreSQL database | Dev (Neon PostgreSQL) | Target is Amazon RDS for PostgreSQL located in a private subnet, accessible only by the application security group. |
| **Storage (S3-compatible)** | Private certificate PDF storage | Implemented and Neon upload/download/delete smoke-tested | AWS SDK v3 adapter streams private PDF bytes through owner authorization. Neon endpoints use path-style addressing and omit AWS-specific SSE-S3 headers; private access is configured on the Neon bucket. Configure `AWS_REGION`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `CERTIFICATE_S3_BUCKET` for Neon. AWS S3 uses SSE-S3 and the default credential chain / EC2 role. No bucket is provisioned by this app. |
| **Identity (Amazon Cognito)** | Production user authentication & User Pools | Dev (Local email/password) | Target production IdP. Backend validates Cognito tokens and maps verified subject to internal application user UUIDs. |
| **Secrets & Config (SSM)** | Secrets & parameter management | Dev (`.env` files) | Target is AWS Systems Manager Parameter Store or Secrets Manager. Server secrets must never be exposed to frontend bundles (`VITE_`). |
| **Monitoring (CloudWatch)** | Application logs, metrics & alarms | Planned | Structured application logging and meaningful operational alerts. |
| **Cost Alerts (AWS Budgets)**| Budget threshold monitoring | Planned | Cost guardrails to prevent unexpected AWS cloud charges. |
| **IaC (CloudFormation)** | Infrastructure as code | Planned | Infrastructure must ultimately be reproducible via CloudFormation templates. |
| **Notifications (SNS)** | Operational notifications | Planned | Meaningful alerts for operational events. |

Certificate storage is instantiated only when both region and bucket are
configured. Local development can use `AWS_PROFILE` and shared AWS
credentials/config files; production EC2 should use an attached instance role.
For Neon Object Storage, create a private bucket in Neon and set its exact name
as `CERTIFICATE_S3_BUCKET`; its branch endpoint and credentials are supplied
through `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and
`AWS_REGION`. The Neon SDK path is S3-compatible, uses path-style addressing,
and does not send AWS's `ServerSideEncryption` header. Keep the Neon bucket
private. For AWS S3, keep Block Public Access enabled. Limit the IAM resource to
`arn:aws:s3:::<bucket>/certificate-pdfs/*` and actions `s3:PutObject`,
`s3:GetObject`, and `s3:DeleteObject`. No static AWS keys are required by the
application. S3 can incur storage, request, and data-transfer charges; see the
[official S3 pricing](https://aws.amazon.com/s3/pricing/).

### Runtime configuration and email readiness

- `DATABASE_URL`: current application PostgreSQL URL. Do not use it for
  destructive integration tests.
- `AWS_REGION`, `AWS_ENDPOINT_URL_S3`, and `CERTIFICATE_S3_BUCKET`: storage
  region, optional custom S3-compatible endpoint, and existing private bucket.
  Neon also requires `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
- `CERTIFICATE_PUBLIC_VERIFY_BASE_URL`: public browser page prefix, such as
  `https://your-domain/verify`. If omitted, defaults to
  `${AUTH_WEB_ORIGIN}/verify`.
- `AUTH_WEB_ORIGIN` and `AUTH_APP_BASE_URL`: browser origin and links sent by
  the auth provider. `DEV_EMAIL_ENABLED=true` prints verification/recovery
  links only in development. Production currently refuses startup because a
  production email delivery provider is not implemented.
- The database integration suite requires a distinct disposable
  `TEST_DATABASE_URL`, migrations applied to it, and explicit
  `TEST_DATABASE_ISOLATED=true`. No test DB URL is currently configured.

