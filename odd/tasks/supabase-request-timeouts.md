# Feature: Supabase Request Timeout Policy + E2E Flaky Run Root Causes

## Objective
Establish a granular, method- and path-aware request timeout policy for Supabase network calls (preserving 6s fail-fast for reads while allowing 20s for auth and mutations), throw descriptive `SupabaseRequestTimeoutError` instances on timeout, map abort and timeout errors to friendly Spanish connectivity messages, and configure a 120s timeout on the long `nomina` Playwright E2E journey.

## Problem
1. `src/shared/lib/supabase.ts` `customFetch` currently enforces an indiscriminate 6,000 ms timeout for all requests via `controller.abort()` with no reason. On slow links, auth sign-in (`/auth/v1/token`) exceeds 6 s and is aborted without explanation; the login form then displays the raw JavaScript error `"signal is aborted without reason"`.
2. `formatSupabaseConnectivityError` in `src/shared/lib/supabase.ts` only matches `/failed to fetch|network|timeout|dns|connection/`, ignoring abort signals and timeout error objects, so raw technical errors leak directly to users.
3. The 6 s timeout was originally introduced (engram #3588) to prevent 15–20 s UI freezes during cloud downtime. While reads must remain fast so views fall back promptly to local SQLite data, writes and authentication operations need higher tolerance (20 s) to complete under latency.
4. `test/nomina.e2e.spec.ts` is a comprehensive end-to-end journey running under the global 30 s Playwright timeout. It occasionally gets terminated at the final step (e.g. screenshot), forcibly closing the browser and cascading failures into following tests.

## Scope
- `src/shared/lib/supabaseRequestTimeout.ts`: New pure module exporting timeout constants, `resolveSupabaseRequestTimeoutMs`, and `SupabaseRequestTimeoutError`.
- `src/shared/lib/supabase.ts`: Update `customFetch` to resolve dynamic timeouts, abort with `SupabaseRequestTimeoutError`, rethrow timeout errors upon timer expiration, forward caller aborts untouched, export `supabaseFetchWithTimeout`, and enhance `formatSupabaseConnectivityError` to handle timeouts and aborts.
- `src/features/auth/components/RegisterForm.tsx` & `src/features/soporte/components/Soporte.tsx`: Route raw `supabase.auth.*` error messages through `formatSupabaseConnectivityError`.
- `test/nomina.e2e.spec.ts`: Configure suite timeout to 120,000 ms via `test.describe.configure({ timeout: 120_000 })`.
- `src/shared/lib/supabaseRequestTimeout.test.ts`: Unit test suite covering resolver rules, customFetch abort/timeout behavior with fake timers, caller signal abort preservation, and error message formatting.

## Constraints
- English for code, comments, tests, and documentation. User-facing Spanish copy remains Spanish (neutral).
- Do not push branch to remote.
- Exactly one Conventional Commit per task (T1..T4); tests must be included in the same commit as behavior.
- Never weaken, skip, or delete existing assertions.
- Do not add Playwright `retries`.
- Preserve the existing `isDesktopCloudUnavailable()` fail-fast mechanism in `customFetch`.
- No `Co-Authored-By` or AI attribution in commit messages.

## Checklist
- [ ] **T1**: Implement `supabaseRequestTimeout.ts`, update `customFetch` in `supabase.ts`, export `supabaseFetchWithTimeout`, and add unit tests.
- [ ] **T2**: Enhance `formatSupabaseConnectivityError` for timeouts and aborts, route raw auth error messages in `RegisterForm.tsx` and `Soporte.tsx`, and add unit tests.
- [ ] **T3**: Add `test.describe.configure({ timeout: 120_000 });` to `test/nomina.e2e.spec.ts`.
- [ ] **T4**: Update documentation with commit hashes, test results, and close feature document.

## Acceptance Criteria
- `/auth/v1/*` endpoints resolve to a 20,000 ms timeout regardless of HTTP method.
- Read operations (GET, HEAD, undefined) resolve to a 6,000 ms timeout.
- Mutation operations (POST, PUT, PATCH, DELETE, including `/rest/v1/rpc/*`) resolve to a 20,000 ms timeout.
- `customFetch` aborts with `SupabaseRequestTimeoutError` (name `"TimeoutError"`) when the timer fires, rethrowing it cleanly.
- If caller provides their own `AbortSignal` and triggers an abort, the caller's original rejection is rethrown unchanged.
- `formatSupabaseConnectivityError` maps `SupabaseRequestTimeoutError`, `TimeoutError`, `AbortError`, and messages matching `/abort|timed out/` to `'No se pudo conectar con Supabase. Comprobá tu conexión a internet o el estado del backend.'`.
- `test/nomina.e2e.spec.ts` has a configured timeout of 120,000 ms.
- All unit tests, typechecks, and renderer builds pass cleanly.

## Checks
- `npm run typecheck`
- `npx vitest run --config vitest.config.ts src/shared/lib/supabaseRequestTimeout.test.ts src/shared/lib/supabase`
- `npm test`
- `npm run build`

## Progress
Pending review.

## Verification evidence
Pending.
