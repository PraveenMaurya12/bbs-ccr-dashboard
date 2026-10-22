# Deploying the public contact form → CCR Dashboard integration

This documents what deploying this backend (and pointing the public
bade-bhaisab site at it) actually requires. **Nothing here has been
deployed** — this is the configuration a real deployment needs, prepared so
it can be reviewed and applied deliberately, not auto-applied.

## Current state

- The public site (`bade-bhaisab`) is already deployed at
  `https://bade-bhaisab.onrender.com`, built with no `VITE_API_BASE_URL`
  configured — so its deployed build still uses the local-only mock OTP
  service and never calls any backend (see `src/lib/env.ts`).
- This backend (`bbs-ccr-dashboard/backend`) is **not deployed anywhere**.
  There is no `render.yaml`, no existing Render service, no deployed
  database beyond the local Docker Postgres used for development.

Connecting the live form to the CCR dashboard's Leads pipeline requires
deploying this backend and rebuilding/redeploying the public site with
`VITE_API_BASE_URL` pointed at it — two separate deploys, not a
dashboard-only change.

## 1. Backend — Render Web Service

- **Runtime**: Node
- **Build command**: `npm install && npm run build && npx prisma generate`
- **Start command**: `npm run prisma:migrate:deploy && npm run start`
  (runs pending migrations against the production database before starting;
  never `prisma migrate dev` in production — it can prompt interactively).
- **Health check path**: `/api/health`

### Required environment variables

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Render sets this automatically; the app reads `process.env.PORT` via `PORT`. |
| `DATABASE_URL` | Connection string for a **production** Postgres instance (a Render Postgres add-on, or another managed Postgres) — never the local dev database. |
| `CORS_ORIGINS` | The CCR dashboard's deployed origin(s), comma-separated. |
| `TRUST_PROXY_HOPS` | **`1`** — a Render Web Service sits behind exactly one trusted edge-proxy hop, which is what sets the real visitor IP into `X-Forwarded-For`. Used for `ConsentRecord.ipAddress` and other audit/security client-IP capture (see `common/http/client-ip.ts`) only — it has no effect on Signzy, whose `consent.consentIpAddress` is a separate, permanently fixed value (`192.168.5.90`, see `SIGNZY_FIXED_REQUEST_VALUES` in `signzy-http-client.ts`) sent unconditionally regardless of this or any other environment setting. |
| `PUBLIC_SITE_ORIGINS` | `https://bade-bhaisab.onrender.com` (the public site's real deployed origin — the only one the public `/api/public/contact/*` routes need to accept). |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Long random values, generated fresh for production — never reused from `.env`/dev. |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Same values as dev unless product wants different session lengths. |
| `BCRYPT_SALT_ROUNDS` | `12` (unchanged from dev). |
| `PUBLIC_OTP_TICKET_SECRET` | Long random value, generated fresh for production. |
| `PAN_HASH_PEPPER` | Long random value, generated fresh for production — **rotating this after go-live invalidates duplicate-detection for all PANs submitted before the rotation**, so generate it once, deliberately, and store it securely. |
| `OTP_PROVIDER` | **Must not be `mock`** — see below. |
| `DEV_SEED_*` | Omit entirely in production; the seed script is dev-only and the app does not read these at runtime. |

### Testing a real Signzy call locally

A local dev server has no reverse proxy in front of it, so `TRUST_PROXY_HOPS`
stays `0` and every request's real client IP resolves to loopback
(`::1`/`127.0.0.1`) — which Signzy rejects outright (confirmed: `HTTP 400,
reason=ERROR, message="Invalid/missing input parameter"`). BBS refuses to
even attempt the Signzy call in this case (see
`signzy-http-client.ts`'s loopback guard) rather than silently failing at
Signzy or fabricating a fake IP.

If a genuine local end-to-end Signzy test is ever needed, route the local
server through a tunnel that gives it a real public IP end-to-end (e.g.
Cloudflare Tunnel or ngrok) rather than hitting `localhost` directly — the
tunnel becomes the one trusted hop, so `TRUST_PROXY_HOPS=1` would apply
there too for that session.

### The OTP provider gap — this is the actual blocker

`MockOtpProvider` (`src/modules/public-contact/providers/mock-otp.provider.ts`)
throws on startup if `NODE_ENV=production`. This is intentional: no SMS is
ever sent by it, so it must never be what verifies a real visitor's phone
number. As of this integration, **no real SMS/OTP provider is implemented
anywhere in this codebase.**

Before this can go live, someone needs to:
1. Choose a real OTP/SMS provider (e.g. MSG91, Twilio Verify — whichever the
   business already has an account with, since this determines available
   credentials and pricing).
2. Implement `OtpProvider` (`src/modules/public-contact/providers/otp-provider.interface.ts`)
   against that provider's API.
3. Add its credentials as additional Render env vars (provider-specific —
   e.g. an API key/sender ID) and bind it in
   `PublicContactModule`'s `OTP_PROVIDER` factory alongside `mock`.
4. Only then set `OTP_PROVIDER` to that provider's name in production.

Until that exists, this backend **cannot** be safely deployed with
`NODE_ENV=production` — it will refuse to boot, by design, rather than
silently accept OTP codes nobody's phone actually received.

## 2. Public site — Render Static Site rebuild

The public site's existing Render deploy needs one added build-time
environment variable, then a rebuild (Vite inlines env vars at build time,
so this requires a new build/deploy, not a config-only change):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<the-backend-service>.onrender.com/api` — the backend's real deployed URL from step 1. |

No other change to the public site's deploy is needed — `src/lib/otpService.ts`
already switches to the real `HttpOtpService` whenever this variable is set
(see its source for the exact fallback logic), and `src/pages/Contact.tsx`
already calls the real submit endpoint once OTP is genuinely verified.

## Rollout order

1. Deploy the backend first (with a real `OTP_PROVIDER`, not `mock`) and
   confirm `GET /api/health` on its deployed URL.
2. Add `VITE_API_BASE_URL` to the public site's Render service and trigger
   a rebuild.
3. Do a single real end-to-end test against production with a real phone
   number under the team's control before considering this live — an
   automated test cannot verify a real SMS actually arrives.
