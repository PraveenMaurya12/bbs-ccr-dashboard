# BBS CCR Dashboard

Internal Customer Care Representative (CCR) operations platform for Bade
Bhaisaab — a full-stack app, **separate** from the public BBS website.

- `/` — the React/Vite frontend (this directory)
- `backend/` — a NestJS + PostgreSQL API, CCR-only (never reachable by the public site)

The frontend still works entirely standalone against in-memory mock data
(the default). The backend is an opt-in addition — see
[Running everything together](#running-everything-together) to wire them up.

> All data anywhere in this repository — frontend mocks, backend seed data —
> is fictional. No real customer data, PAN numbers, bank statements, or
> credit reports are used anywhere. See
> [Security & privacy notes](#security--privacy-notes) for what this local
> setup is (and is not) ready for.

## Prerequisites

- Node.js 20+ and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (only
  needed to run the backend's PostgreSQL locally)

---

# Frontend

- React 19 + TypeScript (strict mode)
- Vite
- Tailwind CSS v4 (`@tailwindcss/vite`)
- shadcn/ui on Radix primitives
- React Router
- TanStack Query
- React Hook Form + Zod
- Recharts
- Lucide React icons

## Getting started

```bash
npm install
cp .env.example .env   # optional — only needed to point at a real backend (see below)
npm run dev
```

The dev server prints its local URL (Vite falls back to the next free port
if `5173` is already taken by another app on the machine).

### Commands

| Command           | Description                              |
| ------------------ | ----------------------------------------- |
| `npm run dev`       | Start the Vite dev server with HMR        |
| `npm run build`     | Type-check (`tsc -b`) and build for production |
| `npm run lint`      | Run ESLint                                |
| `npm run preview`   | Preview the production build locally      |

## Project structure

```
src/
  app/
    App.tsx              Root component (providers + router)
    providers/            QueryClientProvider, TooltipProvider
    router/                Route table, nav config, 404 page
  components/
    ui/                    shadcn/ui primitives (button, card, table, sheet, ...)
    shared/                Cross-feature building blocks (PageHeader, QueryBoundary,
                            EmptyState, ErrorState, LoadingState, StatusBadge)
    layouts/               AppLayout, Sidebar, Header, MobileNav
  features/
    dashboard/             Landing page placeholder + summary stats
    leads/                 Lead Management — reads from the backend when API mode is on
    customer-profile/      Customer Profiles placeholder
    level-1-credit/        Financial Assessments placeholder (Level 1 landing;
                            also the current home for the combined L1/L2/L3 view)
    level-2-financial/     Reserved for the Level 2 screen
    level-3-assessment/    Reserved for the Level 3 / cohort decision screen
    recovery-plans/        Recovery Plans placeholder
    settings/              Settings placeholder
    auth/                  Login screen (pixel-matched to Figma), forgot-password
                            placeholder, authService (mock or real backend)
  services/
    api/                   `apiRequest` fetch wrapper — talks to the real backend
    mock/                  Fictional sample data + `delay()` latency simulator
    *.Service.ts           One interface + mock/API implementation per domain area
  types/                   Lead, Customer, CreditReport, Level1/2/3 profiles,
                            CohortDecision, RecoveryPlan, shared status types
  lib/                     `cn()` class helper, `env` wrapper, in-memory `tokenStore`
```

## Navigation

Six top-level routes are wired up via React Router, matching the sidebar:

1. Dashboard (`/dashboard`)
2. Lead Management (`/leads`)
3. Customer Profiles (`/customers`)
4. Financial Assessments (`/financial-assessments`)
5. Recovery Plans (`/recovery-plans`)
6. Settings (`/settings`)

Two standalone auth screens sit outside the dashboard shell (no sidebar/header):
`/login` and `/forgot-password`. `/` still redirects straight to `/dashboard` —
the dashboard routes are not yet gated behind login (see
[Known limitations](#known-limitations)).

### Login screen

`features/auth` implements the login screen pixel-matched to the Figma design
(`Bade-BhaiSab-Website---V0`, node `1409:103604`). Two things worth knowing:

- In the Figma source, the entire left promotional panel — headline, feature
  list, illustration, and floating dashboard cards — is one flattened
  AI-generated image (`src/assets/login/promo-illustration.png`). Only the
  brand logo overlaid on top is a live element.
- The logo SVGs (`src/assets/logo/`) are copied from the existing public
  `bade-bhaisab` site repo — verified as an exact match against the Figma
  asset, so the local, non-expiring copy was used instead of Figma's
  7-day asset URL.

`/` redirects to `/dashboard`; unmatched paths render a 404 page.

The **Financial Assessments** nav item currently lands on a combined view of
Level 1/2/3 pipeline status. Once designs split this into three dedicated
screens, build them out under `features/level-1-credit`,
`features/level-2-financial`, and `features/level-3-assessment` and update
the route table in `src/app/router/routes.tsx`.

## Data & services

Every page reads data through a service function — never hardcoded in a
component. Each service exposes a TypeScript interface plus a mock
implementation backed by fixtures in `services/mock/`:

- `leadService` — leads and their per-stage pipeline status (**mock or real API**)
- `customerService` — customer profiles
- `creditReportService` — bureau report summaries
- `assessmentService` — Level 1 / Level 2 / Level 3 profiles and cohort decisions
- `recoveryPlanService` — recovery/repayment plans
- `authService` (in `features/auth/`) — login (**mock or real API**)

`QueryBoundary` (`src/components/shared/QueryBoundary.tsx`) standardizes
loading, error, empty, and **unauthorized** (401/403 → "session expired,
go to login") rendering for any TanStack Query result and is used by every
data-backed page.

### Mock vs. real backend

Controlled by one env var, `VITE_API_MODE` (see `.env.example`):

- `mock` (default) — every screen reads from in-memory fixtures. No backend needed.
- `api` — `leadService` and `authService` call the real backend at
  `VITE_API_BASE_URL` instead. Every other service stays on mock data (only
  Lead Management + login were wired up in this pass — see
  [Known limitations](#known-limitations)).

To add a real implementation for another service, follow the same pattern as
`leadService.ts`: keep the existing interface, add an `Api*Service` class
that calls `apiRequest`, and pick between them based on `env.apiMode`.

## Known limitations

- The access token from a real login is held **in memory only**
  (`src/lib/tokenStore.ts`) — never localStorage/sessionStorage. A page
  refresh clears it and the user must log in again. This was a deliberate
  trade-off to avoid writing a bearer token to any browser-readable storage
  in this pass; a production build should move to an httpOnly cookie issued
  by the backend instead.
- Dashboard routes are not yet gated behind login — there's no route guard
  redirecting an unauthenticated user away from `/dashboard`, `/leads`, etc.
  Add one once real auth is the only path into the app.
- Only Lead Management is wired to the real backend. Customer Profiles,
  Financial Assessments, and Recovery Plans still read mock data even when
  `VITE_API_MODE=api` — the backend has endpoints for some of this
  (`GET /customers/:bbsLeadId`, `GET /assessments/:bbsLeadId`) but no frontend
  screen calls them yet, per this task's scope.
- Visual design of the dashboard pages is intentionally neutral (default
  shadcn/ui neutral theme) — restyle via `src/index.css` and `components.json`
  once real designs arrive.
- `npm run build` currently emits a single ~945 KB JS chunk (Recharts +
  Radix + Router). Fine for this stage; consider route-based code-splitting
  once real screens are added.
- `src/assets/login/promo-illustration.png` is ~1.6 MB (the untouched Figma
  source at 1536×1024). Worth converting to WebP/AVIF before shipping to
  production.

---

# Backend

NestJS REST API + PostgreSQL (via Prisma). Lives entirely in `backend/` and
does not share a `node_modules`, `package.json`, or build config with the
frontend.

- NestJS 11 + TypeScript
- PostgreSQL 17, via Docker Compose for local dev
- Prisma ORM, with migrations
- Passport JWT auth (access + refresh tokens), bcrypt password hashing,
  role-based access control (CCR / SUPERVISOR / ADMIN)
- class-validator/class-transformer request validation on every endpoint
- Swagger/OpenAPI docs
- Helmet + restrictive CORS

> **Why NestJS 11, not 12:** NestJS 12 dropped CommonJS entirely
> (`@nestjs/common`'s `package.json` now says `"type": "module"`). That
> breaks straightforward interop with `ts-jest`, `ts-node`, and this
> project's `@/` path aliases without a much larger rework (full ESM
> migration: explicit `.js` extensions on every relative import, an ESM-only
> Jest config, etc.). NestJS 11.2.6 is the latest release before that jump
> and is a fully supported, actively-used major version — the safer choice
> for a foundation. Revisit once the ecosystem (and this repo's tooling)
> has finished moving to ESM.
>
> **Why Prisma 6, not 7:** Prisma 7's CLI was rebuilt around Prisma's own
> hosted "Developer Platform" (`prisma auth login`, Projects, Branches,
> `prisma deploy`) — commands like `prisma migrate dev` / `prisma generate` /
> `prisma studio` no longer exist under those names. That's a poor fit for a
> local-only, no-cloud-account-required setup like this one. Prisma 6.19.3
> is the latest release on the classic, fully local CLI this README documents.

## 1. Start Docker

Make sure Docker Desktop is running (check for the whale icon in your system
tray, or run the command below — it should print a version, not an error):

```powershell
docker --version
```

## 2. Configure environment variables

```powershell
cd backend
Copy-Item .env.example .env
```

Open `backend/.env` and replace the placeholder values — at minimum
`POSTGRES_PASSWORD` (and keep `DATABASE_URL`'s password in sync with it),
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Generate real local secrets with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

`backend/.env` is git-ignored — never commit it.

## 3. Start PostgreSQL

```powershell
cd backend
docker compose up -d
docker compose ps   # should show "healthy" once ready
```

This starts a single Postgres 17 container, bound to `127.0.0.1` only (not
reachable from the network), with a named volume (`bbs_ccr_postgres_data`)
so data survives restarts.

**Stop it** (keeps data): `docker compose stop`
**Start it again**: `docker compose start`
**Stop and remove the container** (keeps data — the named volume survives):
`docker compose down`
**Full reset — deletes all local data**, only when you explicitly want to:
`docker compose down -v`

This project never runs `down -v` automatically. Nothing about starting the
app resets the database.

## 4. Install dependencies & run migrations

```powershell
cd backend
npm install
npm run prisma:migrate:dev
```

`prisma:migrate:dev` creates the database schema (and, on later runs, applies
any new migrations) against the Postgres container from step 3.

## 5. Seed fictional test data + a development CCR account

```powershell
npm run seed
```

This creates, all from `backend/.env` values and entirely fictional:

- one **CCR** login (`DEV_SEED_CCR_EMAIL` / `DEV_SEED_CCR_PASSWORD`)
- one **SUPERVISOR** login (`DEV_SEED_SUPERVISOR_EMAIL` / `..._PASSWORD`) —
  needed to exercise the `assign` endpoint, which is supervisor/admin-only
- one fictional lead (`BBS-LD-900001`) with a mock credit report and Level 1
  assessment attached

The script refuses to run if `NODE_ENV=production`. **Never** set these env
vars, or run this script, against a production database.

### Development login

Once seeded, log in against the API with (replace with whatever you put in
`backend/.env`):

```powershell
curl.exe -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{ \"email\": \"ccr.dev@bbs.example.test\", \"password\": \"DevOnly-Passw0rd-2026\" }'
```

This returns `{ accessToken, refreshToken, user }`. There is no public
self-registration endpoint — every account is created via the seed script
(dev) or, eventually, an admin-only user-management flow (not built yet).

## 6. Start the backend

```powershell
npm run start:dev
```

- API base: `http://localhost:3001/api`
- Swagger/OpenAPI docs: `http://localhost:3001/api/docs`
- Health check: `http://localhost:3001/api/health`

## 7. Start the frontend against the real backend

In the repo root (not `backend/`):

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```
VITE_API_BASE_URL=http://localhost:3001/api
VITE_API_MODE=api
```

Then `npm run dev` as usual. Lead Management and the login screen now talk
to the real backend; every other screen still reads mock data (see
[Known limitations](#known-limitations)).

## Backend commands

| Command                       | Description                                      |
| ------------------------------ | ------------------------------------------------- |
| `npm run start:dev`             | Start the API with watch mode                    |
| `npm run build`                 | Compile to `dist/`                                |
| `npm start`                     | Run the compiled `dist/main.js`                   |
| `npm run lint`                  | ESLint                                            |
| `npm test`                      | Unit tests (Jest, no DB needed — Prisma is mocked)|
| `npm run test:e2e`              | End-to-end tests (needs the DB running)           |
| `npm run prisma:generate`       | Regenerate the Prisma Client after a schema change|
| `npm run prisma:migrate:dev`    | Create/apply a migration in dev                   |
| `npm run prisma:migrate:deploy` | Apply existing migrations (non-interactive)       |
| `npm run prisma:studio`         | Open Prisma Studio (a DB browser) at localhost:5555|
| `npm run seed`                  | Run the development seed script                  |

## Database schema

See `backend/prisma/schema.prisma` — every model has a doc comment explaining
its purpose. Highlights:

- **Every** lead-journey record traces back to `Lead.bbsLeadId` — a stable,
  unique, human-facing ID (e.g. `BBS-LD-100231`), generated server-side.
- No raw PAN is ever stored. `Customer.panRef` is an opaque reference token
  into a separate protected identifier store (not built in this pass — the
  schema reserves the field so a real implementation has somewhere to point
  to) — never the PAN itself, and never a primary key.
- Raw documents (bureau PDFs, bank statements) are never modeled as bytes in
  the database. `DocumentMetadata` holds only a private storage reference
  (e.g. an S3 key behind a signed-URL service) + metadata; every read is
  recorded in `DocumentAccessLog`.
- `FinancialAssessment` (Level 1 + 2) and `CustomerProfile` (Level 3) are
  **append-only** — a new row is inserted with `version` incremented rather
  than overwriting a prior, possibly CCR-verified, row.
- `AnalysisResult` (raw AI output) is a separate table from
  `FinancialAssessment` / `CustomerProfile` / `CohortDecision` (the
  deterministic, CCR-verified records of truth) — an AI provider's output is
  advisory input, never itself the final record.

## API endpoints (v0.1)

All under `http://localhost:3001/api`. Full request/response schemas are in
Swagger (`/api/docs`). Every endpoint requires a bearer token
(`Authorization: Bearer <accessToken>`) **except** `POST /auth/login`,
`POST /auth/refresh`, and `GET /health`.

| Method | Path                          | Notes                                    |
| ------ | ----------------------------- | ----------------------------------------- |
| GET    | `/health`                     | Public. DB connectivity check.            |
| POST   | `/auth/login`                 | Public.                                   |
| POST   | `/auth/refresh`                | Public. Rotates the refresh token.        |
| GET    | `/auth/me`                     | The authenticated user.                  |
| POST   | `/leads`                       | Create a lead (auto-generates `bbsLeadId`)|
| GET    | `/leads`                       | Paginated list — `page`, `pageSize`, `search`, `source`, `level1Status`, `city`, `assignedCcrId` |
| GET    | `/leads/:bbsLeadId`            |                                            |
| PATCH  | `/leads/:bbsLeadId`            | Only `fullName`/`phone`/`email`/`city`/`notes` |
| POST   | `/leads/:bbsLeadId/assign`     | **Supervisor/admin only**                |
| GET    | `/customers/:bbsLeadId`        | Customer details via the lead's BBS Lead ID |
| GET    | `/assessments/:bbsLeadId`      | Latest L1/L2/L3 status + data             |
| POST   | `/analysis/jobs`               | Queue an AI analysis job (provider per `AI_PROVIDER`) |
| GET    | `/analysis/jobs/:jobId`        | Job status + result once completed        |

The public BBS website has no route to any of these — this API isn't linked
from, and doesn't share auth with, the public site.

## AI provider architecture

`backend/src/modules/analysis/providers/ai-provider.interface.ts` defines a
provider-independent contract (`AiAnalysisProvider`) plus typed
request/response shapes for every AI-assisted job type (Debt Analysis,
Financial Analysis, Master Profile, and Recovery Plan narrative insights).
Three implementations are wired up in `analysis.module.ts`, selected at boot
by `AI_PROVIDER` (`mock` | `gemini` | `claude`, defaulting to `mock`):

- **`MockAiProvider`** — returns clearly labeled synthetic findings, never
  calls an external service. The safe default for a fresh clone.
- **`GeminiAiProvider`** — real Google Gemini integration (plain REST, no
  SDK). Kept available as a documented rollback option, not actively used.
- **`ClaudeAiProvider`** — real Anthropic Claude integration via the
  Messages API (plain REST, no SDK), the active configured provider. Reuses
  the exact same prompt builders and JSON-output parsers `GeminiAiProvider`
  uses (see `gemini-ai-provider.ts`) — both real providers are grounded in
  identical guardrail language and validated by identical parsers, so
  switching `AI_PROVIDER` never changes a module's output *shape*, only
  which model produced it.

Switching providers is a one-line env change (`AI_PROVIDER=claude`); nothing
else (the job-persistence flow, the API surface, any module's deterministic
calculations) needs to change. AI output always lands in `AnalysisResult`,
kept separate from the deterministic, CCR-verified assessment/cohort/plan
tables — an AI provider only ever interprets and explains numbers a module
already computed, it never recomputes a ratio, assigns a cohort, or
overrides a deterministic field.

Both real providers validate their own HTTP response shape (auth failures,
rate limits, timeouts, malformed/truncated bodies all raise a typed
`AiProviderError` subclass) and never log an API key, auth header, or raw
prompt/response body — see each provider's own `.spec.ts` for the full
contract-test coverage, including the parser-level guarantee that a
malformed or truncated structured response can never leak as a raw JSON
string into a user-facing narrative field (a real defect found and fixed
via live testing — see `parseModelJson`'s doc comment in
`gemini-ai-provider.ts`).

## Security & privacy notes

- Environment-based config, validated at boot (`src/config/env.validation.ts`)
  — the app refuses to start with missing/malformed config rather than fail
  confusingly on the first request.
- CORS is restricted to an explicit allow-list (`CORS_ORIGINS`), not `*`.
- Helmet sets standard security headers.
- Every request body is validated (`class-validator`) and unknown fields are
  rejected (`whitelist` + `forbidNonWhitelisted`).
- Passwords are hashed with bcrypt; refresh tokens are stored as a SHA-256
  hash, never in plaintext.
- Every error response goes through one exception filter that never leaks a
  stack trace, driver error, or config value — only the server log gets that
  detail.
- Sensitive actions (login success/failure, lead creation/update/assignment)
  are written to `AuditLog`.
- **This local setup is not production-ready for real financial documents.**
  In particular: `Customer.panRef` and `DocumentMetadata.storageRef` are
  schema placeholders for a protected identifier vault / private object
  store — neither is actually implemented here. Do not point this backend
  at real PAN numbers, credit reports, or bank statements.
- A known, low-severity dev-tooling advisory (`deepmerge-ts`, via
  `@prisma/config`, only reachable through the Prisma CLI itself — not
  through any code this API executes at runtime) shows up in `npm audit`.
  Fixing it means downgrading Prisma further; left as-is and documented here
  rather than done silently.

## Troubleshooting (Windows / PowerShell)

- **`docker: command not found` / `docker compose` errors** — Docker Desktop
  isn't running. Start it from the Start menu and wait for the whale icon in
  the system tray before retrying.
- **Port 5432 already in use** — another Postgres (a native Windows install,
  or a different project's container) is already listening on it. Either
  stop that service, or change `POSTGRES_PORT` in `backend/.env` (and the
  port in `DATABASE_URL`) to something free, e.g. `55432`.
- **`prisma migrate dev` hangs or times out** — check `docker compose ps`
  shows the container as `healthy`, not just `running`. If it's stuck
  starting, check `docker compose logs postgres`.
- **PowerShell line continuation** — multi-line commands in this README use
  the backtick (`` ` ``) as PowerShell's line-continuation character. If
  you're in Git Bash instead, use `\` and single quotes for JSON bodies.
- **`npm run seed` fails with a missing-env-var error** — make sure you
  copied `backend/.env.example` to `backend/.env` and filled in the
  `DEV_SEED_*` values; the script deliberately refuses to guess them.
- **Port 3001 already in use** — set `PORT` in `backend/.env` to something
  else, and update `VITE_API_BASE_URL` in the frontend's `.env` to match.
