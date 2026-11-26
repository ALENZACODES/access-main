import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { RETENTION_REGISTER } from "./retentionRegister";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 20, 9, 0, 0);

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the how-long-kept section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make().c.html()).not.toContain("data-privacy-retention");
  });
  it("is hidden for an empty list, and its buttons do nothing", () => {
    const { c } = make({ retention: [] });
    expect(c.html()).not.toContain("data-privacy-retention");
    expect(c.dispatch({ type: "export-retention-csv" }).lastExport).toBeNull();
    expect(c.getState().status).toBeNull();
  });
  it("shows the section with the real list and its buttons", () => {
    const html = make({ retention: RETENTION_REGISTER }).c.html();
    expect(html).toContain("data-privacy-retention");
    expect(html).toContain("17 stored items are listed.");
    expect(html).toContain("Expires 90 days after the latest save.");
    expect(html).toContain("Download this list (CSV)");
  });
  it("shows it in French after the language is changed", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Combien de temps l’App garde les choses");
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-retention");
  });
  it("lists the store that could not be read as Unknown", () => {
    expect(make({ retention: RETENTION_REGISTER }).c.html()).toContain(">Unknown</span>");
  });
});

describe("downloading the list", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    const csv = c.dispatch({ type: "export-retention-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(csv.lastExport?.count).toBe(17);
    expect(csv.lastExport?.filename).toBe("the-app-how-long-kept-2026-11-20.csv");
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("List of how long the App keeps things prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-retention-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Liste de la durée de conservation de l’App préparée en texte.");
  });
  it("uses a semicolon in French and a comma in English", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    expect(c.dispatch({ type: "export-retention-csv" }).lastExport?.text.split("\r\n")[0]).toContain("Stored under,What is kept");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-retention-csv" }).lastExport?.text.split("\r\n")[0]).toContain("Enregistré sous;Ce qui est gardé");
  });
  it("closes the erase question and replaces the earlier file", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    c.dispatch({ type: "export-retention-csv" });
    const first = c.getState().lastExport;
    c.dispatch({ type: "export-retention-text" });
    expect(c.getState().lastExport).not.toBe(first);
    expect(c.getState().confirmingErase).toBe(false);
  });
  it("writes nothing to the device's storage", () => {
    const { c, storage } = make({ retention: RETENTION_REGISTER });
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-retention-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages, and not when it is off", () => {
    const { c, storage } = make({ retention: RETENTION_REGISTER, logActivity: true });
    c.dispatch({ type: "export-retention-csv" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "retention-export");
    expect(entries).toHaveLength(1);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the list of how long the App keeps things (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Liste de la durée de conservation téléchargée (CSV)");
    const off = make({ retention: RETENTION_REGISTER });
    off.c.dispatch({ type: "export-retention-csv" });
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
    const { c } = make({ retention: RETENTION_REGISTER });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-retention-csv");
    root.click("export-retention-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
  });
  it("does not hand over a file when the section is off", () => {
    const { c } = make();
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-retention-csv");
    expect(files).toEqual([]);
  });
});

describe("comparing with what is stored", () => {
  it("says nothing was compared for an empty device, and shows the result in the section", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    expect(c.html()).not.toContain("data-privacy-retention-check");
    const s = c.dispatch({ type: "check-retention" });
    expect(s.status).toEqual({ kind: "retention-checked", compared: 0, differences: 0 });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("Compared 0 stored items with the list. No differences found.");
    expect(c.html()).toContain("data-privacy-retention-check");
    expect(c.html()).toContain("Compare with what is stored now");
  });
  it("lists a difference in the section and counts it in the status", () => {
    const { c, storage } = make({ retention: RETENTION_REGISTER });
    storage.setItem("access.activity.v1", "[]");
    const s = c.dispatch({ type: "check-retention" });
    expect(s.status).toEqual({ kind: "retention-checked", compared: 1, differences: 1 });
    expect(c.html()).toContain("access.activity.v1: stored with no end date, but the list says 90 days.");
  });
  it("says the same in French", () => {
    const { c, storage } = make({ retention: RETENTION_REGISTER });
    storage.setItem("access.activity.v1", "[]");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "check-retention" });
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("1 élément conservé comparé à la liste. 1 différence trouvée.");
    expect(c.html()).toContain("conservé sans date de fin, alors que la liste indique 90 jours.");
  });
  it("does nothing when there is no list, and does not write to storage", () => {
    expect(make().c.dispatch({ type: "check-retention" }).status).toBeNull();
    const { c, storage } = make({ retention: RETENTION_REGISTER });
    storage.setItem("access.activity.v1", "[]");
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "check-retention" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("is cleared of the earlier download, and the mounted button runs it", () => {
    const { c } = make({ retention: RETENTION_REGISTER });
    c.dispatch({ type: "export-retention-csv" });
    expect(c.dispatch({ type: "check-retention" }).lastExport).toBeNull();
    const root = new FakeRoot();
    mountPrivacyPanel(root, make({ retention: RETENTION_REGISTER }).c, {});
    root.click("check-retention");
    expect(root.innerHTML).toContain("data-privacy-retention-check");
  });
});
