# Formato 607 — Envío de Ventas de Bienes y Servicios (DGII)

Módulo de exportación mensual de ventas en TXT oficial (delimitado por barras `|`) y CSV (Excel) para remitir a la DGII a más tardar el día 15 del mes siguiente; visible para todos los roles con acceso a los resúmenes de Analíticas (no se muestra a la cajera).

## Reglas de Inclusión y Estructura
- **Encabezado TXT**: `607|<RNC emisor>|<AAAAMM>|<cantidad de registros detalle>`.
- **23 Columnas**: RNC/Cédula comprador (1=RNC, 2=Cédula, 3=Pasaporte), NCF, NCF modificado (notas crédito), Tipo ingreso (1=Operaciones), Fecha comprobante (AAAAMMDD en hora local `America/Santo_Domingo`, UTC-4), Monto facturado (subtotal sin impuestos), ITBIS facturado, propina legal (10%) y desglose de pago (cols 17-23). El desglose usa el método de pago único de la factura.
- **Ventas a Crédito (Fiado)**: Las facturas a crédito (fiado) se reportan en la columna 20 (Venta a crédito) aun estando registradas como `pendiente`. Solo se excluyen facturas con estado `cancelada` o pendientes de pago no crediticias.
- **Detalle vs Resumen Consumo**: Se incluyen B01, B14, B15, E31, notas de crédito (E34/B04) y consumo (B02/E32) de **RD$ 250,000 o más**. Consumo < 250k se totaliza en el resumen mensual para la Oficina Virtual.
- **Carga Acotada y Fechas**: Carga paginada en ventana UTC del mes con margen inferior de 7 días sobre `created_at`; el filtro exacto y la fecha fiscal de la columna 6 usan `pagada_at ?? created_at` en hora local dominicana. Padres de notas de crédito fuera de ventana se resuelven exclusivamente para el RNC del comprador.
- **Límite**: Máximo 65,000 registros por archivo según especificación DGII.

## Pregunta Abierta (Signo en Notas de Crédito)
El instructivo de la DGII no define el signo de las notas de crédito (E34/B04). Cloudix exporta magnitudes positivas como decisión provisional; confirmarlo con la Herramienta de Pre-validación antes del primer envío real.

## Validación Previa
1. Descargar la **Herramienta de Pre-validación de Formato 607** desde el portal oficial de la DGII (dgii.gov.do, sección Biblioteca Virtual / Formatos de Envío de Datos).
2. Abrir la Herramienta de Pre-validación de Envío de Datos, seleccionar el formato 607, completar los datos, adjuntar el archivo y pulsar «Verificar»; si hay errores se muestran en la sección «Errores».
3. Tras obtener resultado conforme (sin errores de estructura ni de RNC), cargar el archivo en la Oficina Virtual DGII.
