import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AppUpdateProvider } from "../features/updates/AppUpdateContext";
import { AppUpdateOverlay } from "../features/updates/components/AppUpdateOverlay";
import { ThemeProvider } from "../shared/context/ThemeContext";
import { router } from "./routes";

export default function App() {
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
