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
- [ ] T2 Wizard step 5 UI in ActivationPanel (generate from latest simulation run, download per slot + all); tests. Route: delegated (writer trigger).

## Progress
- 2026-10-18 created after user approved the wizard-button approach.
- 2026-10-18 T1 done (894d408): `src/features/fiscal/lib/ecfPrintedRepresentation.ts` (parseSignedEcf, security code,
  buildPrintedQrUrl standard/FC, PRINTED_SLOTS + pickPrintedSlots, slotMismatch, file names, amount format) and
  `ecfPrintedPdf.ts` (jspdf ^4.2.1 + qrcode, A4, QR 30 mm bottom-left with code + signature date). Consumo slot =
  portal_upload ready_for_portal whose RFCE (same caseId) is accepted. Evidence: `npm run typecheck` clean;
  `npx vitest run src/features/fiscal/lib/ecfPrintedRepresentation.test.ts` 21 passed; sample PDFs ~7 KB, accents
  render (checked visually).

## Next step
T2.
