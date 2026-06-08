# Exploración — PR 4: UI Inventario por Presentación

**Change**: `presentation-inventory-ui`
**Branch**: `feature/presentation-inventory-ui`

---

## Objetivos del Cambio

1. Añadir los campos de presentación avanzada (`ml_por_botella` y `costo_compra`) al formulario de registro en el modal `Agregar Materia Prima` cuando la unidad base es `ml`.
2. Integrar los helpers de `presentationUnits` en el listado de insumos (`Maestro Insumos`) para mostrar el stock de forma comprensible (botellas y ml) y detallar el costo por botella y costo por ml.
3. Implementar el costeo de recetas en la pestaña de `Fórmulas de Recetas`, calculando el costo total de insumos, margen de beneficio y porcentaje del margen para cada plato.

---

## Modificaciones de Interfaz y Lógica

### 1. Formulario de Creación (Modal "Agregar Materia Prima")
- **Estado**: Modificar la inicialización de `insumoForm` en `Inventario.tsx`:
  ```typescript
  const [insumoForm, setInsumoForm] = useState({
    nombre: "",
    categoria: "Insumo / Materia Prima",
    unidad_base: "ml",
    stock_minimo: "",
    stock_actual: "",
    costo_promedio: "",
    ml_por_botella: "",
    costo_compra: "",
  });
  ```
- **Campos en el Modal**: Renders condicionales (solo cuando `insumoForm.unidad_base === "ml"`):
  - "Contenido por Botella (ml)" -> `ml_por_botella`
  - "Costo por Botella (Compra)" -> `costo_compra`
- **Lógica de Envío (`crearInsumo`)**:
  - Si se especifican `costo_compra` y `ml_por_botella`, calcular `costo_promedio` automáticamente como `costo_compra / ml_por_botella` redondeado a 4 decimales.
  - El payload de inserción de `productos_inventario` incluirá:
    ```typescript
    ml_por_botella: Number(insumoForm.ml_por_botella) || null,
    costo_compra: Number(insumoForm.costo_compra) || null,
    ```

### 2. Listado de Insumos (`Maestro Insumos`)
- Si `insumo.unidad_base === "ml"` y tiene `ml_por_botella > 0`:
  - Mostrar stock actual usando `formatPresentationStock(insumo.stock_actual, insumo.ml_por_botella)` de forma destacada, y el valor en ml entre paréntesis.
  - Mostrar el costo de compra: `RD$ {insumo.costo_compra} / bot.`.
  - Mostrar el costo por mililitro: `RD$ {insumo.costo_promedio.toFixed(4)} / ml`.
- De lo contrario, usar el formateo de unidad simple existente.

### 3. Fórmulas de Recetas (`Fórmulas de Recetas`)
- En la tabla de ingredientes de cada plato, agregar la columna **Costo Estimado**:
  - Fórmula: `RD$ {RD(item.cantidad * insumo.costo_promedio)}`.
- Mostrar el **Resumen Financiero del Plato**:
  - **Costo Total Receta**: Suma de los costos de todos sus ingredientes.
  - **Precio de Venta**: Precio del plato (`plato.precio`).
  - **Margen de Ganancia**: `Precio de Venta - Costo Total Receta`.
  - **Margen (%)**: `(Margen de Ganancia / Precio de Venta) * 100`.

---

## Análisis de Integración e Importaciones

- Importar funciones helper desde `@/shared/lib/presentationUnits` (en este caso, usando la ruta relativa `../../../shared/lib/presentationUnits` en `src/features/inventario/components/Inventario.tsx`).
- Asegurar que el cálculo de márgenes maneje correctamente divisiones por cero si un plato tiene precio `0`.

---

## Estrategia de Pruebas

1. **Unit Tests**: Modificar/agregar pruebas en `test` o en `src/features/inventario/components/Inventario.test.tsx` si existe, o crear un archivo de test específico para verificar el comportamiento de los cálculos de UI y el mapeo de datos.
2. **Typecheck y Build**: Validar que `npm run typecheck` no tenga fallos y que el bundle de Vite compile correctamente.
