import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { ExportFile } from "./localData";
import { QUERY_REGISTER } from "./queryRegister";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

const withAddress = (search: string): Partial<ControllerDeps> => ({ queries: QUERY_REGISTER, address: () => search });

describe("the web address section", () => {
  it("is hidden unless the App's list is given", () => {
    expect(make().c.html()).not.toContain("data-privacy-query");
  });
  it("is hidden for an empty list, and its buttons do nothing", () => {
    const { c } = make({ queries: [], address: () => "?a=1" });
    expect(c.html()).not.toContain("data-privacy-query");
    expect(c.dispatch({ type: "export-query-csv" }).lastExport).toBeNull();
    expect(c.dispatch({ type: "check-query" }).queryCheck).toBeNull();
    expect(c.getState().status).toBeNull();
  });
  it("shows the section with the real list and its buttons", () => {
    const html = make(withAddress("")).c.html();
    expect(html).toContain("data-privacy-query");
    expect(html).toContain("29 names are listed");
    expect(html).toContain("Check the address of this page");
    expect(html).toContain("Download this list (CSV)");
  });
  it("shows it in French after the language is changed", () => {
    const { c } = make(withAddress(""));
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Ce qu’une adresse web peut contenir");
    expect(c.html()).toContain("Examiner l’adresse de cette page");
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-query");
  });
  it("leaves out the check button, but keeps the downloads, when the page cannot read its address", () => {
    const html = make({ queries: QUERY_REGISTER }).c.html();
    expect(html).toContain("data-privacy-query");
    expect(html).not.toContain('data-action="check-query"');
    expect(html).toContain('data-action="export-query-csv"');
  });
  it("is in the live controller with an address of its own, and not with none", () => {
    expect(liveControllerDeps({ address: () => "?q=x" }).address?.()).toBe("?q=x");
    expect(liveControllerDeps().queries).toBe(QUERY_REGISTER);
  });
});

