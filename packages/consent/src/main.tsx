import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConsentPanel } from "./ConsentPanel.tsx";
import { createConsentEngine } from "./engine.ts";
import { PURPOSES } from "./purposes.ts";
import { createLocalStorageStore, createMemoryStore, type ConsentStore } from "./store.ts";
import type { Locale } from "./types.ts";
import "./consent.css";

function pickLocale(): Locale {
  const asked = new URLSearchParams(window.location.search).get("lang");
  if (asked === "fr" || asked === "en") return asked;
  return window.navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function pickStore(): ConsentStore {
  try {
    return createLocalStorageStore(window.localStorage);
  } catch {
    return createMemoryStore();
  }
}

const root = document.getElementById("root");
if (root) {
  const engine = createConsentEngine({ purposes: PURPOSES, store: pickStore() });
  createRoot(root).render(
    <StrictMode>
      <ConsentPanel engine={engine} initialLocale={pickLocale()} />
    </StrictMode>,
  );
}
