import { createHashRouter } from "react-router";
import { Login } from "../features/auth";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "../features/dashboard";
import { Tables } from "../features/tables";
import { Billing } from "../features/billing";
import { Cocina } from "../features/cocina";
import { Soporte } from "../features/soporte";
import { Ajustes } from "../features/ajustes";

export const router = createHashRouter([
  { path: "/", Component: Login },
  {
    Component: AppLayout,
    children: [
      { path: "/dashboard", Component: Dashboard },
      { path: "/tables", Component: Tables },
      { path: "/billing", Component: Billing },
      { path: "/cocina", Component: Cocina },
      { path: "/soporte", Component: Soporte },
      { path: "/ajustes", Component: Ajustes },
    ],
  },
]);