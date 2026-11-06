# Feature: ajustes-sections

## Objective
Refactor `Ajustes` into a modular, tabbed settings view with category buttons in its header (using `src/shared/ui/tabs.tsx`). Integrate DGII e-CF Activation as a tab within Ajustes, embed Documentos Fiscales (`FiscalPanel`) as a tab in `Historial`, eliminate duplicated e-CF configuration fields from the billing settings, and align deep linking, routes, and role permissions.

## Problem / Why
1. `src/features/ajustes/components/Ajustes.tsx` is an monolithic 670-line file that bundles general settings, visuals, printing, fiscal legacy, and e-CF activation elements.
2. Fiscal configuration is duplicated across `Ajustes.tsx` and `ActivationPanel.tsx` (e.g. DGII environment, certificate upload, sequences, fiscal mode switching). Saving in Ajustes risks clobbering e-CF activation state or confusing users.
3. The sidebar has a separate DGII e-CF group, cluttering navigation when fiscal documents belong logically under audit/history (`Historial`) and fiscal activation belongs under configuration (`Ajustes`).
4. Non-admin roles (cajera, contabilidad) need access to fiscal documents without granting them access to administrative business settings.

## Decisions (Single Source of Truth)
- **Ajustes tabs order**:
  1. `general`: Información Básica + Identidad Visual + Vista Previa Impresión.
  2. `facturacion`: ITBIS/propina defaults, itbis_incluido_en_precio, Modo fiscal (limited to `internal_receipt` and `ncf_legacy`), Modo de respaldo, NCF legacy (B-series) tipo predeterminado + secuencias.
  3. `facturacion-electronica`: `ActivationPanel` wizard, gated by plan feature `dgii_ecf`. If not allowed by plan, show existing upsell/locked pattern.
- **e-CF settings ownership**:
  - Owned exclusively by the Activación wizard: `ecf_environment`, certificate upload, e-CF sequences/ranges (`ecf_secuencias_rangos` and E-codes in `ncf_secuencias_por_tipo`), and switching `fiscal_mode` to/from `dgii_ecf`.
  - Removed from Ajustes Facturación tab: Entorno DGII select, `CertificateUploader`, e-CF (E-code) sequence inputs, and the option to pick `dgii_ecf` in Modo fiscal.
  - When `fiscal_mode === 'dgii_ecf'`, Facturación tab displays a read-only status line ("Facturación electrónica activa — ambiente X") with a button to switch to the "Facturación electrónica" tab, and Modo fiscal select is disabled with explanation.
- **Save payload hygiene**:
  - `handleSave` in Ajustes must not write `ecf_environment`, E-code sequences, or overwrite `fiscal_mode` if it is `dgii_ecf`.
  - Extracted pure payload builder function with unit tests proving B-series sequences are preserved and e-CF fields are untouched.
- **Company data single source of truth**:
  - Wizard step 1 keeps editing issuer-only fields (`ecf_issuer_*`, email).
  - `nombre`, `rnc`, `direccion`, `telefono` are edited in General tab; in wizard step 1 they are shown read-only with a link switching to the General tab.
- **Historial tabs**:
  - `sincronizacion`: current `HistorialSync` content.
  - `fiscal`: `FiscalPanel`, gated by `dgii_ecf`.
  - URL query param support: `/historial?tab=fiscal` deep link.
- **Routes & Redirects**:
  - `/fiscal` redirects to `/historial?tab=fiscal`.
  - `/fiscal/activacion` redirects to `/ajustes?tab=facturacion-electronica`.
  - Routes keep the `dgii_ecf` gate where applicable. `routes.test.ts` updated.
- **Role navigation**:
  - Cajera and Contabilidad allowed on `/historial` to see the "Documentos fiscales" tab only; `sincronizacion` is admin-only.
  - Non-admins do NOT get access to `/ajustes`. `roleNav.ts` and tests updated.
- **Sidebar**:
  - Remove the DGII e-CF group (`Documentos Fiscales` / `Activación`) and its prefetch entries. Keep Historial and Ajustes footer buttons.
- **Ajustes decomposition**:
  - Split into tab components under `src/features/ajustes/components/`.
  - Maintain single Guardar flow for General + Facturación.

## Tasks
- [x] **T1**: Ajustes tab shell + split into General/Facturación components (no behaviour change).
- [x] **T2**: Remove duplicated e-CF settings from Facturación + pure payload builder tests.
- [x] **T3**: Activación wizard as "Facturación electrónica" tab (+ read-only company data link).
- [x] **T4**: Historial tabs + FiscalPanel tab + URL tab param.
- [x] **T5**: Routes / redirects / sidebar / roles + tests.
- [x] **T6**: Update e2e specs (`test/tenant-fiscal-settings.spec.ts`, `test/itbis-included-price.e2e.spec.ts`).

## Acceptance Criteria
- Ajustes displays Radix tabs: "General", "Facturación", and "Facturación electrónica".
- URL search param `tab` opens the corresponding tab in Ajustes and Historial.
- Facturación tab contains only B-series and non-eCF controls; e-CF controls live solely in Activación.
- When `fiscal_mode === 'dgii_ecf'`, Facturación informs the user and directs them to the Activación tab.
- Company data (`nombre`, `rnc`, `direccion`, `telefono`) in Activación step 1 is read-only with a direct tab switch to General.
- Historial has "Sincronización" (admin-only) and "Documentos fiscales" (gated by `dgii_ecf`, accessible to contabilidad/cajera).
- Redirects from legacy `/fiscal` and `/fiscal/activacion` work seamlessly.
- All TypeScript typechecks, Vitest tests, and renderer builds pass cleanly.

## Checks
- `npm run typecheck`
- `npx vitest run src test`
- `npm run build`

## Commits
| Task | Hash | Message |
|------|------|---------|
| T0   | e211384 | docs: add task plan for ajustes sections refactor |
| T1   | 177f260 | refactor(ajustes): split settings into tabs shell and general/facturacion components |
| T2   | 1332d55 | feat(ajustes): remove duplicated e-cf settings and extract pure payload builder |
| T3   | c1e62bd | feat(ajustes): embed activation wizard as facturacion-electronica tab with read-only company links |
| T4   | efe6f4d | feat(historial): add tabs for sincronizacion and documentos fiscales |
| T5   | c16081a | feat(routes): redirect legacy fiscal routes, clean up sidebar and update role navigation |
| T6   | 6b9e664 | test(e2e): update fiscal and itbis tests for tabbed ajustes layout |
