Para controlar **stock de aceite** en un sistema de restaurante, no debes manejarlo como un producto normal que se vende directo, sino como **materia prima / insumo de cocina**.

El aceite puede bajar por 3 razones principales:

1. **Uso en recetas**
2. **Consumo por producción o preparación**
3. **Merma, desperdicio o ajuste manual**

---

## 1. Crea el producto en inventario

Ejemplo:

**Producto:** Aceite vegetal
**Categoría:** Insumo / Cocina
**Unidad de compra:** Galón, caja, botella
**Unidad de control:** mililitros o litros
**Stock actual:** 20 litros
**Stock mínimo:** 5 litros
**Costo:** RD$350 por galón, por ejemplo

Lo ideal es que el sistema internamente trabaje con una unidad base.

Ejemplo:

```txt
1 litro = 1000 ml
1 galón = 3785 ml
```

Así evitas errores cuando compras por galón pero consumes por mililitros.

---

## 2. Registra entradas de inventario

Cuando el restaurante compra aceite, haces una entrada.

Ejemplo:

```txt
Compra:
2 galones de aceite

Conversión:
2 × 3785 ml = 7570 ml

Inventario aumenta:
Stock anterior: 10,000 ml
Entrada: +7,570 ml
Nuevo stock: 17,570 ml
```

Tabla sugerida:

```txt
inventario_movimientos
- id
- producto_id
- tipo_movimiento: entrada, salida, ajuste, merma
- cantidad
- unidad
- costo_unitario
- motivo
- referencia
- fecha
- usuario_id
```

---

## 3. Define recetas para descontar automáticamente

Cada plato debe tener una receta o consumo estimado.

Ejemplo:

### Papas fritas

```txt
Producto vendido: Papas fritas
Consume:
- Papa: 300 g
- Aceite: 30 ml
- Sal: 5 g
```

### Pollo frito

```txt
Producto vendido: Pollo frito
Consume:
- Pollo: 1 unidad
- Aceite: 80 ml
- Harina: 50 g
```

Cuando se vende 1 pollo frito, el sistema descuenta automáticamente:

```txt
Aceite: -80 ml
```

Si se venden 10 pollos fritos:

```txt
80 ml × 10 = 800 ml
```

---

## 4. No todo el aceite se consume igual

Aquí viene algo importante en restaurantes:

El aceite no siempre se consume directamente por plato. Muchas veces se usa en una freidora y se reutiliza durante el día.

Por eso tienes 2 formas de controlarlo.

---

# Opción A: Descuento por receta

Esta es la forma más simple.

Cada plato tiene un consumo estimado de aceite.

Ejemplo:

```txt
1 hamburguesa con papas = 25 ml de aceite
1 pollo frito = 80 ml de aceite
1 hotdog con papa = 20 ml de aceite
```

Ventaja: fácil de automatizar.
Desventaja: no siempre refleja el consumo real.

---

# Opción B: Control por producción o jornada

Esta es más realista para aceite de freidora.

Ejemplo:

Al iniciar el día, cocina carga:

```txt
Freidora #1:
Aceite cargado: 8 litros
```

Al final del día, se mide o estima:

```txt
Aceite restante útil: 5.5 litros
Aceite perdido / consumido: 2.5 litros
```

Entonces el sistema registra:

```txt
Salida de inventario:
Aceite: -2.5 litros
Motivo: consumo de jornada
```

Esta opción es mejor para restaurantes donde se fríe mucho.

---

## Mi recomendación para tu sistema

Para un sistema de restaurante profesional, usa una mezcla de ambas:

### Para ingredientes medibles:

Descuenta por receta.

Ejemplo:

```txt
Pan
Carne
Queso
Papas
Salsas
Refrescos
```

### Para aceite de freidora:

Usa control por jornada o producción.

Ejemplo:

```txt
Inicio de jornada:
Freidora cargada con 10 litros

Fin de jornada:
Se registra consumo real o estimado
```

Así el inventario será mucho más realista.

---

## Flujo recomendado en el sistema

```txt
1. Se compra aceite
   → Entrada de inventario

2. Se asigna aceite a cocina o freidora
   → Movimiento interno o salida a producción

3. Se venden productos fritos
   → Opcionalmente se estima consumo por receta

4. Al cierre del día
   → Cocina registra aceite consumido real

5. El sistema compara:
   Consumo esperado vs consumo real

6. Si hay diferencia
   → Se registra merma o ajuste
```

---

## Ejemplo práctico

Inventario inicial:

```txt
Aceite disponible: 20 litros
```

Durante el día:

```txt
Se cargan 8 litros en la freidora
```

Ventas del día:

```txt
20 hamburguesas con papas
15 hotdogs con papas
10 pollos fritos
```

Consumo estimado por receta:

```txt
20 × 25 ml = 500 ml
15 × 20 ml = 300 ml
10 × 80 ml = 800 ml

Total estimado: 1,600 ml = 1.6 litros
```

Pero al cierre cocina reporta:

```txt
Aceite real consumido: 2.3 litros
```

Entonces el sistema puede registrar:

```txt
Consumo estimado: 1.6 L
Consumo real: 2.3 L
Diferencia: 0.7 L

Diferencia registrada como:
Merma / evaporación / desperdicio / exceso de uso
```

Esto te ayuda a detectar pérdidas.

---

## Tablas básicas que necesitas

### productos_inventario

```txt
id
nombre
categoria
unidad_base
stock_actual
stock_minimo
costo_promedio
activo
```

Ejemplo:

```txt
Aceite vegetal
unidad_base: ml
stock_actual: 20000
stock_minimo: 5000
```

---

### inventario_movimientos

```txt
id
producto_id
tipo
cantidad
stock_antes
stock_despues
motivo
referencia
fecha
usuario_id
```

Tipos:

```txt
entrada
salida
consumo
merma
ajuste
devolucion
transferencia
```

---

### recetas

```txt
id
producto_venta_id
insumo_id
cantidad
unidad
```

Ejemplo:

```txt
Producto venta: Pollo frito
Insumo: Aceite
Cantidad: 80
Unidad: ml
```

---

### produccion_cocina

```txt
id
fecha
area
producto_id
cantidad_usada
responsable
observacion
```

Ejemplo:

```txt
Aceite usado en freidora
cantidad_usada: 2.5 litros
responsable: cocinero
```

---

## Regla clave

No hagas esto:

```txt
Vendo una orden de papas → descuento 1 botella de aceite
```

Eso sería incorrecto.

Haz esto:

```txt
Vendo una orden de papas → descuento 25 ml estimados
```

O mejor:

```txt
Al cierre de cocina → descuento el aceite real usado en la freidora
```

---

## Cómo lo pondría en tu sistema

En tu módulo de inventario pondría estas secciones:

```txt
Inventario general
Compras / Entradas
Recetas
Producción de cocina
Mermas y ajustes
Cierre de cocina
Reporte de consumo
```

Y para aceite específicamente:

```txt
Control de aceite:
- Stock actual
- Aceite comprado
- Aceite enviado a cocina
- Aceite cargado en freidora
- Aceite consumido
- Aceite desechado
- Diferencia entre consumo esperado y real
```

---

La forma más profesional sería manejar el aceite como **insumo reutilizable de producción**, no solamente como ingrediente de receta. Para comenzar, puedes implementar primero el descuento por receta y luego agregar el cierre de cocina con consumo real.
