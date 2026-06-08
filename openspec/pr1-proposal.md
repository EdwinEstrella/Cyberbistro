# Propuesta: PR 1 — Feature Gates + Sidebar Agrupado

**Change**: `feature-gates-sidebar-sections`
**Issue**: [#36](https://github.com/EdwinEstrella/Cyberbistro/issues/36)

---

## Problema

El código actual usa condiciones ad-hoc dispersas para bloquear features por plan:

```typescript
// AppLayout.tsx L373
if (item.path === "/inventario" && !loading && (!plan || plan === "basico")) {
  setUpsellType("inventario");
  return;
}
```

Con 6+ features nuevas del plan profesional, este patrón se vuelve insostenible.

## Solución

Crear módulo puro `planFeatures.ts` con:

1. **Tipos exportados**: `Plan`, `Feature`
2. **Mapeo estático**: `PLAN_FEATURES` — `Record<Plan, ReadonlySet<Feature>>`
3. **Helper principal**: `canUseFeature(plan, feature)` — retorna `boolean`
4. **Helper de UI**: `getRequiredPlan(feature)` — retorna el plan mínimo necesario

`normalizePlan` trata valores nulos, undefined, o desconocidos como `'basico'` (fail-closed).

## Archivos

| Acción | Archivo | Cambio |
|--------|---------|--------|
| **Crear** | `src/shared/lib/planFeatures.ts` | Módulo con tipos, mapeo y helpers |
| **Crear** | `src/shared/lib/planFeatures.test.ts` | Tests unitarios exhaustivos |
| **Modificar** | `src/app/components/AppLayout.tsx` | Sidebar agrupado + canUseFeature |

## Criterios de aceptación

- `canUseFeature('basico', feature)` → `false` para TODAS las features
- `canUseFeature('profesional', feature)` → `true` para las 6
- `canUseFeature('empresarial', feature)` → `true` para las 6
- `canUseFeature(null|undefined|'desconocido', feature)` → `false`
- Plan básico funciona exactamente igual que antes
- ~250 líneas estimadas (dentro del límite de 400)

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Feature no mapeada | Tipos fuerzan exhaustividad |
| Plan desconocido | `normalizePlan` → `'basico'` (fail-closed) |
| Romper nav inventario | Refactor 1:1 — misma lógica, diferente expresión |
