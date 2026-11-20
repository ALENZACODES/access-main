import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { ADDRESS_REGISTER, CALL_REGISTER } from "./addressRegister";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import type { ExportFile } from "./localData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const ADDRESSES = { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER };

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the addresses section", () => {
  it("is hidden and its buttons do nothing when the lists are not given", () => {
    const { c } = make();
    expect(c.html()).not.toContain("data-privacy-addresses");
    const s = c.dispatch({ type: "export-addresses-csv" });
    expect(s.lastExport).toBeNull();
    expect(s.status).toBeNull();
    expect(c.dispatch({ type: "export-addresses-text" }).lastExport).toBeNull();
  });
  it("shows the section and its two buttons when the lists are given", () => {
    const html = make({ addresses: ADDRESSES }).c.html();
    expect(html).toContain("data-privacy-addresses");
    expect(html).toContain('data-action="export-addresses-csv"');
    expect(html).toContain("Download this list (text)");
  });
  it("prepares a CSV and says so", () => {
    const { c } = make({ addresses: ADDRESSES });
    const s = c.dispatch({ type: "export-addresses-csv" });
    expect(s.status).toEqual({ kind: "addresses-exported", format: "csv" });
    expect(s.lastExport?.mime).toBe("text/csv");
    expect(s.lastExport?.count).toBe(ADDRESS_REGISTER.length + CALL_REGISTER.length);
    expect(PANEL_STRINGS.en.status(s.status!)).toBe("List of web addresses and network requests prepared as CSV.");
  });
  it("prepares a text file, with a semicolon-free English body and the French status in French", () => {
    const { c } = make({ addresses: ADDRESSES });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const s = c.dispatch({ type: "export-addresses-text" });
    expect(s.lastExport?.mime).toBe("text/plain");
    expect(s.lastExport?.filename).toBe("l-app-adresses-et-requetes-2026-11-19.txt");
    expect(PANEL_STRINGS.fr.status(s.status!)).toBe("Liste des adresses web et des requêtes réseau préparée en texte.");
  });
  it("uses a semicolon in the French CSV and a comma in the English one", () => {
    const { c } = make({ addresses: ADDRESSES });
    expect(c.dispatch({ type: "export-addresses-csv" }).lastExport?.text.split("\r\n")[0]).toContain(",");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-addresses-csv" }).lastExport?.text.split("\r\n")[0]).toContain(";");
  });
  it("closes an open erase confirmation when a list is prepared", () => {
    const { c, storage } = make({ addresses: ADDRESSES });
    storage.setItem(`${PREFIX}draft`, "{}");
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    expect(c.dispatch({ type: "export-addresses-csv" }).confirmingErase).toBe(false);
  });
  it("writes nothing to the device's storage by preparing a list", () => {
    const { c, storage } = make({ addresses: ADDRESSES });
    const before = JSON.stringify(Object.entries(storage));
    c.dispatch({ type: "export-addresses-text" });
    expect(JSON.stringify(Object.entries(storage))).toBe(before);
  });
  it("is part of the live controller's lists", () => {
    const live = liveControllerDeps();
    expect(live.addresses?.addresses).toBe(ADDRESS_REGISTER);
    expect(live.addresses?.calls).toBe(CALL_REGISTER);
    expect(make({ ...live }).c.html()).toContain("data-privacy-addresses");
  });
});

describe("the activity list", () => {
  it("records the download with its format when logging is on, in both languages", () => {
    const { c, storage } = make({ addresses: ADDRESSES, logActivity: true });
    c.dispatch({ type: "export-addresses-csv" });
    const entries = loadActivity(storage, PREFIX, NOW);
    expect(entries.map((e) => e.kind)).toEqual(["addresses-export"]);
    expect(entries[0]?.format).toBe("csv");
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the list of addresses and network requests (CSV)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Liste des adresses et requêtes réseau téléchargée (CSV)");
  });
  it("records nothing when logging is off", () => {
    const { c, storage } = make({ addresses: ADDRESSES });
    c.dispatch({ type: "export-addresses-csv" });
    expect(loadActivity(storage, PREFIX, NOW)).toEqual([]);
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
    const { c } = make({ addresses: ADDRESSES });
    const root = new FakeRoot();
    const files: ExportFile[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f) });
    root.click("export-addresses-csv");
    root.click("export-addresses-text");
    expect(files.map((f) => f.mime)).toEqual(["text/csv", "text/plain"]);
    expect(root.innerHTML).toContain("Web addresses and network requests in the App");
  });
});
