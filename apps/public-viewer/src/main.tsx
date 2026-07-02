import React from "react";
import ReactDOM from "react-dom/client";

import { EntryChooser } from "./EntryChooser";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <EntryChooser />
  </React.StrictMode>
);
