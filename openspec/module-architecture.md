# Arquitectura de Módulos — Plan Profesional (Issue #36)

## Sidebar agrupado por contexto

```
┌──────────────────────────┐
│  OPERACIÓN               │
│  ├ Venta                 │
│  ├ Camarera              │
│  ├ Mesas                 │
│  ├ Cocina                │
│  └ Entregas              │
│                          │
│  CLIENTES                │
│  └ Clientes              │
│                          │
│  INVENTARIO         🔒   │
│  ├ Productos             │
│  ├ Compras          🔒   │  ← PR 5
│  └ Proveedores      🔒   │  ← tab dentro de Compras
│                          │
│  FINANZAS                │
│  ├ Analíticas            │
│  ├ Gastos                │
│  ├ Cierre                │
│  ├ Cuentas x Cobrar 🔒   │  ← PR 9
│  └ Cuentas x Pagar  🔒   │  ← PR 8
│  ═══════════════════════ │
│  ⚙ Ajustes              │
└──────────────────────────┘
```

## Decisiones

1. **Secciones con headers** (no sub-menús colapsables) — todo visible, organizado
2. **Compras + Proveedores** en sección Inventario — compra es ENTRADA de stock
3. **Proveedores** como tab dentro de Compras — no standalone
4. **CxC + CxP** en Finanzas — conceptos financieros, no sub-vistas de clientes/proveedores
5. **Analíticas se amplía** con tabs para pro+ — no módulo separado
6. **Clientes** muestra deuda pero CxC se administra desde Finanzas

## Mapa de rutas

| Ruta | Feature dir | Plan |
|------|-------------|------|
| `/dashboard` | features/dashboard | todos |
| `/camarera` | features/camarera | todos |
| `/tables` | features/tables | todos |
| `/cocina` | features/cocina | todos |
| `/entregas` | features/entregas | todos |
| `/clientes` | features/clientes | todos |
| `/inventario` | features/inventario | profesional+ |
| `/compras` | features/compras | profesional+ |
| `/billing` | features/billing | todos (tabs extra pro+) |
| `/gastos` | features/gastos | todos |
| `/cierre` | features/cierre | todos |
| `/cuentas-cobrar` | features/cuentas-cobrar | profesional+ |
| `/cuentas-pagar` | features/cuentas-pagar | profesional+ |

## Orden de PRs

| PR | Contenido | Deps |
|----|-----------|------|
| PR 1 | canUseFeature + sidebar agrupado | — |
| PR 2 | Helpers inventario por presentación (botellas/ml) | — |
| PR 3 | Migración inventario avanzado (campos SQL) | PR 2 |
| PR 4 | UI inventario por presentación | PR 2, PR 3 |
| PR 5 | Modelo compras + proveedores | PR 1 |
| PR 6 | Servicio compras → inventario → movimiento | PR 5 |
| PR 7 | Compras → gastos + cierre/analíticas | PR 5, PR 6 |
| PR 8 | Cuentas por pagar | PR 5 |
| PR 9 | Cuentas por cobrar + fiado en POS | PR 1 |
| PR 10 | Analíticas financieras ampliadas | PR 7, PR 8, PR 9 |
| PR 11 | Menú Digital Administrable y Pedidos en Tiempo Real | PR 1, PR 9 |
