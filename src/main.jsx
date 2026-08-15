import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./storage.js"; // installs window.storage before App mounts
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
