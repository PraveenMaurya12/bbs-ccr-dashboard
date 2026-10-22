/**
 * Runs before any e2e test file loads AppModule. Forces mock providers
 * regardless of whatever CREDIT_REPORT_PROVIDER/AI_PROVIDER is set to in the
 * real `.env` (e.g. 'experian'/'gemini' for live manual testing) — dotenv
 * (used internally by @nestjs/config's ConfigModule.forRoot) never
 * overwrites an already-set process.env value, so setting these here first
 * wins.
 *
 * Root cause this fixes: on 2026-09-30, running `npm run test:e2e` while
 * `.env` had real Experian/Gemini credentials configured (for an
 * explicitly authorized live manual test) caused bureau.e2e-spec.ts — whose
 * own doc comment already assumed "no live Experian/Gemini call is ever
 * made here" — to make 8 real, unauthorized Experian calls against
 * synthetic test identities. e2e tests must never depend on what happens
 * to be in `.env` for provider selection.
 */
process.env.CREDIT_REPORT_PROVIDER = 'mock'
process.env.AI_PROVIDER = 'mock'
