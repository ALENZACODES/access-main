import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { HANDOFF_REGISTER } from "./handoffRegister";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 20, 9, 0, 0);

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the links-to-other-apps section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make().c.html()).not.toContain("data-privacy-handoff");
  });
  it("is hidden for an empty list, and its buttons do nothing", () => {
    const { c } = make({ handoffs: [] });
    expect(c.html()).not.toContain("data-privacy-handoff");
    expect(c.dispatch({ type: "export-handoff-csv" }).lastExport).toBeNull();
    expect(c.dispatch({ type: "export-handoff-text" }).status).toBeNull();
  });
  it("shows the section with the real list and its buttons", () => {
    const html = make({ handoffs: HANDOFF_REGISTER }).c.html();
    expect(html).toContain("data-privacy-handoff");
    expect(html).toContain("3 links are listed, at 3 places in 3 files.");
    expect(html).toContain("Your email app");
    expect(html).toContain("Download this list (CSV)");
  });
  it("shows it in French after the language is changed", () => {
    const { c } = make({ handoffs: HANDOFF_REGISTER });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Liens qui ouvrent une autre application");
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-handoff");
  });
});

describe("downloading the list", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make({ handoffs: HANDOFF_REGISTER });
    const csv = c.dispatch({ type: "export-handoff-csv" });
    expect(csv.lastExport).toMatchObject({ mime: "text/csv", count: 3, filename: "the-app-links-to-other-apps-2026-11-20.csv" });
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("List of links that open another app prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-handoff-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Liste des liens qui ouvrent une autre application préparée en texte.");
  });
  it("uses a comma in English and a semicolon in French", () => {
    const { c } = make({ handoffs: HANDOFF_REGISTER });
    expect(c.dispatch({ type: "export-handoff-csv" }).lastExport?.text.split("\r\n")[0]).toContain("What it is,What opens");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-handoff-csv" }).lastExport?.text.split("\r\n")[0]).toContain("De quoi il s’agit;Ce qui s’ouvre");
  });
  it("closes the erase question and replaces the earlier file", () => {
    const { c, storage } = make({ handoffs: HANDOFF_REGISTER });
    storage.setItem(`${PREFIX}x`, "1");
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    const first = c.dispatch({ type: "export-handoff-csv" });
    expect(first.confirmingErase).toBe(false);
    expect(c.dispatch({ type: "export-handoff-text" }).lastExport).not.toBe(first.lastExport);
  });
  it("writes nothing to the device's storage", () => {
    const { c, storage } = make({ handoffs: HANDOFF_REGISTER });
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-handoff-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages, and not when it is off", () => {
    const { c, storage } = make({ handoffs: HANDOFF_REGISTER, logActivity: true });
    c.dispatch({ type: "export-handoff-csv" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "handoff-export");
    expect(entries).toHaveLength(1);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the list of links to other apps (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Liste des liens vers d’autres applications téléchargée (CSV)");
    const off = make({ handoffs: HANDOFF_REGISTER });
    off.c.dispatch({ type: "export-handoff-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
  });
});

class FakeRoot {
  innerHTML = "";
  hidden = false;
  private handlers: Array<(e: PanelEvent) => void> = [];
  addEventListener(_type: "click" | "change", h: (e: PanelEvent) => void): void {
    this.handlers.push(h);
  }
  querySelector() {
    return { focus: () => undefined };
  }
  click(action: string): void {
    const target: ActionTarget = { getAttribute: (n) => (n === "data-action" ? action : null) };
    for (const h of this.handlers) h({ target: { closest: () => target } });
  }
}

describe("the mounted panel", () => {
  it("hands the file to the page for either button", () => {
    const { c } = make({ handoffs: HANDOFF_REGISTER });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-handoff-csv");
    root.click("export-handoff-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
  });
  it("does not hand over a file when the section is off", () => {
    const { c } = make();
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-handoff-csv");
    expect(files).toEqual([]);
  });
});
