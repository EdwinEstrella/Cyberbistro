# SDD Explore: Epic e-CF (Issue #39)

## 1. Objetivo del Cambio
Integrar facturación electrónica de la DGII (e-CF) en CyberBistro de forma transparente para el usuario, manteniendo la operación offline (local-first) intacta, y sin romper el flujo de recibos internos o NCF tradicional.

## 2. Estado Actual (Descubrimientos)
Tras analizar el repositorio, se detectó un avance significativo en la infraestructura base:
1. **Base de Datos (Completado - Issue #40)**: 
   - La migración `001_init_ecf.sql` ya introdujo la columna `fiscal_mode` en `tenants` (`internal_receipt`, `ncf_legacy`, `dgii_ecf`).
   - Existen las tablas `ecf_certificate_metadata` y `ecf_documents` con sus estados (`pending_sync`, `queued`, `signed`, `submitted`, `accepted`, `rejected`).
   - Existe la tabla `fiscal_outbox` para encolar los trabajos del worker.

2. **Worker Fiscal Node.js (Avanzado - Issue #41)**:
   - En la carpeta `worker/fiscal/` ya existe la arquitectura core del worker (`fiscalWorker.ts`, `postgresFiscalWorkerRepository.ts`, `certificateCustody.ts`).
   - El worker implementa el patrón *Transactional Outbox* para procesar asincrónicamente el firmado de XML, envío a DGII y polling de estados.

## 3. Brechas e Implementación Restante
Para terminar el Epic "sin dejar nada suelto", faltan los flujos de frontend (POS), la lógica de negocio en la generación de facturas, y la integración de certificados:

### A. UI Configuración Fiscal (#39)
- Agregar en la pantalla de Ajustes del Tenant un selector de `fiscal_mode`.
- Permitir configurar el entorno (`ecf_environment`: test, certification, production) y el modo de fallback (ej: si falla DGII, usar recibo interno).

### B. Gestión de Certificado .p12 (#42)
- Formulario seguro en Ajustes para subir el `.p12` y su clave.
- **Riesgo**: El frontend no debe guardar la clave ni el p12 en localStorage. Se debe enviar directamente por HTTPS a un endpoint seguro (probablemente el Worker o una Edge Function) que extraiga la metadata, guarde el material en custodia y registre la fila en `ecf_certificate_metadata`.

### C. Motor Fiscal Unificado (#43 y #45 Offline)
- Al "Cobrar" y cerrar una mesa, la lógica de `facturacion` debe evaluar el `fiscal_mode`.
- Si es `dgii_ecf`, crear la `factura`, generar una fila inicial en `ecf_documents` y encolar el trabajo en `fiscal_outbox`.
- En modo offline (local-first), esto se guarda en PouchDB/IndexedDB. Cuando vuelva el internet y sincronice con Insforge, la DB central recibirá el `ecf_document` y el `fiscal_outbox` disparará el Worker Node.js automáticamente. ¡El POS nunca se bloquea!

### D. Representación Impresa (#46)
- El recibo térmico debe leer la info de `ecf_documents` y, si existe la firma (o código de seguridad), imprimir el QR generado según los estándares de DGII.

### E. Panel Fiscal (#47)
- Una vista en el dashboard (ej: `/dashboard/fiscal`) para ver la cola de e-CF, su estado actual (Accepted, Rejected), y los mensajes de error de la DGII.

## 4. Riesgos Identificados
- **Fuga de secretos**: Debemos garantizar que el `.p12` viaja directo al backend y nunca queda en el estado de React.
- **Sincronización Offline**: Si se genera offline, el `e-NCF` debe consumirse correctamente sin colisiones al sincronizar. Esto implica que la asignación del e-NCF (secuencia) debe ser resiliente (probablemente reservado en el backend o con bloques pre-asignados al cliente).

## Siguiente Fase Sugerida
Pasar a `sdd-propose` para definir la arquitectura final del Motor Fiscal Unificado y el flujo de subida del certificado.
