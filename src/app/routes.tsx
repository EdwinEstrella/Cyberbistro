import { createHashRouter } from "react-router";
import { Login, Register } from "../features/auth";
import { AppLayout } from "./components/AppLayout";
import { FeatureGuard } from "./components/FeatureGuard";

export const router = createHashRouter([
  { path: "/", Component: Login },
  { path: "/register", Component: Register },
  { path: "/super-admin", lazy: () => import("../features/super-admin").then(({ SuperAdmin }) => ({ Component: SuperAdmin })) },
  {
    Component: AppLayout,
    HydrateFallback: () => null,
    children: [
      { path: "/dashboard", lazy: () => import("../features/dashboard").then(({ Dashboard }) => ({ Component: Dashboard })) },
      { path: "/clientes", lazy: () => import("../features/clientes").then(({ Clientes }) => ({ Component: Clientes })) },
      { path: "/tables", lazy: () => import("../features/tables").then(({ Tables }) => ({ Component: Tables })) },
      { path: "/billing", lazy: () => import("../features/billing").then(({ Billing }) => ({ Component: Billing })) },
      { path: "/gastos", lazy: () => import("../features/gastos").then(({ Gastos }) => ({ Component: Gastos })) },
      { path: "/cierre", lazy: () => import("../features/cierre").then(({ Cierre }) => ({ Component: Cierre })) },
      { path: "/cocina", lazy: () => import("../features/cocina").then(({ Cocina }) => ({ Component: Cocina })) },
      { path: "/entregas", lazy: () => import("../features/entregas").then(({ Entregas }) => ({ Component: Entregas })) },
      { path: "/camarera", lazy: () => import("../features/camarera").then(({ Camarera }) => ({ Component: Camarera })) },
      { path: "/soporte", lazy: () => import("../features/soporte").then(({ Soporte }) => ({ Component: Soporte })) },
      { path: "/ajustes", lazy: () => import("../features/ajustes").then(({ Ajustes }) => ({ Component: Ajustes })) },
      { path: "/inventario", lazy: () => import("../features/inventario").then(({ Inventario }) => ({ Component: () => <FeatureGuard feature="advanced_inventory"><Inventario /></FeatureGuard> })) },
      { path: "/compras", lazy: () => import("../features/compras").then(({ Compras }) => ({ Component: () => <FeatureGuard feature="inventory_purchases"><Compras /></FeatureGuard> })) },
      { path: "/cuentas-pagar", lazy: () => import("../features/cuentas-pagar").then(({ CuentasPagar }) => ({ Component: () => <FeatureGuard feature="accounts_payable"><CuentasPagar /></FeatureGuard> })) },
      { path: "/cuentas-cobrar", lazy: () => import("../features/cuentas-cobrar").then(({ CuentasCobrar }) => ({ Component: () => <FeatureGuard feature="accounts_receivable"><CuentasCobrar /></FeatureGuard> })) },
      { path: "/pedidos", lazy: () => import("../features/pedidos").then(({ Pedidos }) => ({ Component: () => <FeatureGuard feature="digital_menu"><Pedidos /></FeatureGuard> })) },
    ],
  },
], {
  hydrationData: undefined,
});
