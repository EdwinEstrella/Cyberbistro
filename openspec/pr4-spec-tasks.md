# Spec + Tasks — PR 4: UI Inventario por Presentación

**Change**: `presentation-inventory-ui`
**Estimated lines**: ~150-200 | **Budget risk**: Low

---

## Spec

### Invariantes

1. Si el insumo no tiene `ml_por_botella` (es `null` o `0`), el listado de materias primas e ingredientes debe comportarse igual que antes, mostrando la unidad base original.
2. Al ingresar el contenido y costo por botella en el formulario, el sistema calcula automáticamente `costo_promedio` como `costo_compra / ml_por_botella` redondeado a 4 decimales.
3. El cálculo de márgenes financieros no debe provocar fallos por divisiones por cero si el precio del plato es `0`.
4. El frontend debe pasar exitosamente `npm run typecheck`.

---

## Tasks

### Task 1: Modificar el estado y lógica del Formulario de Insumo
**Archivo**: `src/features/inventario/components/Inventario.tsx`

- Modificar la definición de `insumoForm` inicial añadiendo `ml_por_botella: ""` y `costo_compra: ""`.
- En `crearInsumo`, obtener `mlBotella = Number(insumoForm.ml_por_botella) || 0` y `costoCompra = Number(insumoForm.costo_compra) || 0`.
- Si `unidad_base === "ml"` y ambos son mayores a cero, calcular `costo = Number((costoCompra / mlBotella).toFixed(4))`, si no usar `Number(insumoForm.costo_promedio) || 0`.
- Agregar `ml_por_botella` y `costo_compra` al payload de inserción de `productos_inventario`.
- Limpiar los nuevos campos en `setInsumoForm` volviéndolos a `""`.

### Task 2: Añadir campos de entrada condicionales en el Modal
**Archivo**: `src/features/inventario/components/Inventario.tsx`

- En el modal de `Agregar Materia Prima`, buscar la sección de inputs.
- Si `insumoForm.unidad_base === "ml"`, renderizar un div con dos inputs utilizando las clases estéticas existentes ( Tailwind CSS / radx ):
  - **Contenido por Botella (ml)**: input de número, step "any", min "1".
  - **Costo por Botella (Compra)**: input de número, step "any", min "0".

### Task 3: Formatear Stock y Costos en el Listado de Insumos
**Archivo**: `src/features/inventario/components/Inventario.tsx`

- Importar `formatPresentationStock` desde `../../../shared/lib/presentationUnits`.
- En el renderizado de la tarjeta de cada `insumo` (`activeTab === 'insumos'`):
  - Si `insumo.unidad_base === "ml"` y `insumo.ml_por_botella` es mayor que `0`:
    - En el label de "Stock Actual", renderizar `formatPresentationStock(insumo.stock_actual, insumo.ml_por_botella)`.
    - Añadir una etiqueta secundaria abajo que muestre `({insumo.stock_actual} ml)`.
    - En la fila de costo, mostrar:
      - `Costo Botella: RD$ {insumo.costo_compra}` (si existe `costo_compra`).
      - `Costo ml: RD$ {insumo.costo_promedio.toFixed(4)}` (en lugar de `RD$ {insumo.costo_promedio}`).

### Task 4: Implementar costeo de recetas
**Archivo**: `src/features/inventario/components/Inventario.tsx`

- En la tabla de ingredientes (`activeTab === 'recetas'`):
  - Agregar la columna `Costo Insumo` en el `thead` y en el `tbody` calcular `RD(item.cantidad * (insumo?.costo_promedio || 0))`.
  - Calcular el `costoTotalReceta` usando `useMemo`:
    ```typescript
    const costoTotalReceta = useMemo(() => {
      return activeRecipes.reduce((acc, item) => {
        const insumo = insumosMap.get(item.insumo_id);
        return acc + (item.cantidad * (insumo?.costo_promedio || 0));
      }, 0);
    }, [activeRecipes, insumosMap]);
    ```
  - Buscar el precio del plato seleccionado: `const precioPlato = platos.find(p => p.id === selectedPlatoId)?.precio || 0;`
  - Calcular `margenBruto = precioPlato - costoTotalReceta`.
  - Calcular `margenPorcentual = precioPlato > 0 ? (margenBruto / precioPlato) * 100 : 0`.
  - Debajo de la lista de ingredientes, renderizar un panel financiero conteniendo:
    - **Costo Total Insumos**: `RD$ {RD(costoTotalReceta)}`
    - **Precio de Venta**: `RD$ {RD(precioPlato)}`
    - **Margen de Ganancia**: `RD$ {RD(margenBruto)}`
    - **Margen (%)**: `{margenPorcentual.toFixed(1)}%`

### Task 5: Ejecutar verificaciones locales
- Ejecutar `npm run typecheck`
- Ejecutar `npm run test`

---

## Commits

| Commit | Contenido |
|--------|-----------|
| `feat: support advanced inventory columns in creations and list display` | Task 1 + Task 2 + Task 3 |
| `feat: add recipe costing and profit margins panel to recetas UI` | Task 4 |
