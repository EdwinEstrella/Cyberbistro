# DGII e-CF real test handoff

This note preserves the current e-CF integration status and the exact next steps for when the DGII test certificate files are available.

## Current status

The local fiscal integration has been hardened against `facturacion_electronica.md` and the `dgii-ecf` package examples.

Implemented and verified:

- DGII upload file name now follows `RNCEmisor + eNCF + .xml`.
- Invalid XML namespace serialization was fixed by using `xml-js` `_attributes` instead of `@_xmlns`.
- Generated XML fails closed before signing if required tags are missing.
- eNCF values must start with an allowed E-series type: `E31`, `E32`, `E33`, `E34`, `E41`, `E43`, `E44`, `E45`, `E46`, `E47`.
- Fiscal amounts must be non-negative.
- `subtotal + itbis` must equal `total` within currency rounding tolerance.
- DGII date fields now use Dominican format:
  - `FechaEmision`: `DD-MM-YYYY`
  - `FechaLimitePago`: `DD-MM-YYYY`
  - `FechaHoraFirma`: `DD-MM-YYYY HH:mm:ss`
  - timezone: `America/Santo_Domingo`
- The previously inactive `RealDgiiClient` tests now run under `test/fiscal-real-dgii-client.test.ts`.

Last verified local command:

```bash
npm test -- fiscal dgii ecf
```

Last known result:

```txt
15 test files passed
69 tests passed
```

## Blocked item

Real DGII end-to-end validation is still pending because the repo currently does not include the required DGII test credentials.

Needed files/values:

- DGII test `.p12` or `.pfx` certificate.
- Certificate passphrase.
- `RNC_EMISOR` for the certificate owner.
- Target environment: usually DGII test/certification before production.

Do not commit the certificate or passphrase.

## Suggested local `.env` entries

Use real values locally only:

```env
CERTIFICATE_NAME=your_certificate.p12
CERTIFICATE_TEST_PASSWORD=your-passphrase
RNC_EMISOR=000000000
ECF_ENVIRONMENT=certification
```

If the worker uses encrypted certificate custody, also confirm:

```env
ECF_ENCRYPTION_KEY=replace-with-a-real-non-default-secret
```

## Certificate placement

Preferred: keep the certificate outside Git-tracked paths, or in a folder ignored by `.gitignore`.

Example local-only path:

```txt
tmp/dgii-certificates/your_certificate.p12
```

Before running any real test, verify Git will not track it:

```bash
git status --short tmp/dgii-certificates
```

## Real validation checklist

- [ ] Add the `.p12`/`.pfx` locally without committing it.
- [ ] Add passphrase and RNC to local `.env`.
- [ ] Validate certificate parsing with `P12Reader`.
- [ ] Generate an E31 XML and confirm it includes buyer RNC/name.
- [ ] Generate an E32 XML and confirm RFCE summary routing for totals below the threshold.
- [ ] Sign XML with `Signature.signXml(...)`.
- [ ] Send to DGII test/certification with `sendElectronicDocument(...)` or `sendSummary(...)`.
- [ ] Poll status with `statusTrackId(...)`.
- [ ] Save DGII response evidence: track ID, status code/message, eNCF, timestamp.

## Files touched in the local hardening pass

- `worker/fiscal/dgiiAdapters.ts` — DGII file naming and fail-closed behavior.
- `worker/fiscal/mapper.ts` — XML namespace, fiscal validations, and DGII date formatting.
- `test/fiscal-worker-adapters.test.ts` — fail-closed coverage.
- `test/fiscal-real-dgii-client.test.ts` — active RealDgiiClient coverage.

## Next step

When the certificate and passphrase are available, run a real DGII test/certification submission and record the result here or in a new dated evidence file.
