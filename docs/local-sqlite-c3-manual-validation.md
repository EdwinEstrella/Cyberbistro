# Validación manual local SQLite — C3d fiscal

## Límite

Esta comprobación usa únicamente un perfil sintético local. No habilita sincronización, DGII, nube, producción, migraciones ni eliminación de IndexedDB.

## Preparación

1. Cierre Cloudix y cree un perfil temporal de prueba.
2. Use datos sintéticos y una sucursal local; no inicie sesión con un negocio activo.
3. Desconecte la red antes de cada venta simulada.

## Lista de comprobación de cierre y reapertura ordenados

Esta guía y la prueba automatizada C3d verifican únicamente la durabilidad tras un cierre ordenado de SQLite y la reapertura del mismo perfil. No prueban recuperación tras pérdida abrupta de energía ni cierre forzoso del proceso.

1. Cree una venta `internal_receipt`, cierre Cloudix de forma ordenada y vuelva a abrir el mismo perfil.
   - La factura local debe existir con estado pendiente de sincronización.
   - No deben aparecer NCF ni e-CF ni aceptación externa.
2. Cree una venta `ncf_legacy`, repita el cierre ordenado y la reapertura.
   - La factura y su reserva local deben mantenerse sin duplicación.
   - La sincronización debe seguir pendiente; no se debe mostrar aceptación DGII.
3. Cree una venta `dgii_ecf`, repita el cierre ordenado y la reapertura.
   - La factura, la intención e-CF y la salida fiscal deben continuar pendientes.
   - Billing debe mostrar `e-CF local pendiente de sincronización`, nunca enviado ni aceptado.
4. Verifique que cada ejecución solo expone el puente fiscal nombrado; no debe haber IPC crudo ni acciones de envío.

## Resultado esperado

Los tres modos conservan el registro local tras un cierre ordenado de SQLite y la reapertura del mismo perfil. Toda persistencia, procesamiento o aceptación externa permanece pendiente y fuera de este alcance.

## Reversión

Revierta el adaptador fiscal, su puente de preload, el texto de estado de Billing, las pruebas y esta guía. Conserve el almacén C3 para análisis; no borre IndexedDB ni datos locales.
