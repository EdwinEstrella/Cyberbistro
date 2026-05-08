import { createHashRouter } from "react-router";
import { Login, Register } from "../features/auth";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "../features/dashboard";
import { Tables } from "../features/tables";
import { Billing } from "../features/billing";
import { Gastos } from "../features/gastos";
import { Cocina } from "../features/cocina";
import { Entregas } from "../features/entregas";
import { Soporte } from "../features/soporte";
import { Ajustes } from "../features/ajustes";
import { Cierre } from "../features/cierre";
import { SuperAdmin } from "../features/super-admin";

export const router = createHashRouter([
  { path: "/", Component: Login },
  { path: "/register", Component: Register },
  { path: "/super-admin", Component: SuperAdmin },
  {
    Component: AppLayout,
    children: [
      { path: "/dashboard", Component: Dashboard },
      { path: "/tables", Component: Tables },
      { path: "/billing", Component: Billing },
      { path: "/gastos", Component: Gastos },
      { path: "/cierre", Component: Cierre },
      { path: "/cocina", Component: Cocina },
      { path: "/entregas", Component: Entregas },
      { path: "/soporte", Component: Soporte },
      { path: "/ajustes", Component: Ajustes },
    ],
  },
]);
