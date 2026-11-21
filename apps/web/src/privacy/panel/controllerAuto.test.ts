import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { AUTO_REGISTER } from "./autoRegister";
import type { WorkerHost } from "./autoLive";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const hostWith = (over: Partial<WorkerHost> = {}): WorkerHost => ({ supported: () => true, controlled: () => true, registrations: async () => [{ scope: "/", state: "active" }], ...over });

function make(patch: Partial<ControllerDeps> = {}, host: WorkerHost = hostWith()) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, auto: { register: AUTO_REGISTER, host }, ...patch }) };
}

describe("the what-the-App-does-on-its-own section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make({ auto: undefined }).c.html()).not.toContain("data-privacy-auto");
  });
  it("is hidden for an empty list, and its buttons do nothing", async () => {
    const { c } = make({ auto: { register: [], host: hostWith() } });
    expect(c.html()).not.toContain("data-privacy-auto");
    expect(c.dispatch({ type: "export-auto-csv" }).lastExport).toBeNull();
    expect((await c.dispatchAsync({ type: "check-workers" })).workerCheck).toBeNull();
    expect(c.getState().status).toBeNull();
  });
  it("shows the section with the real list and its buttons", () => {
    const html = make().c.html();
    expect(html).toContain("data-privacy-auto");
    expect(html).toContain("20 rows are listed");
    expect(html).toContain('data-action="check-workers"');
  });
  it("shows it in French after the language is changed", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Ce que l’App fait d’elle-même");
  });
  it("is on in the live controller, with the browser's host", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-auto");
    expect(liveControllerDeps().auto?.register).toBe(AUTO_REGISTER);
  });
  it("comes after the how-long-kept section and before the statements", () => {
    const html = make({ ...liveControllerDeps() }).c.html();
    expect(html.indexOf("data-privacy-retention")).toBeLessThan(html.indexOf("data-privacy-auto"));
    expect(html.indexOf("data-privacy-auto")).toBeLessThan(html.indexOf("data-privacy-statements"));
  });
});

describe("downloading the list", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make();
    const csv = c.dispatch({ type: "export-auto-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(csv.lastExport?.count).toBe(AUTO_REGISTER.length);
    expect(csv.lastExport?.filename).toBe("the-app-work-on-its-own-2026-11-21.csv");
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("List of what the App does on its own prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-auto-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Liste de ce que l’App fait d’elle-même préparée en texte.");
  });
  it("uses a semicolon in French and a comma in English", () => {
    const { c } = make();
    expect(c.dispatch({ type: "export-auto-csv" }).lastExport?.text.split("\r\n")[0]).toContain("What it is,In the code");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-auto-csv" }).lastExport?.text.split("\r\n")[0]).toContain("De quoi il s’agit;Dans le code");
  });
  it("closes the erase question and replaces the earlier file", () => {
    const { c } = make();
    c.dispatch({ type: "export-auto-csv" });
    const first = c.getState().lastExport;
    c.dispatch({ type: "export-auto-text" });
    expect(c.getState().lastExport).not.toBe(first);
    expect(c.getState().confirmingErase).toBe(false);
  });
  it("writes nothing to the device's storage", async () => {
    const { c, storage } = make();
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-auto-text" });
    await c.dispatchAsync({ type: "check-workers" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages, and not when it is off", () => {
    const { c, storage } = make({ logActivity: true });
    c.dispatch({ type: "export-auto-csv" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "auto-export");
    expect(entries).toHaveLength(1);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the list of what the App does on its own (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Liste de ce que l’App fait d’elle-même téléchargée (CSV)");
    const off = make();
    off.c.dispatch({ type: "export-auto-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
  });
  it("does not record asking the browser in the activity log", async () => {
    const { c, storage } = make({ logActivity: true });
    await c.dispatchAsync({ type: "check-workers" });
    expect(loadActivity(storage, PREFIX, NOW)).toEqual([]);
  });
});

describe("asking the browser about offline workers", () => {
  it("shows no check before the person asks", () => {
    const { c } = make();
    expect(c.getState().workerCheck).toBeNull();
    expect(c.html()).not.toContain("data-privacy-auto-check");
  });
  it("says what the browser said, in both languages", async () => {
    const { c } = make();
    const s = await c.dispatchAsync({ type: "check-workers" });
    expect(s.status).toEqual({ kind: "workers-checked", registered: 1, differences: 0 });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("1 offline worker registered. No differences found.");
    expect(c.html()).toContain("An offline worker controls this page.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Un agent hors ligne contrôle cette page.");
  });
  it("says a browser that will not say is unreadable, not none", async () => {
    const { c } = make({}, hostWith({ registrations: () => Promise.reject(new Error("no")) }));
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.getState().workerCheck?.registered).toBeNull();
    expect(c.html()).toContain("would not say which offline workers are registered");
    expect(c.getState().status).toEqual({ kind: "workers-checked", registered: null, differences: 1 });
  });
  it("says a browser with no offline workers has none", async () => {
    const { c } = make({}, { supported: () => false });
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.html()).toContain("This browser has no offline workers.");
  });
  it("says a registered worker is not listed when the list has no row for one", async () => {
    const { c } = make({ auto: { register: AUTO_REGISTER.filter((r) => !(r.kind === "service-worker" && r.effect === "runs")), host: hostWith() } });
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.getState().status).toEqual({ kind: "workers-checked", registered: 1, differences: 1 });
    expect(c.html()).toContain("the list has no row that says the App registers one");
  });
  it("asks again each time, so a changed answer shows", async () => {
    let list: Array<{ scope: string; state: "active" | "waiting" }> = [];
    const { c } = make({}, hostWith({ registrations: async () => list }));
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.getState().workerCheck?.registered).toBe(0);
    list = [{ scope: "/", state: "active" }, { scope: "/a/", state: "waiting" }];
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.getState().workerCheck?.registered).toBe(2);
    expect(c.html()).toContain("1 newer worker is waiting to take over.");
  });
  it("replaces an earlier download and closes the erase question", async () => {
    const { c } = make();
    c.dispatch({ type: "export-auto-csv" });
    await c.dispatchAsync({ type: "check-workers" });
    expect(c.getState().lastExport).toBeNull();
    expect(c.getState().confirmingErase).toBe(false);
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
  it("hands the file to the page for either download button", () => {
    const { c } = make();
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (x) => files.push(x) });
    root.click("export-auto-csv");
    root.click("export-auto-text");
    expect(files.map((x) => x.mime)).toEqual(["text/csv", "text/plain"]);
  });
  it("does not hand over a file when the section is off", () => {
    const { c } = make({ auto: undefined });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (x) => files.push(x) });
    root.click("export-auto-csv");
    expect(files).toEqual([]);
  });
  it("asks the browser when its button is pressed, and shows the answer once it comes", async () => {
    const { c } = make();
    const root = new FakeRoot();
    mountPrivacyPanel(root, c);
    root.click("check-workers");
    await new Promise((r) => setTimeout(r, 0));
    expect(c.getState().workerCheck?.registered).toBe(1);
    expect(c.html()).toContain("data-privacy-auto-check");
  });
});
