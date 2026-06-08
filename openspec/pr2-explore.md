# Exploración — PR 2: Helpers de Inventario por Presentación

**Change**: `presentation-units-helpers`
**Branch**: `feature/presentation-units-helpers` (por crear)

---

## Lógica de Conversión de Botellas a Mililitros

El inventario de Cyberbistro almacena la cantidad actual de insumos líquidos en su unidad base (`ml`). Para permitir que los administradores compren y cuenten en botellas y los cajeros o camareros vendan en tragos/mililitros, necesitamos un conjunto de funciones helper puras que realicen las conversiones bidireccionales y el cálculo de costos.

### Casos de uso clave:

1. **Entrada de stock (Compras)**:
   - Compra: 5 botellas de 750 ml cada una.
   - Conversión: `5 * 750 = 3750 ml`.
   - Lógica: `bottlesToMl(5, 0, 750)`.

2. **Salida de stock (Ventas)**:
   - Venta: 1 trago de 45 ml (1.5 oz).
   - El stock actual se reduce directamente en 45 ml.

3. **Visualización en inventario**:
   - Stock actual: 2500 ml.
   - Presentación: Botella de 750 ml.
   - Conversión: 3 botellas y 250 ml.
   - Formateo: `formatPresentationStock(2500, 750)` -> `"3 bot. y 250 ml"`.

4. **Costo de ingredientes / recetas**:
   - Botella de Ron: costo de compra $15.00, tamaño 750 ml.
   - Costo por ml: `15.00 / 750 = $0.02`.
   - Si un trago usa 45 ml, el costo del ingrediente en la receta es `45 * 0.02 = $0.90`.

---

## Diseño del Módulo `presentationUnits.ts`

El módulo se ubicará en `src/shared/lib/presentationUnits.ts`.

### Funciones a implementar:

- `bottlesAndMlToTotalMl(bottles: number, mlPerBottle: number, extraMl: number): number`
- `totalMlToBottlesAndMl(totalMl: number, mlPerBottle: number): { bottles: number, remainingMl: number }`
- `totalMlToFractionalBottles(totalMl: number, mlPerBottle: number): number`
- `formatPresentationStock(totalMl: number, mlPerBottle: number): string`
- `calculateCostPerMl(bottleCost: number, mlPerBottle: number): number`
- `calculateStockValue(totalMl: number, mlPerBottle: number, bottleCost: number): number`

### Estrategia de Pruebas:
- Crear `src/shared/lib/presentationUnits.test.ts`.
- Probar conversiones con números exactos y decimales.
- Probar con valores extremos (0 ml, botella de tamaño 0, costos nulos).
