# SDD Tasks: Epic e-CF (Issue #39)

Estrategia de entrega seleccionada: **Chained PRs (`ask-on-risk`)**. Se dividirá en etapas lógicas para facilitar la revisión sin riesgo de un PR de 1000 líneas.

## PR 1: Configuración Fiscal y Certificados (#39, #42)
- [ ] Tarea 1.1: Crear bucket `fiscal_certificates` y políticas RLS en SQL (si no existen).
- [ ] Tarea 1.2: Crear el componente UI `FiscalSettings` en Ajustes (selector de `fiscal_mode`, `ecf_environment`).
- [ ] Tarea 1.3: Crear UI `CertificateUploader` para subir `.p12` y solicitar contraseña.
- [ ] Tarea 1.4: Implementar lógica de backend (Edge Function o RPC) para procesar el certificado subido, extraer metadata, y popular `ecf_certificate_metadata`.

## PR 2: Panel de Auditoría Fiscal (#47)
- [ ] Tarea 2.1: Crear la ruta y vista `/dashboard/fiscal`.
- [ ] Tarea 2.2: Implementar la tabla de `ecf_documents` mostrando estado (`dgii_status_message`, `track_id`).
- [ ] Tarea 2.3: Agregar acción de "Reenviar" que cambia el estado del outbox.

## PR 3: Motor Fiscal Unificado POS (#43, #45)
- [ ] Tarea 3.1: Actualizar `facturacion` logic (p. ej. `useCloseAccount` o similar) para evaluar `fiscal_mode`.
- [ ] Tarea 3.2: Implementar la inserción de `ecf_documents` y `fiscal_outbox` vinculados a la `factura`.
- [ ] Tarea 3.3: Ajustar el offline sync para que asigne e-NCFs pre-reservados correctamente.

## PR 4: Recibo Térmico y QR (#46)
- [ ] Tarea 4.1: Modificar el componente de ticket impreso para leer el `ecf_document`.
- [ ] Tarea 4.2: Integrar librería para generar QR de la DGII si la factura fue firmada.
- [ ] Tarea 4.3: Imprimir leyenda "Pendiente de Envío DGII" si está offline.

*Fin del Planning SDD.*
