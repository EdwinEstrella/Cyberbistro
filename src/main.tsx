
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./shared/styles/index.css";

  // Lock the POS on app startup so users must enter their PIN to continue working
  localStorage.setItem("cloudix_pos_locked", "true");

  createRoot(document.getElementById("root")!).render(<App />);
  