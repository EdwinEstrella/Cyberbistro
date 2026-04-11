import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { AutoUpdateListener } from "../features/updates/AutoUpdateListener";
import { router } from "./routes";

export default function App() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <Toaster richColors position="top-center" closeButton />
      <AutoUpdateListener />
      <RouterProvider router={router} />
    </div>
  );
}
