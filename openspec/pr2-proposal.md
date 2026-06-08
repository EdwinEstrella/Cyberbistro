# Propuesta — PR 2: Helpers de Inventario por Presentación

**Change**: `presentation-units-helpers`
**Branch**: `feature/presentation-units-helpers`

---

## Objetivos del Cambio

1. Crear un módulo puro con helpers que realicen cálculos de volumen líquido (ml), conversión a botellas físicas y costo de insumos.
2. Garantizar una cobertura completa del 100% en pruebas unitarias para todas las conversiones y casos de borde.
3. Preparar la arquitectura para la futura pantalla de inventario por presentación (PR 4) y la integración de compras (PR 5).

---

## Contrato de Funciones (`presentationUnits.ts`)

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

## Análisis de Riesgos

- **Riesgo**: Que ocurran divisiones por cero si `mlPerBottle` es `0`.
  - *Mitigación*: Retornar `0` o lanzar errores amigables si el tamaño de botella especificado es menor o igual a cero.
- **Riesgo**: Valores flotantes imprecisos en la multiplicación/división de costos.
  - *Mitigación*: Redondear los valores monetarios a 4 decimales en el costo por ml, y a 2 decimales para la valuación del inventario final.