describe("downloading the list", () => {
  it("prepares a CSV and a text file and says so in both languages", () => {
    const { c } = make(withAddress(""));
    const csv = c.dispatch({ type: "export-query-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(csv.lastExport?.count).toBe(QUERY_REGISTER.length);
    expect(csv.lastExport?.filename).toBe("the-app-web-address-names-2026-11-21.csv");
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("List of what a web address can carry prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-query-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Liste de ce qu’une adresse web peut contenir préparée en texte.");
  });
  it("uses a semicolon in French and a comma in English", () => {
    const { c } = make(withAddress(""));
    expect(c.dispatch({ type: "export-query-csv" }).lastExport?.text.split("\r\n")[0]).toContain("Name in the address,What it holds");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-query-csv" }).lastExport?.text.split("\r\n")[0]).toContain("Nom dans l’adresse;Ce qu’il contient");
  });
  it("works without an address to read", () => {
    const { c } = make({ queries: QUERY_REGISTER });
    expect(c.dispatch({ type: "export-query-text" }).lastExport?.count).toBe(QUERY_REGISTER.length);
  });
  it("closes the erase question and replaces the earlier file", () => {
    const { c } = make(withAddress(""));
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "export-query-csv" });
    expect(c.getState().confirmingErase).toBe(false);
    const first = c.getState().lastExport;
    c.dispatch({ type: "export-query-text" });
    expect(c.getState().lastExport).not.toBe(first);
  });
  it("writes nothing to the device's storage", () => {
    const { c, storage } = make(withAddress("?near=1,2"));
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-query-text" });
    c.dispatch({ type: "check-query" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("records the download when logging is on, in both languages, and not when it is off", () => {
    const { c, storage } = make({ ...withAddress(""), logActivity: true });
    c.dispatch({ type: "export-query-csv" });
    const entries = loadActivity(storage, PREFIX, NOW).filter((e) => e.kind === "query-export");
    expect(entries).toHaveLength(1);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the list of what a web address can carry (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Liste de ce qu’une adresse web peut contenir téléchargée (CSV)");
    const off = make(withAddress(""));
    off.c.dispatch({ type: "export-query-csv" });
    expect(loadActivity(off.storage, PREFIX, NOW)).toEqual([]);
  });
  it("does not record a check, which downloads nothing", () => {
    const { c, storage } = make({ ...withAddress("?q=x"), logActivity: true });
    c.dispatch({ type: "check-query" });
    expect(loadActivity(storage, PREFIX, NOW)).toEqual([]);
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
    const { c } = make(withAddress(""));
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-query-csv");
    root.click("export-query-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
  });
  it("does not hand over a file when the section is off", () => {
    const { c } = make();
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-query-csv");
    expect(files).toEqual([]);
  });
  it("examines the address when the check button is pressed, and hands over no file", () => {
    const { c } = make(withAddress("?near=1,2"));
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("check-query");
    expect(c.getState().queryCheck?.findings).toHaveLength(1);
    expect(files).toEqual([]);
  });
});

describe("examining the address of this page", () => {
  it("is not shown before the person asks", () => {
    expect(make(withAddress("?near=1,2")).c.html()).not.toContain("data-privacy-query-check");
  });
  it("says what it found and shows it in the section", () => {
    const { c } = make(withAddress("?near=43.1,-79.2&q=library&zzz=1"));
    const s = c.dispatch({ type: "check-query" });
    expect(s.status).toEqual({ kind: "query-checked", params: 3, findings: 3 });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("Read 3 parameters from the address of this page. 3 things to report.");
    const html = c.html();
    expect(html).toContain("data-privacy-query-check");
    expect(html).toContain("carries “near”");
    expect(html).toContain("has “zzz”");
  });
  it("never puts a value from the address into the panel", () => {
    const { c } = make(withAddress("?near=43.123456,-79.654321&q=my%20secret%20words"));
    c.dispatch({ type: "check-query" });
    expect(c.html()).not.toContain("43.123456");
    expect(c.html()).not.toContain("secret");
  });
  it("says so in French", () => {
    const { c } = make(withAddress("?q=x"));
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "check-query" });
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("1 paramètre lu dans l’adresse de cette page. 1 point à signaler.");
    expect(c.html()).toContain("L’adresse de cette page contient");
  });
  it("reads the address again each time it is asked", () => {
    let search = "";
    const { c } = make({ queries: QUERY_REGISTER, address: () => search });
    c.dispatch({ type: "check-query" });
    expect(c.getState().queryCheck?.params).toBe(0);
    search = "?q=x&lang=fr";
    c.dispatch({ type: "check-query" });
    expect(c.getState().queryCheck?.params).toBe(2);
  });
  it("says it could not read the address when reading throws, and keeps no earlier result", () => {
    let fail = false;
    const { c } = make({ queries: QUERY_REGISTER, address: () => (fail ? ((): string => { throw new Error("blocked"); })() : "?q=x") });
    c.dispatch({ type: "check-query" });
    expect(c.getState().queryCheck).not.toBeNull();
    fail = true;
    const s = c.dispatch({ type: "check-query" });
    expect(s.queryCheck).toBeNull();
    expect(s.status).toEqual({ kind: "query-unreadable" });
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("The address of this page could not be read, so nothing was examined.");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("L’adresse de cette page n’a pas pu être lue, donc rien n’a été examiné.");
  });
  it("does nothing when there is no address to read", () => {
    const { c } = make({ queries: QUERY_REGISTER });
    expect(c.dispatch({ type: "check-query" }).status).toBeNull();
  });
  it("does nothing when the section is off", () => {
    expect(make({ address: () => "?q=x" }).c.dispatch({ type: "check-query" }).queryCheck).toBeNull();
  });
  it("closes the erase question and replaces an earlier file", () => {
    const { c } = make(withAddress("?q=x"));
    c.dispatch({ type: "export-query-csv" });
    c.dispatch({ type: "erase-ask" });
    const s = c.dispatch({ type: "check-query" });
    expect(s.confirmingErase).toBe(false);
    expect(s.lastExport).toBeNull();
  });
  it("is not changed by the retention check or the other sections' downloads", () => {
    const { c } = make({ ...withAddress("?q=x"), ...liveControllerDeps() , address: () => "?q=x" });
    c.dispatch({ type: "check-query" });
    c.dispatch({ type: "export-glance-csv" });
    expect(c.getState().queryCheck?.params).toBe(1);
  });
  it("stays when the language is changed, and is shown in the new language", () => {
    const { c } = make(withAddress("?near=1,2"));
    c.dispatch({ type: "check-query" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("L’adresse de cette page contient");
  });
});
