import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { ADDRESS_REGISTER, CALL_REGISTER } from "./addressRegister";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import type { ExportFile } from "./localData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import { STATEMENT_REGISTER, type StatementRow } from "./statementRegister";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const ADDRESSES = { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER };

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the statements section", () => {
  it("is hidden and its buttons do nothing without rows", () => {
    const { c } = make();
    expect(c.html()).not.toContain("data-privacy-statements");
    expect(c.dispatch({ type: "export-statements-csv" }).lastExport).toBeNull();
    expect(make({ statements: [] }).c.html()).not.toContain("data-privacy-statements");
  });
  it("shows the section and its buttons when rows are given", () => {
    const html = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES }).c.html();
    expect(html).toContain("data-privacy-statements");
    expect(html).toContain("What the App says about your data");
    expect(html).toContain('data-action="export-statements-text"');
  });
  it("shows every part as not checked when the list of network requests was not given", () => {
    const html = make({ statements: STATEMENT_REGISTER }).c.html();
    expect(html).toContain("Not checked");
    expect(html).not.toContain("None found");
    expect(html).toContain("They were not checked.");
  });
  it("shows None found for a part whose code makes no request when the list was given", () => {
    expect(make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES }).c.html()).toContain("None found");
  });
  it("shows a part that makes requests as one the check cannot confirm", () => {
    const rows: StatementRow[] = [{ ...STATEMENT_REGISTER[0]!, path: CALL_REGISTER[0]!.path }];
    expect(make({ statements: rows, addresses: ADDRESSES }).c.html()).toContain("The check cannot confirm the statement there.");
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-statements");
  });
  it("adds a table to the counts when the counts are on", () => {
    const html = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES, glance: true }).c.html();
    expect(html).toContain("What the App says about data");
    expect(html).toContain("Parts of the App that say data stays here or is not sent");
  });
});

describe("downloading the list", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES });
    const csv = c.dispatch({ type: "export-statements-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(csv.lastExport?.count).toBe(STATEMENT_REGISTER.length);
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("List of what the App says about your data prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-statements-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Liste de ce que l’App dit de vos données préparée en texte.");
  });
  it("writes what the check found into the file", () => {
    const { c } = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES });
    expect(c.dispatch({ type: "export-statements-csv" }).lastExport?.text).toContain(",None found");
    const { c: unchecked } = make({ statements: STATEMENT_REGISTER });
    expect(unchecked.dispatch({ type: "export-statements-csv" }).lastExport?.text).toContain(",Not checked");
  });
  it("writes nothing to the device's storage and closes an erase question", () => {
    const { c, storage } = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES });
    storage.setItem(`${PREFIX}draft`, "{}");
    c.dispatch({ type: "erase-ask" });
    const before = JSON.stringify(Object.entries(storage));
    const s = c.dispatch({ type: "export-statements-text" });
    expect(s.confirmingErase).toBe(false);
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages", () => {
    const { c, storage } = make({ statements: STATEMENT_REGISTER, logActivity: true });
    c.dispatch({ type: "export-statements-text" });
    const e = loadActivity(storage, PREFIX, NOW).filter((x) => x.kind === "statements-export");
    expect(e).toHaveLength(1);
    expect(activityText("en", e[0]!, () => undefined)).toBe("Downloaded the list of what the App says about data (text)");
    expect(activityText("fr", e[0]!, () => undefined)).toBe("Liste de ce que l’App dit des données téléchargée (texte)");
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
  it("hands the file to the page for either button", () => {
    const { c } = make({ statements: STATEMENT_REGISTER, addresses: ADDRESSES });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-statements-csv");
    root.click("export-statements-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
  });
});
