import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { ADDRESS_REGISTER, CALL_REGISTER } from "./addressRegister";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { DEVICE_REGISTER } from "./deviceRegister";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { createMemoryStorage } from "./storage";
import { STORAGE_REGISTER, UNSCANNED } from "./storageRegister";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const KEPT = { register: STORAGE_REGISTER, unscanned: UNSCANNED };

function make(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage();
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

describe("the privacy counts section", () => {
  it("is hidden unless it is switched on", () => {
    expect(make({ kept: KEPT }).c.html()).not.toContain("data-privacy-glance");
  });
  it("is hidden when it is on but no list was given", () => {
    const { c } = make({ glance: true });
    expect(c.html()).not.toContain("data-privacy-glance");
    const s = c.dispatch({ type: "export-glance-csv" });
    expect(s.lastExport).toBeNull();
    expect(s.status).toBeNull();
  });
  it("counts only the lists the controller was given", () => {
    const html = make({ glance: true, deviceRegister: DEVICE_REGISTER }).c.html();
    expect(html).toContain("data-privacy-glance");
    expect(html).toContain("Offline storage");
    expect(html).not.toContain("Web addresses and requests");
  });
  it("counts all four lists when all are given", () => {
    const html = make({ glance: true, kept: KEPT, deviceRegister: DEVICE_REGISTER, addresses: { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } }).c.html();
    for (const t of ["Saved in this browser", "Offline storage", "Web addresses and requests"]) expect(html, t).toContain(t);
  });
  it("is on in the live controller", () => {
    expect(make({ ...liveControllerDeps() }).c.html()).toContain("data-privacy-glance");
  });
  it("prepares a CSV and a text file, and says so in both languages", () => {
    const { c } = make({ glance: true, kept: KEPT });
    const csv = c.dispatch({ type: "export-glance-csv" });
    expect(csv.lastExport?.mime).toBe("text/csv");
    expect(PANEL_STRINGS.en.status(csv.status!)).toBe("Privacy counts prepared as CSV.");
    c.dispatch({ type: "set-locale", locale: "fr" });
    const text = c.dispatch({ type: "export-glance-text" });
    expect(text.lastExport?.mime).toBe("text/plain");
    expect(PANEL_STRINGS.fr.status(text.status!)).toBe("Chiffres sur la vie privée préparés en texte.");
  });
  it("shows the same count in the panel and in the file", () => {
    const { c } = make({ glance: true, kept: KEPT });
    expect(c.html()).toContain(`<span data-label="How many">${STORAGE_REGISTER.length}</span>`);
    expect(c.dispatch({ type: "export-glance-csv" }).lastExport?.text).toContain(`Things the App saves in this browser,${STORAGE_REGISTER.length},No`);
  });
  it("follows a language change", () => {
    const { c } = make({ glance: true, kept: KEPT });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("La vie privée en un coup d’œil");
  });
  it("closes an open erase confirmation", () => {
    const { c, storage } = make({ glance: true, kept: KEPT });
    storage.setItem(`${PREFIX}draft`, "{}");
    c.dispatch({ type: "erase-ask" });
    expect(c.getState().confirmingErase).toBe(true);
    expect(c.dispatch({ type: "export-glance-text" }).confirmingErase).toBe(false);
  });
  it("records the download when logging is on", () => {
    const { c, storage } = make({ glance: true, kept: KEPT, logActivity: true });
    c.dispatch({ type: "export-glance-text" });
    const entries = loadActivity(storage, PREFIX, NOW);
    expect(entries.map((e) => e.kind)).toEqual(["glance-export"]);
    expect(activityText("en", entries[0]!, () => undefined)).toBe("Downloaded the privacy counts (text)");
    expect(activityText("fr", entries[0]!, () => undefined)).toBe("Chiffres sur la vie privée téléchargés (texte)");
  });
});
