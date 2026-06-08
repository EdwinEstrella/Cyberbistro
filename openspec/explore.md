# Exploración: Feature Gates y Estructura de Planes

Este documento explora la base de código de Cyberbistro para diseñar el helper central de permisos (`canUseFeature`) y su integración con el sistema de navegación y pantallas, cumpliendo con los requisitos del PR 1.

## Puntos de integración identificados

1. **Recuperación del Plan**:
   - `src/shared/hooks/useAuth.ts` expone el plan del usuario actual (`plan`), mapeando los valores `'basico' | 'profesional' | 'empresarial'` (por defecto `'basico'`).
   - El plan se obtiene de la tabla `tenants` y se almacena en la sesión del usuario.

2. **Navegación y Vistas Existentes**:
   - `src/app/components/AppLayout.tsx` maneja los enlaces del menú de navegación.
   - Actualmente, el acceso a `/inventario` está restringido con la condición `!plan || plan === "basico"`, disparando `setUpsellType("inventario")`.

3. **Planes y Características (Features)**:
   - Necesitamos mapear las siguientes características indicadas en el issue:
     - `advanced_inventory` (Inventario avanzado)
     - `inventory_purchases` (Compras de inventario)
     - `accounts_receivable` (Cuentas por cobrar / fiado)
     - `accounts_payable` (Cuentas por pagar)
     - `suppliers` (Gestión de proveedores)
     - `finance_reports` (Analíticas y reportes avanzados)

## Alternativas de Diseño para `canUseFeature`

### Opción 1: Mapeo estático simple (Recomendado)
Definir un objeto de mapeo plano donde cada plan tiene una lista o conjunto de features permitidas.
```typescript
type Plan = 'basico' | 'profesional' | 'empresarial';
type Feature = 
  | 'advanced_inventory'
  | 'inventory_purchases'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'suppliers'
  | 'finance_reports';

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  basico: [],
  profesional: [
    'advanced_inventory',
    'inventory_purchases',
    'accounts_receivable',
    'accounts_payable',
    'suppliers',
    'finance_reports',
  ],
  empresarial: [
    'advanced_inventory',
    'inventory_purchases',
    'accounts_receivable',
    'accounts_payable',
    'suppliers',
    'finance_reports',
  ],
};
```

**Ventajas**: Extremadamente simple de mantener, robusto ante tipos y fácil de extender si luego agregamos features exclusivas de `empresarial` (como sucursales ilimitadas).

### Opción 2: Jerarquía de planes
Dado que los planes son lineales (empresarial > profesional > basico), podemos definir un nivel para cada feature y un nivel para cada plan, evaluando con un operador mayor o igual.

**Desventajas**: Menos flexible si en el futuro un plan más económico incluye una feature que uno intermedio no (por ejemplo, add-ons).

## Estrategia de Pruebas
- Escribir tests unitarios en `src/shared/lib/planFeatures.test.ts`.
- Validar comportamiento ante planes no definidos, nulos o indefinidos (deben tratarse como `'basico'`).
- Probar todas las combinaciones de planes y características.

## Próximo Paso
Avanzar a la fase de **Propuesta (sdd-propose)** donde formalizaremos la arquitectura del helper y los archivos a modificar.
