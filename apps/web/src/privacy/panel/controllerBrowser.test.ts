import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { BROWSER_QUESTIONS, type BrowserHost } from "./browserLive";
import { BROWSER_REGISTER, type BrowserRow } from "./browserRegister";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const hostWith = (over: Partial<BrowserHost> = {}): BrowserHost => ({
  language: () => "fr-CA",
  online: () => true,
  prefers: (s) => s === "motion",
  storage: async () => ({ usage: 5_000_000, quota: 2_000_000_000, persisted: false }),
  ...over,
});

function make(patch: Partial<ControllerDeps> = {}, host: BrowserHost = hostWith()) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, browser: { register: BROWSER_REGISTER, host }, ...patch }) };
}

const one = (over: Partial<BrowserRow> = {}): BrowserRow => ({
  kind: "language",
  path: "apps/web/src/pages/Example.tsx",
  uses: 1,
  asks: { en: "An example question", fr: "Une question d’exemple" },
  usedFor: { en: "An example use", fr: "Un usage d’exemple" },
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("the browser questions section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make({ browser: undefined }).c.html()).not.toContain("data-privacy-browser");
  });

  it("is hidden for an empty list, and its buttons do nothing", async () => {
    const { c } = make({ browser: { register: [], host: hostWith() } });
    expect(c.html()).not.toContain("data-privacy-browser");
    expect(c.dispatch({ type: "export-browser-csv" }).lastExport).toBeNull();
    expect(c.dispatch({ type: "export-browser-text" }).lastExport).toBeNull();
    expect((await c.dispatchAsync({ type: "check-browser" })).browserCheck).toBeNull();
    expect(c.getState().status).toBeNull();
  });

  it("shows the section with the real list and its buttons", () => {
    const html = make().c.html();
    expect(html).toContain("data-privacy-browser");
    expect(html).toContain(`${BROWSER_REGISTER.length} rows are listed`);
    for (const a of ["check-browser", "export-browser-csv", "export-browser-text"]) expect(html).toContain(`data-action="${a}"`);
  });

  it("shows it in French after the language is changed", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Ce que l’App demande à votre navigateur");
  });

  it("is on in the live controller, with the browser's host", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-browser");
    expect(liveControllerDeps().browser?.register).toBe(BROWSER_REGISTER);
    expect(liveControllerDeps().browser?.host.language).toBeTypeOf("function");
  });

  it("comes after the web address section and before the how-long-kept section", () => {
    const html = make({ ...liveControllerDeps() }).c.html();
    expect(html.indexOf("data-privacy-query")).toBeLessThan(html.indexOf("data-privacy-browser"));
    expect(html.indexOf("data-privacy-browser")).toBeLessThan(html.indexOf("data-privacy-retention"));
  });
});

