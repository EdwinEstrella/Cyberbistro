import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AppUpdateProvider } from "../features/updates/AppUpdateContext";
import { AppUpdateOverlay } from "../features/updates/components/AppUpdateOverlay";
import { ThemeProvider } from "../shared/context/ThemeContext";
import { useElectronInputFocusRecovery } from "../shared/hooks/useElectronInputFocusRecovery";
import { router } from "./routes";
import { SucursalProvider } from "./context/SucursalContext";

export default function App() {
  useElectronInputFocusRecovery();

  return (
    <ThemeProvider>
      <div className="h-full min-h-0 overflow-hidden bg-background text-foreground transition-colors duration-300">
        <Toaster richColors position="top-center" closeButton />
        <AppUpdateProvider>
          <SucursalProvider>
            <RouterProvider router={router} />
            <AppUpdateOverlay />
          </SucursalProvider>
        </AppUpdateProvider>
      </div>
    </ThemeProvider>
  );
}
