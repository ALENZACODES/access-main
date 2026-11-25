import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import type { ExportFile } from "./localData";
import { PICK_REGISTER, type PickRow } from "./pickRegister";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, picks: PICK_REGISTER, ...patch }) };
}

const one = (over: Partial<PickRow> = {}): PickRow => ({
  kind: "pick",
  path: "apps/web/src/pages/Example.tsx",
  uses: 1,
  reads: { en: "An example file", fr: "Un fichier d’exemple" },
  accepts: ["json"],
  limit: "before-read",
  source: "s",
  recordedOn: "2026-11-21",
  ...over,
});

describe("the files-you-choose section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make({ picks: undefined }).c.html()).not.toContain("data-privacy-pick");
  });

  it("is hidden for an empty list, and its buttons do nothing", () => {
    const { c } = make({ picks: [] });
    expect(c.html()).not.toContain("data-privacy-pick");
    expect(c.dispatch({ type: "export-picks-csv" }).lastExport).toBeNull();
    expect(c.dispatch({ type: "export-picks-text" }).lastExport).toBeNull();
    expect(c.getState().status).toBeNull();
  });

  it("shows the section with the real list and its buttons", () => {
    const html = make().c.html();
    expect(html).toContain("data-privacy-pick");
    expect(html).toContain(`${PICK_REGISTER.length} rows are listed`);
    expect(html).toContain('data-action="export-picks-csv"');
    expect(html).toContain('data-action="export-picks-text"');
  });

  it("shows it in French after the language is changed", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Où l’App lit un fichier que vous choisissez");
  });

  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-pick");
    expect(liveControllerDeps().picks).toBe(PICK_REGISTER);
  });

  it("comes after the web address section and before the how-long-kept section", () => {
    const html = make({ ...liveControllerDeps() }).c.html();
    expect(html.indexOf("data-privacy-query")).toBeLessThan(html.indexOf("data-privacy-pick"));
    expect(html.indexOf("data-privacy-pick")).toBeLessThan(html.indexOf("data-privacy-retention"));
  });

  it("has no button that reads a file or asks the browser anything", () => {
    const html = make().c.html();
    const section = html.slice(html.indexOf("data-privacy-pick"), html.indexOf("</table>", html.indexOf("data-privacy-pick")));
    expect(section).not.toContain('type="file"');
    expect(html.match(/data-action="[a-z-]*picks[a-z-]*"/g)).toEqual(['data-action="export-picks-csv"', 'data-action="export-picks-text"']);
  });
});

describe("downloading the list", () => {
  it("prepares a CSV with one row per row of the list and says so", () => {
    const { c } = make();
    const s = c.dispatch({ type: "export-picks-csv" });
    expect(s.lastExport?.mime).toBe("text/csv");
    expect(s.lastExport?.count).toBe(PICK_REGISTER.length);
    expect(s.lastExport?.filename).toBe("the-app-files-you-choose-2026-11-21.csv");
    expect(s.status).toEqual({ kind: "picks-exported", format: "csv" });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of files the App reads when you choose them prepared as CSV.");
  });

  it("prepares a text file", () => {
    const s = make().c.dispatch({ type: "export-picks-text" });
    expect(s.lastExport?.mime).toBe("text/plain");
    expect(s.status).toEqual({ kind: "picks-exported", format: "text" });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of files the App reads when you choose them prepared as text.");
  });

  it("gives a semicolon-separated CSV in French and says so in French", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "export-picks-csv" });
    expect(s.lastExport?.text.split("\r\n")[0]).toContain(";");
    expect(s.lastExport?.filename).toBe("l-app-fichiers-que-vous-choisissez-2026-11-21.csv");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("Liste des fichiers que l’App lit quand vous les choisissez préparée au format CSV.");
    expect(PANEL_STRINGS.fr.status(c.dispatch({ type: "export-picks-text" }).status!)).toBe("Liste des fichiers que l’App lit quand vous les choisissez préparée en texte.");
  });

  it("uses the list it was given, not the App's", () => {
    const s = make({ picks: [one()] }).c.dispatch({ type: "export-picks-csv" });
    expect(s.lastExport?.count).toBe(1);
    expect(s.lastExport?.text).toContain("An example file");
  });

  it("clears the erase confirmation and replaces an earlier export", () => {
    const { c, storage } = make();
    storage.setItem(`${PREFIX}a`, "1");
    c.dispatch({ type: "export-list-csv" });
    const first = c.getState().lastExport;
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    const s = c.dispatch({ type: "export-picks-csv" });
    expect(s.confirmingErase).toBe(false);
    expect(s.lastExport).not.toBe(first);
  });

  it("writes nothing to the device's storage", () => {
    const { c, storage } = make();
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-picks-csv" });
    c.dispatch({ type: "export-picks-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
});

describe("the record of what the person did", () => {
  it("logs a download with its format, and nothing else about it", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-picks-csv" });
    c.dispatch({ type: "export-picks-text" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "picks-export");
    expect(entries.map((e) => (e as { format?: string }).format).sort()).toEqual(["csv", "text"]);
    expect(JSON.stringify(entries)).not.toContain("apps/web");
  });

  it("describes the entry in both languages", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-picks-csv" });
    const e = loadActivity(storage, PREFIX, NOW).find((x) => x.kind === "picks-export")!;
    expect(activityText("en", e, () => undefined)).toBe("Downloaded the list of files the App reads when you choose them (CSV)");
    expect(activityText("fr", e, () => undefined)).toBe("Liste des fichiers que l’App lit quand vous les choisissez téléchargée (CSV)");
  });

  it("does not log when logging is off, or when the list is empty", () => {
    const off = make();
    off.c.dispatch({ type: "export-picks-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
    const { c, storage } = make({ picks: [], logActivity: true });
    c.dispatch({ type: "export-picks-csv" });
    expect(loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "picks-export")).toEqual([]);
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

  for (const action of ["export-picks-csv", "export-picks-text"] as const) {
    it(`${action} hands one file to the download and moves focus to the status`, () => {
      const { c } = make();
      const root = new FakeRoot();
      const exported: ExportFile[] = [];
      mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
      root.click(action);
      expect(exported).toHaveLength(1);
      expect(exported[0]?.count).toBe(PICK_REGISTER.length);
      expect(root.focused.at(-1)).toBe("[data-privacy-status]");
      expect(root.innerHTML).toContain("files the App reads when you choose them prepared as");
    });
  }

  it("does not hand over a file twice for one press", () => {
    const { c } = make();
    const root = new FakeRoot();
    const exported: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => exported.push(f) });
    root.click("export-picks-csv");
    root.click("export-list-csv");
    expect(exported).toHaveLength(2);
  });
});
