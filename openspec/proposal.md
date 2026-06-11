# SDD Proposal: Motor Fiscal e-CF (Epic #39)

Basado en la exploración, aquí presento el diseño arquitectónico para cerrar las brechas restantes del Epic e-CF.

## 1. Gestión de Certificado .p12 (#42)
El frontend **jamás** debe tener acceso al contenido descifrado del `.p12` ni procesarlo localmente.

**Solución propuesta:**
1. Crear un endpoint seguro en el backend (Edge Function en Insforge, si soporta, o un RPC con `pgcrypto`, o subirlo a un bucket privado de Storage).
2. Como Insforge Storage permite RLS estricto, el frontend sube el archivo `.p12` al bucket `fiscal_certificates` (RLS: insert solo admin, select solo el worker).
3. El frontend invoca un RPC `validate_and_register_certificate(tenant_id, p12_storage_path, passphrase_encrypted)`.
4. El worker o función lee el storage, extrae la metadata (sujeto, validez) y crea/actualiza la fila en `ecf_certificate_metadata` con `is_ready = true`.

## 2. Motor Fiscal Unificado (#43)
Actualmente el POS crea la `factura`. Para incorporar `dgii_ecf` sin complicar el POS:
1. En la lógica de frontend que genera la factura (`FacturacionContext` o hook), verificamos el `tenant.fiscal_mode`.
2. Si es `dgii_ecf`, luego de insertar la `factura` (o en la misma transacción offline de IndexedDB/local-first), creamos:
   - Fila en `ecf_documents` con estado `pending_sync`.
   - Fila en `fiscal_outbox` con operation `submit`.
3. Al sincronizar con la nube, Insforge inserta ambas filas. El Worker Node.js detecta el outbox y procesa el firmado y envío de manera transparente.

## 3. Sincronización Offline (#45)
- El POS debe poder asignar la secuencia `e-NCF` estando offline para imprimir el ticket.
- **Enfoque de Bloques**: El backend (`cloudix_reserve_ncf`) debe enviar al POS un bloque de secuencias pre-asignadas (ej: 10 secuencias) para operar offline sin colisiones.
- El recibo se imprime con estado "Pendiente de envío DGII". No debe decir "Aceptado".

## 4. UI de Ajustes y Panel (#39, #47)
- **Configuración**: Modificar la pantalla de "Ajustes de Local/Tenant" agregando un acordeón "Facturación Electrónica". Selectores para Entorno, y botón de subida de certificado.
- **Panel Fiscal**: Una tabla en `/dashboard/fiscal` que haga select a `ecf_documents` unida con `facturas`, mostrando el `dgii_track_id`, el estado, y permitiendo reencolar (`resubmit`) si falla por error recuperable de DGII.

## 5. Representación Impresa (#46)
- Modificar el componente del Recibo Térmico. Si la factura está vinculada a un `ecf_document`, mostrar el `e-NCF`.
- Si el documento está `signed` o posterior, calcular el Código de Seguridad (los primeros 6 caracteres del XML Hash) e imprimir el QR estándar de la DGII.

---
**Estrategia de Entrega (Delivery):** PRs encadenados (`ask-on-risk` acordado).
1. PR 1: UI de configuración fiscal y gestión de certificados.
2. PR 2: Lógica de Motor Fiscal Unificado en frontend (offline+online).
3. PR 3: Panel Fiscal de monitoreo.
4. PR 4: Modificaciones al Recibo Térmico (impresión QR).
