import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import type { ExportFile } from "./localData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import { SAVE_QUESTIONS, type SaveHost } from "./saveLive";
import { SAVE_REGISTER, type SaveRow } from "./saveRegister";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const hostWith = (over: Partial<SaveHost> = {}): SaveHost => ({ blob: () => true, address: () => true, attribute: () => true, ...over });

function make(patch: Partial<ControllerDeps> = {}, host: SaveHost = hostWith()) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, save: { register: SAVE_REGISTER, host }, ...patch }) };
}

const one = (over: Partial<SaveRow> = {}): SaveRow => ({
  kind: "json",
  path: "apps/web/src/pages/Example.tsx",
  uses: 1,
  makes: { en: "An example file", fr: "Un fichier d’exemple" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("the downloads section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make({ save: undefined }).c.html()).not.toContain("data-privacy-save");
  });

  it("is hidden for an empty list, and its buttons do nothing", async () => {
    const { c } = make({ save: { register: [], host: hostWith() } });
    expect(c.html()).not.toContain("data-privacy-save");
    expect(c.dispatch({ type: "export-save-csv" }).lastExport).toBeNull();
    expect(c.dispatch({ type: "export-save-text" }).lastExport).toBeNull();
    expect((await c.dispatchAsync({ type: "check-save" })).saveCheck).toBeNull();
    expect(c.getState().status).toBeNull();
  });

  it("shows the section with the real list and its buttons", () => {
    const html = make().c.html();
    expect(html).toContain("data-privacy-save");
    expect(html).toContain(`${SAVE_REGISTER.length} rows are listed`);
    for (const a of ["check-save", "export-save-csv", "export-save-text"]) expect(html).toContain(`data-action="${a}"`);
  });

  it("shows it in French after the language is changed", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Où l’App fabrique des fichiers à enregistrer");
  });

  it("is on in the live controller, with the browser's host", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-save");
    expect(liveControllerDeps().save?.register).toBe(SAVE_REGISTER);
    expect(liveControllerDeps().save?.host.blob).toBeTypeOf("function");
  });

  it("comes after the web address section and before the how-long-kept section", () => {
    const html = make({ ...liveControllerDeps() }).c.html();
    expect(html.indexOf("data-privacy-query")).toBeLessThan(html.indexOf("data-privacy-save"));
    expect(html.indexOf("data-privacy-save")).toBeLessThan(html.indexOf("data-privacy-retention"));
  });
});

