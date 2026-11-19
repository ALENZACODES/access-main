import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { DEVICE_REGISTER } from "./deviceRegister";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const KEPT = { register: STORAGE_REGISTER, unscanned: UNSCANNED };

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the download of everything kept", () => {
  it("shows its two buttons only when the App's lists are given", () => {
    expect(make().c.html()).not.toContain('data-action="export-kept-csv"');
    const html = make({ kept: KEPT }).c.html();
    expect(html).toContain('data-action="export-kept-csv"');
    expect(html).toContain('data-action="export-kept-text"');
    expect(html).toContain("Download everything kept on this device (CSV)");
  });
  it("does nothing when asked without the lists", () => {
    const { c } = make();
    const s = c.dispatch({ type: "export-kept-csv" });
    expect(s.lastExport).toBeNull();
    expect(s.status).toBeNull();
  });
  it("prepares a CSV with the register, the cache and database rows and the unread storage", () => {
    const { c } = make({ kept: KEPT });
    const s = c.dispatch({ type: "export-kept-csv" });
    expect(s.status).toEqual({ kind: "kept-exported", format: "csv" });
    expect(s.lastExport?.mime).toBe("text/csv");
    expect(s.lastExport?.count).toBe(STORAGE_REGISTER.length + DEVICE_REGISTER.length + UNSCANNED.length);
    expect(s.lastExport?.filename).toBe("the-app-everything-kept-2026-11-19.csv");
    expect(s.lastExport?.text).toContain("Map tiles saved for offline use");
    expect(s.lastExport?.text).toContain("Offline region data you downloaded");
  });
  it("prepares a text file in French with the French wording", () => {
    const { c } = make({ kept: KEPT });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "export-kept-text" });
    expect(s.lastExport?.filename).toBe("l-app-tout-ce-qui-est-conserve-2026-11-19.txt");
    expect(s.lastExport?.text).toContain("Les données de région hors ligne que vous avez téléchargées");
    expect(c.html()).toContain("Liste de tout ce que l’App conserve sur cet appareil préparée en texte.");
  });
  it("uses a semicolon in French CSV", () => {
    const { c } = make({ kept: KEPT });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-kept-csv" }).lastExport?.text.split("\r\n")[0]).toContain(";");
  });
  it("answers the offline storage button question from the prefixes the panel was given", () => {
    const host = { caches: { keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) } };
    const { c } = make({ kept: KEPT, device: { host, cachePrefix: "app-shell-" }, deviceRegister: DEVICE_REGISTER });
    const rows = c.dispatch({ type: "export-kept-csv" }).lastExport?.text.split("\r\n") ?? [];
    expect(rows.find((r) => r.includes("Copies of App pages"))).toContain(",Yes,");
    expect(rows.find((r) => r.includes("Map tiles saved"))).toContain(",No,");
  });
  it("says not confirmed for the offline storage button when no device section is on", () => {
    const { c } = make({ kept: KEPT });
    const rows = c.dispatch({ type: "export-kept-csv" }).lastExport?.text.split("\r\n") ?? [];
    expect(rows.find((r) => r.includes("Map tiles saved"))).toContain("Not confirmed");
  });
  it("does not touch what is stored", () => {
    const { c, storage } = make({ kept: KEPT });
    storage.setItem(`${PREFIX}a`, "1");
    c.dispatch({ type: "export-kept-text" });
    expect(storage.getItem(`${PREFIX}a`)).toBe("1");
  });
  it("is recorded in the activity list, in both languages", () => {
    const { c, storage } = make({ kept: KEPT, logActivity: true });
    c.dispatch({ type: "export-kept-csv" });
    const [entry] = loadActivity(storage, PREFIX, NOW);
    expect(entry).toMatchObject({ kind: "kept-export", format: "csv" });
    expect(activityText("en", entry!, () => undefined)).toBe("Downloaded the list of everything kept (CSV)");
    expect(activityText("fr", { ...entry!, format: "text" }, () => undefined)).toBe("Liste de tout ce qui est conservé téléchargée (texte)");
  });
  it("closes an open erase confirmation, like the other downloads", () => {
    const { c } = make({ kept: KEPT });
    c.dispatch({ type: "erase-ask" });
    expect(c.dispatch({ type: "export-kept-csv" }).confirmingErase).toBe(false);
  });
  it("is part of the live controller's settings", () => {
    expect(liveControllerDeps().kept).toEqual({ register: STORAGE_REGISTER, unscanned: UNSCANNED });
  });
  it("has status wording in both languages", () => {
    for (const l of ["en", "fr"] as const) {
      expect(PANEL_STRINGS[l].status({ kind: "kept-exported", format: "csv" })).toMatch(/CSV/);
      expect(PANEL_STRINGS[l].status({ kind: "kept-exported", format: "text" })).not.toMatch(/CSV/);
    }
  });
});

type Handler = (e: PanelEvent) => void;
class FakeRoot {
  innerHTML = "";
  hidden = false;
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  querySelector() {
    return { focus: () => undefined };
  }
  click(action: string): void {
    const target: ActionTarget = { getAttribute: (n) => (n === "data-action" ? action : null) };
    const event: PanelEvent = { target: { closest: () => target } };
    for (const h of this.handlers.get("click") ?? []) h(event);
  }
}

describe("the mounted panel", () => {
  it("hands the file to the page when a person presses either button", () => {
    const { c } = make({ kept: KEPT });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-kept-csv");
    root.click("export-kept-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
    expect(root.innerHTML).toContain("Download everything kept on this device");
  });
});
