# SDD Spec: Epic e-CF (Issue #39)

## 1. Experiencia de Usuario (UX)

### Configuración Fiscal (Ajustes de Local)
- El administrador ingresa a los Ajustes del local y ve una nueva sección "Facturación Electrónica DGII".
- Puede cambiar el Modo Fiscal entre: "Recibo Interno", "NCF Tradicional", "Facturación Electrónica e-CF".
- Si elige e-CF, se despliega un formulario para subir el certificado `.p12` e ingresar la contraseña.
- Al subirlo, el sistema valida la contraseña y muestra la validez del certificado (Válido desde - hasta) y el titular (Subject).

### Proceso de Venta (POS)
- Para el cajero/mesero, el flujo no cambia. Presiona "Cobrar", selecciona método de pago y confirma.
- El sistema automáticamente detecta que el modo es e-CF, consume una secuencia y genera el ticket.
- Si hay internet, el sistema en segundo plano lo envía a la DGII. Si no hay internet, el ticket se imprime con el texto "Documento Electrónico - Pendiente de Envío DGII".
- El POS nunca se bloquea ni muestra loaders de "Esperando a DGII".

### Panel de Auditoría Fiscal
- Nueva pantalla en el dashboard "Documentos Fiscales".
- Muestra una tabla con todas las facturas e-CF, su Track ID, Código de estado DGII (Aceptado, Rechazado) y fecha de envío.
- Permite hacer clic en "Reenviar" si un documento falló por un error temporal de comunicación.

### Impresión de Recibo
- El recibo térmico ahora incluye el código QR estándar de la DGII si el documento fue firmado, o la leyenda de pendiente si fue offline.
