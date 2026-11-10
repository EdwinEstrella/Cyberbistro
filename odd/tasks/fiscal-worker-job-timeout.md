# Feature: fiscal-worker-job-timeout

## Objective
Prevent the serial Node.js fiscal worker (`FiscalWorkerRuntime` / `FiscalWorker`) from hanging indefinitely on unhandled upstream DGII calls. Ensure that individual jobs timeout cleanly and back off via existing retry logic, provide honest status labels and delay hints in the billing UI, and reliably persist DGII observations (`dgii_messages`) across polling cycles.

## Scope
1. **Worker Job Timeout (T1)**: Pure `withTimeout` helper, wrap `submit` / `pollStatus` in `FiscalWorker.processJob` with configurable `jobTimeoutMs` (default 120,000ms), runtime second line of defense in `FiscalWorkerRuntime.runForever` (`jobTimeoutMs + 30_000ms`), minimal `onError` logging in `runFiscalWorker.ts`.
2. **Honest Status Labels (T2)**: Disambiguate `queued` ("e-CF: En cola de firma") and `signed` ("e-CF: Firmada, enviando a la DGII") in `src/features/billing/components/Billing.tsx` and extract pure helper `src/features/billing/lib/ecfStatusDisplay.ts`.
3. **Delay Hint (T3)**: In the billing invoices table, if an e-CF document is in status `queued` or `signed` and older than 5 minutes, append "Demorada: si sigue así avisá a soporte".
4. **Persist DGII Observations (T4)**: Add additive migration `supabase/migrations/20261110170000_ecf_documents_dgii_messages.sql` (NOT applied locally/remote), normalize DGII `mensajes` in `worker/fiscal/dgiiAdapters.ts`, persist in `postgresFiscalWorkerRepository.ts` as `dgii_messages` jsonb without overwriting prior observations on empty poll results.

## Decisions (Single Source of Truth)
- **Timeout Values**:
  - `jobTimeoutMs` default: 120_000ms (2 minutes).
  - Configurable via `process.env.FISCAL_JOB_TIMEOUT_MS` (positive integer; fallback to default if invalid/missing).
  - Runtime loop wrapper timeout: `jobTimeoutMs + 30_000ms` (2 minutes 30 seconds default).
- **Timeout Error Handling**:
  - Worker timeout throws `fiscalWorkerError("JOB_TIMEOUT", "Fiscal job exceeded <n>s and was aborted; it will be retried.", true)`.
  - Existing `failJob` flow transitions job to `retryable_error` with exponential backoff and increments `attempts`.
  - Existing guard prevents downgrading documents that already reached `accepted` or `rejected`.
  - Runtime second-line timeout catches any hung job that escapes `processJob`, logs via `onError`, and loops to the next job.
  - `runFiscalWorker.ts` logs a one-line concise error: never logs XML, certs, or secrets.
- **Pure `withTimeout` Helper**:
  - File: `worker/fiscal/withTimeout.ts`.
  - Signature: `withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T>`.
  - Uses relative ESM imports (no path aliases).
  - Clears its timer in `finally`; leaves no unref'd or dangling timers.
- **Status Labels & Delay Hint**:
  - `queued` -> "e-CF: En cola de firma"
  - `signed` -> "e-CF: Firmada, enviando a la DGII"
  - Other statuses (`pending_offline`, `pending_sync`, `submitted`, `accepted`, `rejected`, `retryable_error`, `terminal_error`) remain unchanged.
  - Delay hint pure function: `shouldShowEcfDelayHint(status: string, timestamp?: string | Date | null, now?: Date | number): boolean`. Returns true only if status is `queued` or `signed` and `(now - timestamp) > 5 * 60 * 1000`. Missing timestamp or `<= 5 min` returns false.
  - Delay hint copy: "Demorada: si sigue así avisá a soporte".
