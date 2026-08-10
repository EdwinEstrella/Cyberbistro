# Validación manual segura del modo local

Esta guía valida la base local-first hoy. La sincronización por tenant, las migraciones remotas y el worker siguen inactivos; no se deben activar durante estas pruebas.

## Ruta rápida

1. Usá una estación de prueba y una cuenta de prueba; nunca una sesión que esté facturando.
2. Confirmá la pantalla de inicio de sesión y el comportamiento local descrito abajo.
3. Simulá una caída solo en esa estación bloqueando el dominio del backend en el firewall local; al terminar, eliminá la regla.
4. Detenete ante cualquiera de las condiciones de parada.

## Lista de validación

| Probar | Resultado esperado |
|---|---|
| Abrir la app sin sesión | Se ven **Correo**, **Contraseña**, **Recordar**, el indicador **local**, **Iniciar Sesión** y **Registrar Nueva Unidad**. |
| Navegación por teclado | Tab llega a los campos, a **Recordar**, a **Iniciar Sesión** y a **Registrar Nueva Unidad**; Espacio cambia **Recordar** y Enter activa el botón enfocado. |
| Registrar Nueva Unidad | Al activarlo se abre la pantalla de registro; volver no pierde lo escrito en la pantalla de inicio. |
| Cuenta sin negocio (solo cuenta de prueba dedicada) | Tras iniciar sesión aparece el aviso de que la cuenta no está vinculada a ningún negocio; no se abre un negocio ni se muestra información de otro tenant. |
| Cuenta válida existente | El inicio de sesión mantiene el comportamiento actual. No se habilita ni se inicia sincronización nueva. |
| Sin conectividad en la estación de prueba | La app muestra un error de conexión o conserva solamente una sesión local previamente validada. Nunca debe convertir una caída de red en el aviso de cuenta sin negocio. |

## Simular backend no disponible sin apagar el homelab

En **una sola PC de prueba**, agregá temporalmente una regla saliente de Windows Firewall que bloquee el dominio HTTPS del backend de Cloudix/InsForge. No bloquees la IP del homelab, no cambies DNS compartido, no reinicies servicios y no ejecutes la prueba desde una caja o servidor usado por un negocio.

Después de probar, eliminá esa regla y comprobá que la misma PC vuelve a resolver y conectar. Esta simulación solo comprueba el manejo de indisponibilidad de la estación: no autoriza sincronización, cambios de esquema, activación de tenants ni ejecución del worker.

## Condiciones de parada

Detené la prueba y restaurá la conectividad local si ocurre cualquiera de estos casos:

- Se intenta crear, aplicar o desplegar una migración, activar un tenant o enlazar el worker de sincronización.
- Aparece información de otro negocio, se abre un negocio para la cuenta sin vínculo o se pierde información local.
- Una caída de red se muestra como cuenta sin negocio.
- La prueba requiere apagar, reiniciar o bloquear infraestructura usada por negocios activos.

Registrá solo el paso que falló, la hora y una captura sin credenciales ni datos de clientes; luego reportalo al equipo.
