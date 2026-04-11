import { RouterProvider } from "react-router";
import { router } from "./routes";

export default function App() {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <RouterProvider router={router} />
    </div>
  );
}
