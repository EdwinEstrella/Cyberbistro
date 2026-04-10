import { createBrowserRouter } from "react-router";
import { LoginForm } from "../features/auth";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "../features/dashboard";
import { Tables } from "../features/tables";
import { Billing } from "../features/billing";

export const router = createBrowserRouter([
  { path: "/", Component: LoginForm },
  {
    Component: AppLayout,
    children: [
      { path: "/dashboard", Component: Dashboard },
      { path: "/tables", Component: Tables },
      { path: "/billing", Component: Billing },
    ],
  },
]);
