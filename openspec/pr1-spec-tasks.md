# Spec + Tasks — PR 1: Feature Gates + Sidebar Agrupado

**Change**: `feature-gates-sidebar-sections`
**Issue**: [#36](https://github.com/EdwinEstrella/Cyberbistro/issues/36)
**Estimated lines**: ~250 | **Budget risk**: Low

---

## Spec

### Invariantes

1. Plan básico funciona EXACTAMENTE igual que antes — mismas rutas, misma navegación, misma venta
2. Ninguna ruta nueva se crea en este PR — los módulos nuevos (compras, CxC, CxP) se agregan en sus PRs
3. El sidebar muestra secciones con headers para TODOS los planes (la agrupación visual es universal)
4. Items bloqueados muestran badge 🔒 + disparan upsell modal (mismo patrón que inventario hoy)
5. `canUseFeature` es una función pura sin side effects — testeable sin mocks

### Contratos

```typescript
// src/shared/lib/planFeatures.ts

type Plan = 'basico' | 'profesional' | 'empresarial';

type Feature =
  | 'advanced_inventory'
  | 'inventory_purchases'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'suppliers'
  | 'finance_reports';

function normalizePlan(plan: string | null | undefined): Plan;
function canUseFeature(plan: string | null | undefined, feature: Feature): boolean;
function getRequiredPlan(feature: Feature): Plan;
```

### Sidebar sections data structure

```typescript
type SidebarSection = {
  key: string;
  label: string;
  items: readonly SidebarItem[];
};

type SidebarItem = {
  label: string;
  path: string;
  customIcon?: string;
  icon?: string;
  viewBox?: string;
  feature?: Feature;
};
```

---

## Tasks

### Task 1: Crear `planFeatures.ts`
**Archivo**: `src/shared/lib/planFeatures.ts`

- Exportar tipos `Plan`, `Feature`
- `PLAN_FEATURES`: `Record<Plan, ReadonlySet<Feature>>`
  - `basico`: set vacío
  - `profesional`: las 6 features
  - `empresarial`: las 6 features
- `normalizePlan(plan)`: null/undefined/desconocido → `'basico'`
- `canUseFeature(plan, feature)`: normaliza plan, busca en set
- `getRequiredPlan(feature)`: retorna plan mínimo que incluye la feature

### Task 2: Tests para `planFeatures`
**Archivo**: `src/shared/lib/planFeatures.test.ts`

| Test | Input | Expected |
|------|-------|----------|
| básico no tiene features | `('basico', 'advanced_inventory')` | `false` |
| profesional tiene todas | `('profesional', *)` para las 6 | `true` × 6 |
| empresarial tiene todas | `('empresarial', *)` para las 6 | `true` × 6 |
| null → básico | `(null, 'suppliers')` | `false` |
| undefined → básico | `(undefined, 'suppliers')` | `false` |
| string desconocido → básico | `('premium', 'suppliers')` | `false` |
| getRequiredPlan | `('advanced_inventory')` | `'profesional'` |
| getRequiredPlan todas | las 6 features | `'profesional'` × 6 |

### Task 3: Refactorizar sidebar de array plano a secciones
**Archivo**: `src/app/components/AppLayout.tsx`

Secciones:
- **Operación**: Venta, Camarera, Mesas, Cocina, Entregas
- **Clientes**: Clientes
- **Inventario**: Productos (inventario actual)
- **Finanzas**: Analíticas, Gastos, Cierre

Items nuevos (Compras, CxC, CxP) se agregan en sus PRs respectivos.

### Task 4: Integrar `canUseFeature` en el sidebar
**Archivo**: `src/app/components/AppLayout.tsx`

- Si `item.feature` y `!canUseFeature(plan, item.feature)` → upsell modal
- Badge 🔒 en items bloqueados
- Eliminar condición ad-hoc de inventario

### Task 5: Actualizar `filterMainNavForRol`
**Archivo**: `src/app/components/AppLayout.tsx`

- Opera sobre estructura de secciones
- Filtra items por rol dentro de cada sección
- Secciones vacías post-filtro no se renderizan

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `feat: add canUseFeature plan gate helper` | Task 1 + Task 2 |
| `refactor: organize sidebar into grouped sections with feature gates` | Task 3 + Task 4 + Task 5 |
