import { createBrowserRouter } from "react-router";
import { Login } from "./components/login";
import { AppLayout } from "./components/layout";
import { Dashboard } from "./components/dashboard";
import { Tables } from "./components/tables";
import { Billing } from "./components/billing";

export const router = createBrowserRouter([
  { path: "/", Component: Login },
  {
    Component: AppLayout,
    children: [
      { path: "/dashboard", Component: Dashboard },
      { path: "/tables", Component: Tables },
      { path: "/billing", Component: Billing },
    ],
  },
]);
