import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AppUpdateProvider } from "../features/updates/AppUpdateContext";
import { AppUpdateOverlay } from "../features/updates/components/AppUpdateOverlay";
import { ThemeProvider } from "../shared/context/ThemeContext";
import { useElectronInputFocusRecovery } from "../shared/hooks/useElectronInputFocusRecovery";
import { router } from "./routes";

export default function App() {
  useElectronInputFocusRecovery();

  return (
    <ThemeProvider>
      <div className="h-full min-h-0 overflow-hidden bg-background text-foreground transition-colors duration-300">
        <Toaster richColors position="top-center" closeButton />
        <AppUpdateProvider>
          <RouterProvider router={router} />
          <AppUpdateOverlay />
        </AppUpdateProvider>
      </div>
    </ThemeProvider>
  );
}