- **DGII Messages Persistence**:
  - Migration file: `supabase/migrations/20261110170000_ecf_documents_dgii_messages.sql` (additive, idempotent `ALTER TABLE public.ecf_documents ADD COLUMN IF NOT EXISTS dgii_messages jsonb;` + COMMENT). Note: migration must be applied to production before deploying the updated worker.
  - Normalization helper: `normalizeDgiiMessages(mensajes: unknown): Array<{ code: string | null; text: string }>`. Accepts strings and objects with `codigo`/`valor`/`mensaje`, ignores empty entries.
  - Persistence: Update whitelist in `postgresFiscalWorkerRepository.ts` writes `dgii_messages = $N::jsonb`. `persistSubmissionResult` and `persistPollResult` only set `dgiiMessages` if the normalized list is non-empty (`length > 0`).

## Tasks
- [x] **T1**: Bounded job execution in worker & runtime
  - [x] Pure helper `worker/fiscal/withTimeout.ts` with timer clearing in `finally`.
  - [x] `FiscalWorker.processJob` wraps `submit`/`pollStatus` with `jobTimeoutMs` (default 120_000ms), throwing `JOB_TIMEOUT`.
  - [x] `createFiscalWorkerRuntimeFromEnv` reads `FISCAL_JOB_TIMEOUT_MS`.
  - [x] `FiscalWorkerRuntime.runForever` second line of defense (`jobTimeoutMs + 30_000ms`), handles error via `onError`, loop continues.
  - [x] `runFiscalWorker.ts` logs one-line error without leaking secrets/certs.
  - [x] Vitest unit tests in `test/fiscal-worker-processing.test.ts` for timeout scenarios, unblocked runtime loop, timer cleanup.
- [x] **T2**: Honest status labels
  - [x] Extract `src/features/billing/lib/ecfStatusDisplay.ts` with `getEcfStatusDisplay`.
  - [x] Update `queued` -> "e-CF: En cola de firma", `signed` -> "e-CF: Firmada, enviando a la DGII".
  - [x] Search repo for other occurrences of "pendiente de firma" and align.
  - [x] Unit tests in `src/features/billing/lib/ecfStatusDisplay.test.ts`.
- [x] **T3**: Visible delay hint
  - [x] Pure helper `shouldShowEcfDelayHint` in `src/features/billing/lib/ecfStatusDisplay.ts`.
  - [x] Unit tests for boundaries (exactly 5m, <5m, >5m, missing timestamp).
  - [x] Render delay hint in `Billing.tsx` invoices table (mobile & desktop views).
- [x] **T4**: Always persist DGII observations
  - [x] Migration file `supabase/migrations/20261110170000_ecf_documents_dgii_messages.sql` (not applied).
  - [x] Pure exported helper `normalizeDgiiMessages` in `worker/fiscal/dgiiAdapters.ts`.
  - [x] Add `messages?` to `DgiiSubmitResult` and `DgiiPollResult` in `worker/fiscal/types.ts`.
  - [x] Whitelist `dgiiMessages: "dgii_messages"` with `$N::jsonb` in `postgresFiscalWorkerRepository.ts`.
  - [x] Persist non-empty messages in `persistSubmissionResult` / `persistPollResult` without clobbering earlier observations on empty poll.
  - [x] Unit tests in `test/fiscal-worker-adapters.test.ts` and `test/fiscal-worker-repository.test.ts`.

## Acceptance Criteria
- A hung DGII call aborts after `jobTimeoutMs` and transitions the job to `retryable_error` with exponential backoff.
- If `processJob` itself hangs past `jobTimeoutMs + 30_000ms`, the runtime logs the error and proceeds to the next iteration.
- `queued` invoices show "e-CF: En cola de firma", `signed` invoices show "e-CF: Firmada, enviando a la DGII".
- Invoices in `queued` or `signed` older than 5 minutes display "Demorada: si sigue así avisá a soporte".
- DGII observations (`mensajes`) are normalized and persisted as jsonb without being overwritten by subsequent empty polls.
- All vitest suites and `npm run typecheck` pass cleanly.

## Checks
- `npm run typecheck`
- `npx vitest run test/fiscal-worker-processing.test.ts test/fiscal-worker-adapters.test.ts test/fiscal-worker-repository.test.ts test/fiscal-worker-esm-imports.test.ts`
- `npx vitest run src/features/billing/lib/ecfStatusDisplay.test.ts`
