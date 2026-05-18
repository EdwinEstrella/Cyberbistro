import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./shared/styles/index.css";

// Cleanup legacy lock state from previous versions.
localStorage.removeItem("cloudix_pos_locked");

createRoot(document.getElementById("root")!).render(<App />);
