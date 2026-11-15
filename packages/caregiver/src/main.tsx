import { createRoot } from "react-dom/client";
import { demoProfile } from "./fixtures.ts";
import { CaregiverService } from "./service.ts";
import { IndexedDbStore, MemoryStore } from "./store.ts";
import { App } from "./ui/App.tsx";

const params = new URLSearchParams(window.location.search);
const store = typeof indexedDB === "undefined" || params.get("store") === "memory" ? new MemoryStore() : new IndexedDbStore();
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <App
      service={new CaregiverService({ store })}
      profile={demoProfile()}
      demo
      initialLang={params.get("lang") === "fr" ? "fr" : "en"}
      initialView={params.get("view") === "caregiver" ? "caregiver" : "owner"}
    />,
  );
}
