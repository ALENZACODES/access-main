import React from "react";
import { createRoot } from "react-dom/client";
import { Harness } from "./Harness.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
