import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AppUpdateProvider } from "../features/updates/AppUpdateContext";
import { AppUpdateOverlay } from "../features/updates/components/AppUpdateOverlay";
import { router } from "./routes";

export default function App() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <Toaster richColors position="top-center" closeButton />
      <AppUpdateProvider>
        <RouterProvider router={router} />
        <AppUpdateOverlay />
      </AppUpdateProvider>
    </div>
  );
}
