# Spec + Tasks — PR 2: Helpers de Inventario por Presentación

**Change**: `presentation-units-helpers`
**Estimated lines**: ~100-150 | **Budget risk**: Low

---

## Spec

### Invariantes

1. El módulo no tiene dependencias de base de datos ni efectos secundarios (side effects) — es 100% puro.
2. Si `mlPerBottle` es `0` o menor, las funciones de conversión y costo deben retornar `0` de forma segura en lugar de fallar o lanzar `Infinity` / `NaN`.
3. Redondeo:
   - Costo por ml redondeado a 4 decimales.
   - Valuación de inventario y costo de receta redondeados a 2 decimales.
4. Formateo de cadenas:
   - Si `remainingMl` es 0, omitir la porción de mililitros en el texto (ej. `"2 bot."`).
   - Si hay mililitros remanentes, incluirlos (ej. `"2 bot. y 250 ml"`).
   - Si `totalMl` es 0, retornar `"0 bot."`.

### Contratos

```typescript
// src/shared/lib/presentationUnits.ts

export function bottlesAndMlToTotalMl(bottles: number, mlPerBottle: number, extraMl: number): number;
export function totalMlToBottlesAndMl(totalMl: number, mlPerBottle: number): { bottles: number; remainingMl: number };
export function totalMlToFractionalBottles(totalMl: number, mlPerBottle: number): number;
export function formatPresentationStock(totalMl: number, mlPerBottle: number): string;
export function calculateCostPerMl(bottleCost: number, mlPerBottle: number): number;
export function calculateStockValue(totalMl: number, mlPerBottle: number, bottleCost: number): number;
```

---

## Tasks

### Task 1: Crear `presentationUnits.ts`
**Archivo**: `src/shared/lib/presentationUnits.ts`

- Implementar `bottlesAndMlToTotalMl`.
- Implementar `totalMlToBottlesAndMl`.
- Implementar `totalMlToFractionalBottles` (redondear a 4 decimales).
- Implementar `formatPresentationStock`.
- Implementar `calculateCostPerMl` (redondear a 4 decimales).
- Implementar `calculateStockValue` (redondear a 2 decimales).

### Task 2: Crear `presentationUnits.test.ts`
**Archivo**: `src/shared/lib/presentationUnits.test.ts`

| Caso de prueba | Entrada | Salida Esperada |
|----------------|---------|-----------------|
| Conversión normal botellas a ml | `bottlesAndMlToTotalMl(3, 750, 250)` | `2500` |
| Conversión normal ml a botellas | `totalMlToBottlesAndMl(2500, 750)` | `{ bottles: 3, remainingMl: 250 }` |
| Conversión exacta ml a botellas | `totalMlToBottlesAndMl(1500, 750)` | `{ bottles: 2, remainingMl: 0 }` |
| Botellas fraccionales decimales | `totalMlToFractionalBottles(1000, 750)` | `1.3333` |
| Formateo de stock exacto | `formatPresentationStock(1500, 750)` | `"2 bot."` |
| Formateo de stock con resto | `formatPresentationStock(2500, 750)` | `"3 bot. y 250 ml"` |
| Formateo de stock con 0 ml | `formatPresentationStock(0, 750)` | `"0 bot."` |
| Costo por ml ($15 para 750ml) | `calculateCostPerMl(15.00, 750)` | `0.0200` |
| Costo por ml con decimales | `calculateCostPerMl(20.50, 1000)` | `0.0205` |
| Valuación de stock normal | `calculateStockValue(2500, 750, 15)` | `50.00` |
| Borde: botella de tamaño 0 | `totalMlToBottlesAndMl(100, 0)` | `{ bottles: 0, remainingMl: 0 }` |
| Borde: botella de costo 0 | `calculateCostPerMl(0, 750)` | `0` |

### Task 3: Ejecutar pruebas unitarias
**Comando**: `npx vitest run presentationUnits`

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `feat: add presentation inventory conversion and cost helpers` | Task 1 + Task 2 |
