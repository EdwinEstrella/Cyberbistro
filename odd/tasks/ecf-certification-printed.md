# ecf-certification-printed

## Objective
DGII portal step 5 ("Pruebas de Simulacion Representacion Impresa"): generate one printed representation (PDF with
QR) per portal slot from the step-4 simulation e-CF, exactly as signed and sent, so the admin uploads them.

## Facts (verified 2026-10-18)
- Portal: 11 file inputs, `accept="application/pdf"`, one file each: ECF_31, "ECF_32 Mayor_o_Igual_250mil", ECF_33,
  ECF_34, ECF_41, ECF_43, ECF_44, ECF_45, ECF_46, ECF_47, "ECF_32 Menor_250mil". Total size <= 10MB. DGII checks the
  QR is built correctly.
- Prod (Salpimentao, run_type simulation): all 29 submissions accepted, every one has signed_xml. `security_code`
  column is only set on the 4 consumo `portal_upload` rows -> derive the code from the signed XML (first 6 chars of
  SignatureValue) when the column is null.
- `ecf-certification` action `download` (simulation) already returns signedXml + securityCode per caseId
  (portal_upload preferred over ecf). No backend change needed.
- QR URLs (modulo-ecf/src/utils/generateQRCode.ts, dgii-ecf lib):
  - standard: `https://ecf.dgii.gov.do/<env>/consultatimbre?rncemisor=&RncComprador=&encf=&fechaemision=&montototal=&fechafirma=&codigoseguridad=`
    (RncComprador omitted for E43/E47 or when absent).
  - consumo E32 < 250k: `https://fc.dgii.gov.do/<env>/consultatimbrefc?rncemisor=&encf=&montototal=&codigoseguridad=`.
  - env segment: testecf | certecf | ecf (lowercase). Certification = certecf.
- Picks: 31 E310000000011, 32>=250k E320000000016, 32<250k E320000000017, 33 E330000000002, 34 E340000000017,
  41 E410000000011, 43 E430000000013, 44 E440000000010, 45 E450000000011, 46 E460000000008, 47 E470000000009
  (first accepted per slot; computed by code, not hardcoded).

## Scope
In: pure parser (signed e-CF XML -> printable model), QR URL builder (both variants), A4 PDF builder (jspdf + qrcode),
slot selection, wizard step 5 UI (generate + download each PDF / all), tests.
Out: backend changes, deployment, production POS receipts.

## Constraints
No secrets, tenant admin only, no DGII calls from tests, do not commit pre-existing unrelated dirty files, English
artifacts / Spanish UI, no AI attribution in commits.

## Route
Delegated direct (writer trigger: 2+ non-trivial files). Stacked on feat/ecf-certification-simulation.

## TDD
Mode: off (project convention, see previous ecf features). Runner: `npx vitest run`, `npm run typecheck`.

## Tasks
- [x] T1 Lib: parse signed XML, QR URL builder, slot picker, PDF builder (jspdf); tests. Route: delegated (writer trigger). Commit: 894d408.
- [x] T2 Wizard step 5 UI in ActivationPanel (generate from latest simulation run, download per slot + all); tests. Route: delegated (writer trigger). Commit: c85d5f8.

## Progress
- 2026-10-18 created after user approved the wizard-button approach.
- 2026-10-18 T1 done (894d408): `src/features/fiscal/lib/ecfPrintedRepresentation.ts` (parseSignedEcf, security code,
  buildPrintedQrUrl standard/FC, PRINTED_SLOTS + pickPrintedSlots, slotMismatch, file names, amount format) and
  `ecfPrintedPdf.ts` (jspdf ^4.2.1 + qrcode, A4, QR 30 mm bottom-left with code + signature date). Consumo slot =
  portal_upload ready_for_portal whose RFCE (same caseId) is accepted. Evidence: `npm run typecheck` clean;
  `npx vitest run src/features/fiscal/lib/ecfPrintedRepresentation.test.ts` 21 passed; sample PDFs ~7 KB, accents
  render (checked visually).
- 2026-10-18 T2 done (c85d5f8): `PrintedRepresentationRunner.tsx` replaces the step-5 placeholder in ActivationPanel:
  loads the latest simulation run (`latest`), downloads each picked case (`download`), builds the PDFs
  (`ecfPrintedDocuments.ts`: buildPrintedDocument, size helpers, Spanish errors), lists the 11 slots with e-NCF,
  status, copyable QR URL, per-slot and sequential "Descargar todos" downloads, total size with > 10 MB warning.
  Download helper extracted to `lib/saveFile.ts` and reused by TestSetRunner. Guards: same as step 4 (server-side
  FORBIDDEN for non-admins). No component test: the repo has no DOM test environment (node env; FiscalPanel test
  mocks React hooks); logic covered by pure tests. Evidence: `npm run typecheck` clean; `npx vitest run
  src/features/fiscal` 8 files / 76 passed; full `npx vitest run` 184 files passed, 1 skipped (1325 passed,
  2 skipped); `npx vite build` succeeded with jspdf.

- 2026-10-18 Compliance fix vs Informe Técnico e-CF v1.0 §18 (read from the DGII PDF): paper size is free (sheet or
  continuous roll; no 80 mm requirement); QR must start >= 2 cm from the sheet edge with a 3 mm margin, min 22x22 mm
  -> QR moved from 15 mm to 23 mm offset; ITBIS column must show the per-line ITBIS amount -> itemItbisAmount
  (MontoItem x rate, or extracted when IndicadorMontoGravado=1); exempt lines prefixed "E". Evidence: typecheck
  clean; `npx vitest run src/features/fiscal` 80 passed.

- 2026-10-18 User uploaded the A4 PDFs in portal step 5; portal advanced to step 6 (manual DGII review). The 80 mm
  roll layout was discussed and deferred: the spec allows both sheet and continuous paper and does not require the
  certified format to match production; build it only if DGII asks or for the POS e-CF receipt.

## Next step
Manual check in the app against the real Salpimentao simulation run (generate, inspect PDFs, scan a QR against
certecf), then upload the 11 PDFs in the DGII portal step 5. Push/PR are the user's decision.
