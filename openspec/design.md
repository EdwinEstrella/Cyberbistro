# SDD Design: Epic e-CF (Issue #39)

## 1. Arquitectura de Componentes Frontend

- **`FiscalSettings` (`src/features/settings/components/FiscalSettings.tsx`)**:
  Formulario react-hook-form para actualizar el `fiscal_mode` y `ecf_environment` del tenant.
  Incluye el sub-componente `CertificateUploader`.

- **`CertificateUploader` (`src/features/settings/components/CertificateUploader.tsx`)**:
  Componente que usa Insforge Storage (`@insforge/sdk`) para subir el `.p12` a un bucket `fiscal_certificates`. Luego llama a una Edge Function para validarlo.

- **`FiscalPanel` (`src/features/fiscal/components/FiscalPanel.tsx`)**:
  Tabla usando Radix UI y `@tanstack/react-query` para listar la tabla `ecf_documents` con sus eventos.

## 2. API / Backend (Insforge)

- **Storage Bucket `fiscal_certificates`**:
  Bucket privado. RLS policies para que solo los admins puedan subir (`INSERT`) archivos a la ruta `tenant_id/cert.p12`.

- **Edge Function `validate_ecf_certificate`**:
  Función alojada en el backend que recibe la ruta del storage y la contraseña encriptada (o en el body TLS). Usa el paquete `dgii-ecf` para validar el `.p12`, extrae la metadata e inserta una fila en `ecf_certificate_metadata`. (Alternativa: Si Edge Functions no está disponible para este stack, se usará un RPC en Postgres que procese la firma, aunque es preferible aislar esto).

## 3. Motor de Sincronización POS
La lógica de `createInvoice` / `closeAccount` se modifica:
```typescript
if (tenant.fiscal_mode === 'dgii_ecf') {
  // 1. Obtener/reservar secuencia e-NCF
  // 2. Crear registro localforage/rxdb de Factura
  // 3. Crear registro ecf_documents (status: 'pending_sync')
  // 4. Crear registro fiscal_outbox (status: 'queued', operation: 'submit')
}
```
La capa de sincronización estándar de Cloudix detectará estos nuevos registros (tabla `ecf_documents` y `fiscal_outbox`) y los subirá a la nube en la próxima conexión. El trigger real está en la base de datos o el Worker detectará las filas nuevas en la nube.
