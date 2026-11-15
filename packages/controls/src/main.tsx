import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { CONTROL_MODES, type ControlMode } from "./types.ts";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const modeParam = params.get("mode");
const initialMode: ControlMode = (CONTROL_MODES as readonly string[]).includes(modeParam ?? "") ? (modeParam as ControlMode) : "keyboard";
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App initialLang={params.get("lang") === "fr" ? "fr" : "en"} initialMode={initialMode} />
    </StrictMode>,
  );
}
