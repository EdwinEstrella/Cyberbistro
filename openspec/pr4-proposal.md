# Propuesta — PR 4: UI Inventario por Presentación

**Change**: `presentation-inventory-ui`
**Branch**: `feature/presentation-inventory-ui`

---

## Objetivos del Cambio

1. Añadir entradas para `ml_por_botella` y `costo_compra` en el modal de creación de materia prima, y calcular el `costo_promedio` de forma automática para el insumo en mililitros.
2. Formatear la vista del inventario utilizando botellas y mililitros si corresponde.
3. Mostrar el costeo detallado y márgenes de ganancia (bruto y porcentual) en la pestaña de Recetas.

---

## Decisiones de Diseño

### 1. Entradas Condicionales en Formulario
Se renderizarán los campos de presentación avanzada únicamente si `unidad_base` es `"ml"`. Esto previene sobrecargar visualmente el formulario para ingredientes unitarios o medidos en gramos.
Si se especifican, se deshabilitará o auto-calculará el "Costo Inicial" base, derivándolo como `costo_compra / ml_por_botella` redondeado a 4 decimales.

### 2. Formateo de Stock Bidireccional
En las tarjetas de insumos, se mostrará el stock amigable usando la función `formatPresentationStock(stock_actual, ml_por_botella)` (ej. `"3 bot. y 250 ml"`). El valor en ml neto se colocará de forma secundaria para mantener precisión técnica visible.

### 3. Costeo Financiero en Fórmulas
En la vista de ingredientes, agregamos una columna para el costo individual de cada porción/ingrediente. En la base de la sección de receta, se añade un panel de métricas con:
- Costo total de ingredientes
- Precio de venta del plato
- Margen bruto (RD$)
- Margen porcentual (%)

Esto empodera al administrador a tomar decisiones de precios en caliente basadas en costos de insumos reales.

---

## Análisis de Riesgos

- **Riesgo**: Que ocurra una división por cero si el precio del plato es 0 al calcular el porcentaje de margen.
  - *Mitigación*: Validar si `plato.precio > 0` antes de calcular el porcentaje; de lo contrario, fijar el margen porcentual en `0%`.
- **Riesgo**: Que los valores calculados en la UI queden desactualizados.
  - *Mitigación*: Utilizar `useMemo` para computar los costos de receta agregados en base al estado de insumos, recetas y plato seleccionado.
