import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";
import "./layout/timeline.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Expected a #root element for the desktop app.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

