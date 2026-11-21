import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { LIVE_PURPOSES, LIVE_RULES, ROUTE_REPORTS_STORAGE_KEY } from "./live";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 20, 9, 0, 0);
const KEPT = { register: STORAGE_REGISTER, unscanned: UNSCANNED };
const ID = LIVE_PURPOSES[0]!.id;

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, purposes: LIVE_PURPOSES, ...patch }) };
}

describe("the record of choices section", () => {
  it("is hidden unless it is switched on", () => {
    expect(make().c.html()).not.toContain("data-privacy-receipt");
  });
  it("is hidden when it is on but there are no purposes", () => {
    const { c } = make({ receipt: true, purposes: [] });
    expect(c.html()).not.toContain("data-privacy-receipt");
    expect(c.dispatch({ type: "export-receipt-csv" }).lastExport).toBeNull();
    expect(c.getState().status).toBeNull();
  });
  it("shows the section with its buttons when it is on", () => {
    const html = make({ receipt: true }).c.html();
    expect(html).toContain("data-privacy-receipt");
    expect(html).toContain("Not asked yet");
    expect(html).toContain("Download this record (CSV)");
  });
  it("shows the answer and the date after a choice, straight away", () => {
    const { c } = make({ receipt: true });
    c.dispatch({ type: "consent", purposeId: ID, value: "granted" });
    const html = c.html();
    expect(html).toContain('<span data-label="Your answer">Yes</span>');
    expect(html).toContain("2026-11-20");
  });
  it("lists what the choice lets the App save when the App's list is given", () => {
    const html = make({ receipt: true, kept: KEPT, withdrawRules: LIVE_RULES }).c.html();
    const row = STORAGE_REGISTER.find((r) => r.key === ROUTE_REPORTS_STORAGE_KEY)!;
    expect(html).toContain(row.holds.en);
  });
  it("says what is covered is not listed when no list is given", () => {
    expect(make({ receipt: true, withdrawRules: LIVE_RULES }).c.html()).toContain("Not listed");
  });
  it("counts what is saved now for the choice", () => {
    const { c, storage } = make({ receipt: true, kept: KEPT, withdrawRules: LIVE_RULES });
    c.dispatch({ type: "consent", purposeId: ID, value: "granted" });
    storage.setItem(ROUTE_REPORTS_STORAGE_KEY, "[]");
    c.dispatch({ type: "set-locale", locale: "en" });
    expect(c.html()).toContain('<span data-label="Saved now">1 item</span>');
  });
  it("shows no items saved after the person says no, when the App removes them", () => {
    const { c, storage } = make({ receipt: true, kept: KEPT, withdrawRules: LIVE_RULES });
    c.dispatch({ type: "consent", purposeId: ID, value: "granted" });
    storage.setItem(ROUTE_REPORTS_STORAGE_KEY, "[]");
    c.dispatch({ type: "consent", purposeId: ID, value: "declined" });
    expect(storage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull();
    const html = c.html();
    expect(html).toContain('<span data-label="Saved now">0 items</span>');
    expect(html).toContain('<span data-label="Your answer">No</span>');
  });
  it("says what a no does, by whether the App removes what was saved", () => {
    expect(make({ receipt: true, kept: KEPT, withdrawRules: LIVE_RULES }).c.html()).toContain("removes what it saved");
    expect(make({ receipt: true, kept: KEPT, withdrawRules: [] }).c.html()).toContain("Nothing changes");
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-receipt");
  });
});

describe("downloading the record", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make({ receipt: true, kept: KEPT });
    const csv = c.dispatch({ type: "export-receipt-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(csv.lastExport?.count).toBe(1);
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("Record of your choices prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-receipt-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Registre de vos choix préparé en texte.");
  });
  it("writes the answer the person gave into the file", () => {
    const { c } = make({ receipt: true, kept: KEPT });
    c.dispatch({ type: "consent", purposeId: ID, value: "declined" });
    expect(c.dispatch({ type: "export-receipt-csv" }).lastExport?.text).toContain(",No,2026-11-20,");
  });
  it("writes nothing to the device's storage", () => {
    const { c, storage } = make({ receipt: true, kept: KEPT });
    c.dispatch({ type: "consent", purposeId: ID, value: "granted" });
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-receipt-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages", () => {
    const { c, storage } = make({ receipt: true, logActivity: true });
    c.dispatch({ type: "export-receipt-csv" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "receipt-export");
    expect(entries).toHaveLength(1);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the record of your choices (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Registre de vos choix téléchargé (CSV)");
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
    const { c } = make({ receipt: true });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-receipt-csv");
    root.click("export-receipt-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
    expect(root.innerHTML).toContain("Record of your choices");
  });
});