describe("asking the browser now", () => {
  it("shows no answers until the person asks", () => {
    expect(make().c.html()).not.toContain("data-privacy-save-check");
    expect(make().c.getState().saveCheck).toBeNull();
  });

  it("keeps the answers and says how many came", async () => {
    const { c } = make();
    const s = await c.dispatchAsync({ type: "check-save" });
    expect(s.saveCheck?.answered).toBe(3);
    expect(s.saveCheck?.reading).toEqual({ blob: true, address: true, attribute: true });
    expect(s.status).toEqual({ kind: "save-checked", answered: 3, asked: 3 });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("3 answers to 3 questions.");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("3 réponses sur 3 questions.");
  });

  it("shows the answers in the panel, in the language of the panel", async () => {
    const { c } = make({}, hostWith({ address: () => false }));
    await c.dispatchAsync({ type: "check-save" });
    expect(c.html()).toContain('data-label="Answer">No<');
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain('data-label="Réponse">Non<');
  });

  it("asks each of the three questions once for each press", async () => {
    const asked: string[] = [];
    const { c } = make({}, hostWith({ blob: () => (asked.push("blob"), true), address: () => (asked.push("address"), true), attribute: () => (asked.push("attribute"), true) }));
    await c.dispatchAsync({ type: "check-save" });
    await c.dispatchAsync({ type: "check-save" });
    expect(asked).toEqual(["blob", "address", "attribute", "blob", "address", "attribute"]);
  });

  it("asks again and replaces the earlier answers", async () => {
    let blob = true;
    const { c } = make({}, hostWith({ blob: () => blob }));
    await c.dispatchAsync({ type: "check-save" });
    blob = false;
    const s = await c.dispatchAsync({ type: "check-save" });
    expect(s.saveCheck?.reading.blob).toBe(false);
    expect(c.html()).toContain("the browser says this is not available here");
  });

  it("says unknown for a browser that gives nothing, and does not throw", async () => {
    const { c } = make({}, {});
    const s = await c.dispatchAsync({ type: "check-save" });
    expect(s.saveCheck?.answered).toBe(0);
    expect(s.status).toEqual({ kind: "save-checked", answered: 0, asked: SAVE_QUESTIONS.length });
    expect(c.html()).not.toContain('data-label="Answer">No<');
  });

  it("copes with a host that throws on every question", async () => {
    const boom = (): never => {
      throw new Error("no");
    };
    const { c } = make({}, { blob: boom, address: boom, attribute: boom });
    expect((await c.dispatchAsync({ type: "check-save" })).saveCheck?.answered).toBe(0);
  });

  it("clears the erase confirmation and an earlier download", async () => {
    const { c, storage } = make();
    storage.setItem(`${PREFIX}a`, "1");
    c.dispatch({ type: "export-save-csv" });
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    const s = await c.dispatchAsync({ type: "check-save" });
    expect(s.confirmingErase).toBe(false);
    expect(s.lastExport).toBeNull();
  });

  it("writes nothing to the device's storage, and records nothing in the activity log", async () => {
    const { c, storage } = make({ logActivity: true });
    const before = JSON.stringify(Object.entries(storage));
    await c.dispatchAsync({ type: "check-save" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
    expect(loadActivity(storage, PREFIX, NOW)).toEqual([]);
  });

  it("keeps the answers only in memory: a new controller starts with none", async () => {
    const a = make();
    await a.c.dispatchAsync({ type: "check-save" });
    const b = createPrivacyController({ storage: a.storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, save: { register: SAVE_REGISTER, host: hostWith() } });
    expect(b.getState().saveCheck).toBeNull();
  });

  it("makes no file: the check hands nothing to the download", async () => {
    const { c } = make();
    expect((await c.dispatchAsync({ type: "check-save" })).lastExport).toBeNull();
  });
});

describe("downloading the list", () => {
  it("prepares a CSV with one row per row of the list and says so", () => {
    const s = make().c.dispatch({ type: "export-save-csv" });
    expect(s.lastExport?.mime).toBe("text/csv");
    expect(s.lastExport?.count).toBe(SAVE_REGISTER.length);
    expect(s.lastExport?.filename).toBe("the-app-files-it-makes-2026-11-21.csv");
    expect(s.status).toEqual({ kind: "save-exported", format: "csv" });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of where the App makes files for you to save prepared as CSV.");
  });

  it("prepares a text file", () => {
    const s = make().c.dispatch({ type: "export-save-text" });
    expect(s.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of where the App makes files for you to save prepared as text.");
  });

  it("gives a semicolon-separated CSV in French and says so in French", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "export-save-csv" });
    expect(s.lastExport?.text.split("\r\n")[0]).toContain(";");
    expect(s.lastExport?.filename).toBe("l-app-fichiers-qu-elle-fabrique-2026-11-21.csv");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("Liste des endroits où l’App fabrique des fichiers à enregistrer préparée au format CSV.");
    expect(PANEL_STRINGS.fr.status(c.dispatch({ type: "export-save-text" }).status!)).toBe("Liste des endroits où l’App fabrique des fichiers à enregistrer préparée en texte.");
  });

  it("uses the list it was given, not the App's", () => {
    const s = make({ save: { register: [one()], host: hostWith() } }).c.dispatch({ type: "export-save-csv" });
    expect(s.lastExport?.count).toBe(1);
    expect(s.lastExport?.text).toContain("An example file");
  });

  it("writes nothing to the device's storage", () => {
    const { c, storage } = make();
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-save-csv" });
    c.dispatch({ type: "export-save-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
});

describe("the record of what the person did", () => {
  it("logs a download with its format, and nothing else about it", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-save-csv" });
    c.dispatch({ type: "export-save-text" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "save-export");
    expect(entries.map((e) => (e as { format?: string }).format).sort()).toEqual(["csv", "text"]);
    expect(JSON.stringify(entries)).not.toContain("apps/web");
  });

  it("describes the entry in both languages", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-save-csv" });
    const e = loadActivity(storage, PREFIX, NOW).find((x) => x.kind === "save-export")!;
    expect(activityText("en", e, () => undefined)).toBe("Downloaded the list of where the App makes files for you to save (CSV)");
    expect(activityText("fr", e, () => undefined)).toBe("Liste des endroits où l’App fabrique des fichiers à enregistrer téléchargée (CSV)");
  });

  it("does not log when logging is off, or when the list is empty", () => {
    const off = make();
    off.c.dispatch({ type: "export-save-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
    const { c, storage } = make({ save: { register: [], host: hostWith() }, logActivity: true });
    c.dispatch({ type: "export-save-csv" });
    expect(loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "save-export")).toEqual([]);
  });
});

describe("pressing the buttons through the panel", () => {
  class FakeRoot implements PanelRoot {
    innerHTML = "";
    focused: string[] = [];
    private handlers: Array<(e: PanelEvent) => void> = [];
    addEventListener(type: "click" | "change", handler: (e: PanelEvent) => void): void {
      if (type === "click") this.handlers.push(handler);
    }
    querySelector(selector: string): { focus(): void } | null {
      return { focus: () => this.focused.push(selector) };
    }
    click(action: string): void {
      const event: PanelEvent = { target: { closest: (s: string): ActionTarget | null => (s === "[data-action]" ? { getAttribute: (n) => (n === "data-action" ? action : null) } : null) } };
      for (const h of this.handlers) h(event);
    }
  }

  for (const action of ["export-save-csv", "export-save-text"] as const) {
    it(`${action} hands one file to the download and moves focus to the status`, () => {
      const { c } = make();
      const root = new FakeRoot();
      const exported: ExportFile[] = [];
      mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
      root.click(action);
      expect(exported).toHaveLength(1);
      expect(exported[0]?.count).toBe(SAVE_REGISTER.length);
      expect(root.focused.at(-1)).toBe("[data-privacy-status]");
      expect(root.innerHTML).toContain("List of where the App makes files for you to save prepared as");
    });
  }

  it("check-save shows the answers and moves focus to the status, and hands over no file", async () => {
    const { c } = make();
    const root = new FakeRoot();
    const exported: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
    root.click("check-save");
    for (let i = 0; i < 20 && !root.innerHTML.includes("data-privacy-save-check"); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(root.innerHTML).toContain("data-privacy-save-check");
    expect(root.innerHTML).toContain("3 answers to 3 questions.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
    expect(exported).toEqual([]);
  });
});
