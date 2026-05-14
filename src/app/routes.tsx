import { createHashRouter } from "react-router";
import { Login, Register } from "../features/auth";
import { AppLayout } from "./components/AppLayout";

export const router = createHashRouter([
  { path: "/", Component: Login },
  { path: "/register", Component: Register },
  { path: "/super-admin", lazy: () => import("../features/super-admin").then(({ SuperAdmin }) => ({ Component: SuperAdmin })) },
  {
    Component: AppLayout,
    HydrateFallback: () => null,
    children: [
      { path: "/dashboard", lazy: () => import("../features/dashboard").then(({ Dashboard }) => ({ Component: Dashboard })) },
      { path: "/tables", lazy: () => import("../features/tables").then(({ Tables }) => ({ Component: Tables })) },
      { path: "/billing", lazy: () => import("../features/billing").then(({ Billing }) => ({ Component: Billing })) },
      { path: "/gastos", lazy: () => import("../features/gastos").then(({ Gastos }) => ({ Component: Gastos })) },
      { path: "/cierre", lazy: () => import("../features/cierre").then(({ Cierre }) => ({ Component: Cierre })) },
      { path: "/cocina", lazy: () => import("../features/cocina").then(({ Cocina }) => ({ Component: Cocina })) },
      { path: "/entregas", lazy: () => import("../features/entregas").then(({ Entregas }) => ({ Component: Entregas })) },
      { path: "/camarera", lazy: () => import("../features/camarera").then(({ Camarera }) => ({ Component: Camarera })) },
      { path: "/soporte", lazy: () => import("../features/soporte").then(({ Soporte }) => ({ Component: Soporte })) },
      { path: "/ajustes", lazy: () => import("../features/ajustes").then(({ Ajustes }) => ({ Component: Ajustes })) },
    ],
  },
], {
  hydrationData: undefined,
});
