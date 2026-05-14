
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./shared/styles/index.css";

  // Lock the POS on app startup so users must enter their PIN to continue working (Electron only)
  if (Boolean((window as any).electronAPI)) {
    localStorage.setItem("cloudix_pos_locked", "true");
  } else {
    localStorage.removeItem("cloudix_pos_locked");
  }

  createRoot(document.getElementById("root")!).render(<App />);
  