describe("asking the browser now", () => {
  it("shows no answers until the person asks", () => {
    expect(make().c.html()).not.toContain("data-privacy-browser-check");
    expect(make().c.getState().browserCheck).toBeNull();
  });

  it("keeps the answers and says how many came", async () => {
    const { c } = make();
    const s = await c.dispatchAsync({ type: "check-browser" });
    expect(s.browserCheck?.answered).toBe(6);
    expect(s.browserCheck?.reading).toEqual({ language: "fr-CA", online: true, contrast: false, motion: true, usage: 5_000_000, quota: 2_000_000_000, persisted: false });
    expect(s.status).toEqual({ kind: "browser-checked", answered: 6, asked: 6 });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("6 answers to 6 questions.");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("6 réponses sur 6 questions.");
  });

  it("shows the answers in the panel, in the language of the panel", async () => {
    const { c } = make();
    await c.dispatchAsync({ type: "check-browser" });
    expect(c.html()).toContain('data-label="Answer">fr-CA<');
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain('data-label="Réponse">Oui<');
  });

  it("asks each of the six questions once for each press", async () => {
    let language = 0;
    let storage = 0;
    const { c } = make({}, hostWith({ language: () => (language += 1, "en"), storage: async () => (storage += 1, {}) }));
    await c.dispatchAsync({ type: "check-browser" });
    await c.dispatchAsync({ type: "check-browser" });
    expect([language, storage]).toEqual([2, 2]);
  });

  it("asks again and replaces the earlier answers", async () => {
    let online = true;
    const { c } = make({}, hostWith({ online: () => online }));
    await c.dispatchAsync({ type: "check-browser" });
    online = false;
    const s = await c.dispatchAsync({ type: "check-browser" });
    expect(s.browserCheck?.reading.online).toBe(false);
    expect(c.html()).toContain("Your device says it is offline right now.");
  });

  it("says unknown for a browser that gives nothing, and does not throw", async () => {
    const { c } = make({}, {});
    const s = await c.dispatchAsync({ type: "check-browser" });
    expect(s.browserCheck?.answered).toBe(0);
    expect(s.status).toEqual({ kind: "browser-checked", answered: 0, asked: BROWSER_QUESTIONS.length });
    expect(c.html()).not.toContain('data-label="Answer">No<');
  });

  it("copes with a host that throws on every question", async () => {
    const boom = () => { throw new Error("no"); };
    const { c } = make({}, { language: boom, online: boom, prefers: boom, storage: boom });
    expect((await c.dispatchAsync({ type: "check-browser" })).browserCheck?.answered).toBe(0);
  });

  it("clears the erase confirmation and an earlier download", async () => {
    const { c, storage } = make();
    storage.setItem(`${PREFIX}a`, "1");
    c.dispatch({ type: "export-browser-csv" });
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    const s = await c.dispatchAsync({ type: "check-browser" });
    expect(s.confirmingErase).toBe(false);
    expect(s.lastExport).toBeNull();
  });

  it("writes nothing to the device's storage, and records nothing in the activity log", async () => {
    const { c, storage } = make({ logActivity: true });
    const before = JSON.stringify(Object.entries(storage));
    await c.dispatchAsync({ type: "check-browser" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
    expect(loadActivity(storage, PREFIX, NOW)).toEqual([]);
  });

  it("keeps the answers only in memory: a new controller starts with none", async () => {
    const a = make();
    await a.c.dispatchAsync({ type: "check-browser" });
    const b = createPrivacyController({ storage: a.storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, browser: { register: BROWSER_REGISTER, host: hostWith() } });
    expect(b.getState().browserCheck).toBeNull();
  });

  it("does not put an answer from the browser into the downloads of any other list", async () => {
    const { c } = make();
    await c.dispatchAsync({ type: "check-browser" });
    const files = [c.dispatch({ type: "export-browser-csv" }).lastExport, c.dispatch({ type: "export-browser-text" }).lastExport, c.dispatch({ type: "export-list-csv" }).lastExport];
    for (const f of files) expect(f?.text ?? "").not.toContain("fr-CA");
  });
});

describe("downloading the list", () => {
  it("prepares a CSV with one row per row of the list and says so", () => {
    const s = make().c.dispatch({ type: "export-browser-csv" });
    expect(s.lastExport?.mime).toBe("text/csv");
    expect(s.lastExport?.count).toBe(BROWSER_REGISTER.length);
    expect(s.lastExport?.filename).toBe("the-app-browser-questions-2026-11-21.csv");
    expect(s.status).toEqual({ kind: "browser-exported", format: "csv" });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of what the App asks your browser prepared as CSV.");
  });

  it("prepares a text file", () => {
    const s = make().c.dispatch({ type: "export-browser-text" });
    expect(s.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of what the App asks your browser prepared as text.");
  });

  it("gives a semicolon-separated CSV in French and says so in French", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "export-browser-csv" });
    expect(s.lastExport?.text.split("\r\n")[0]).toContain(";");
    expect(s.lastExport?.filename).toBe("l-app-questions-au-navigateur-2026-11-21.csv");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("Liste de ce que l’App demande au navigateur préparée au format CSV.");
    expect(PANEL_STRINGS.fr.status(c.dispatch({ type: "export-browser-text" }).status!)).toBe("Liste de ce que l’App demande au navigateur préparée en texte.");
  });

  it("uses the list it was given, not the App's", () => {
    const s = make({ browser: { register: [one()], host: hostWith() } }).c.dispatch({ type: "export-browser-csv" });
    expect(s.lastExport?.count).toBe(1);
    expect(s.lastExport?.text).toContain("An example question");
  });

  it("writes nothing to the device's storage", () => {
    const { c, storage } = make();
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-browser-csv" });
    c.dispatch({ type: "export-browser-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
});

describe("the record of what the person did", () => {
  it("logs a download with its format, and nothing else about it", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-browser-csv" });
    c.dispatch({ type: "export-browser-text" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "browser-export");
    expect(entries.map((e) => (e as { format?: string }).format).sort()).toEqual(["csv", "text"]);
    expect(JSON.stringify(entries)).not.toContain("apps/web");
  });

  it("describes the entry in both languages", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-browser-csv" });
    const e = loadActivity(storage, PREFIX, NOW).find((x) => x.kind === "browser-export")!;
    expect(activityText("en", e, () => undefined)).toBe("Downloaded the list of what the App asks your browser (CSV)");
    expect(activityText("fr", e, () => undefined)).toBe("Liste de ce que l’App demande au navigateur téléchargée (CSV)");
  });

  it("does not log when logging is off, or when the list is empty", () => {
    const off = make();
    off.c.dispatch({ type: "export-browser-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
    const { c, storage } = make({ browser: { register: [], host: hostWith() }, logActivity: true });
    c.dispatch({ type: "export-browser-csv" });
    expect(loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "browser-export")).toEqual([]);
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

  for (const action of ["export-browser-csv", "export-browser-text"] as const) {
    it(`${action} hands one file to the download and moves focus to the status`, () => {
      const { c } = make();
      const root = new FakeRoot();
      const exported: ExportFile[] = [];
      mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
      root.click(action);
      expect(exported).toHaveLength(1);
      expect(exported[0]?.count).toBe(BROWSER_REGISTER.length);
      expect(root.focused.at(-1)).toBe("[data-privacy-status]");
      expect(root.innerHTML).toContain("List of what the App asks your browser prepared as");
    });
  }

  it("check-browser shows the answers and moves focus to the status, and hands over no file", async () => {
    const { c } = make();
    const root = new FakeRoot();
    const exported: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
    root.click("check-browser");
    for (let i = 0; i < 20 && !root.innerHTML.includes("data-privacy-browser-check"); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(root.innerHTML).toContain("data-privacy-browser-check");
    expect(root.innerHTML).toContain("6 answers to 6 questions.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
    expect(exported).toEqual([]);
  });
});
