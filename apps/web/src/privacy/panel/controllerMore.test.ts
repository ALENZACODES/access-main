import { describe, expect, it } from "vitest";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { createEgressPolicy } from "./egress";
import { recordBlocked } from "./egressLog";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { exportLocalData, listKeys } from "./localData";
import { prefsKey } from "./preferences";
import { createMemoryStorage, type StorageLike } from "./storage";
import type { Purpose } from "./consent";

const NOW = new Date(2026, 10, 15, 9, 0, 0);
const PURPOSES: readonly Purpose[] = [
  { id: "saved-places", label: { en: "Saved places", fr: "Lieux enregistrés" }, description: { en: "Remember places", fr: "Garder des lieux" }, wordingVersion: 1 },
];
const policy = createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: ["https://data.example.ca"] });

function make(patch: Partial<ControllerDeps> = {}, storage: StorageLike | null = createMemoryStorage({ [`${PREFIX}a`]: "1" })) {
  return { storage, c: createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...patch }) };
}

function backup(items: Record<string, string>): string {
  return exportLocalData(createMemoryStorage(items), PREFIX, NOW, "en").text;
}

describe("restore from a file", () => {
  it("checks first, writes nothing until confirmed", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2", "app.a": "9" }) });
    expect(c.getState().importPending).toBe(true);
    expect(c.getState().status).toEqual({ kind: "import-ready", additions: 1, overwrites: 1, unchanged: 0 });
    expect(storage?.getItem("app.a")).toBe("1");
    expect(storage?.getItem("app.b")).toBeNull();
    c.dispatch({ type: "import-confirm" });
    expect(storage?.getItem("app.a")).toBe("9");
    expect(storage?.getItem("app.b")).toBe("2");
    expect(c.getState()).toMatchObject({ importPending: false, status: { kind: "import-done", count: 2 } });
  });
  it("cancel changes nothing", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2" }) });
    c.dispatch({ type: "import-cancel" });
    expect(storage?.getItem("app.b")).toBeNull();
    expect(c.getState()).toMatchObject({ importPending: false, status: { kind: "import-cancelled" } });
    c.dispatch({ type: "import-confirm" });
    expect(storage?.getItem("app.b")).toBeNull();
  });
  it("confirm with nothing checked does nothing", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-confirm" });
    expect(c.getState().status).toBeNull();
    expect(listKeys(storage!, PREFIX)).toEqual(["app.a"]);
  });
  it("a bad file gives a plain message and leaves storage alone", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: "nope" });
    expect(c.getState().status).toEqual({ kind: "import-problem", code: "not-json" });
    expect(c.getState().importPending).toBe(false);
    expect(listKeys(storage!, PREFIX)).toEqual(["app.a"]);
  });
  it("a second file replaces the first check", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: backup({ "app.x": "1" }) });
    c.dispatch({ type: "import-load", text: backup({ "app.y": "1" }) });
    c.dispatch({ type: "import-confirm" });
    expect(storage?.getItem("app.x")).toBeNull();
    expect(storage?.getItem("app.y")).toBe("1");
  });
  it("a failed write is rolled back and reported", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2", "app.z": "3" }) });
    const real = storage!.setItem.bind(storage!);
    storage!.setItem = (k, v) => {
      if (k === "app.z") throw new Error("quota");
      real(k, v);
    };
    c.dispatch({ type: "import-confirm" });
    expect(c.getState().status).toEqual({ kind: "import-rolled-back" });
    expect(storage?.getItem("app.b")).toBeNull();
  });
  it("reloads the language that was restored", () => {
    const { c } = make();
    expect(c.getState().prefs.locale).toBe("en");
    c.dispatch({ type: "import-load", text: backup({ [prefsKey(PREFIX)]: '{"locale":"fr"}' }) });
    c.dispatch({ type: "import-confirm" });
    expect(c.getState().prefs.locale).toBe("fr");
  });
  it("reloads the choices that were restored", () => {
    const source = createMemoryStorage();
    const first = createPrivacyController({ storage: source, prefix: PREFIX, inventory: FIXTURE, purposes: PURPOSES, now: () => NOW });
    first.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    const file = exportLocalData(source, PREFIX, NOW, "en").text;
    const { c } = make({ purposes: PURPOSES });
    expect(c.getState().consent).toEqual({});
    c.dispatch({ type: "import-load", text: file });
    c.dispatch({ type: "import-confirm" });
    expect(c.getState().consent["saved-places"]?.value).toBe("granted");
  });
  it("does not restore expired envelopes", () => {
    const { c, storage } = make();
    const expired = JSON.stringify({ v: "x", savedAt: "2019-12-01T00:00:00.000Z", expiresAt: "2020-01-01T00:00:00.000Z" });
    c.dispatch({ type: "import-load", text: backup({ "app.old": expired }) });
    c.dispatch({ type: "import-confirm" });
    expect(storage?.getItem("app.old")).toBeNull();
  });
  it("says so when the browser does not allow storage", () => {
    const { c } = make({}, null);
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2" }) });
    expect(c.getState().status).toEqual({ kind: "unavailable" });
  });
  it("is listed in the activity log without contents", () => {
    const { c } = make({ logActivity: true });
    c.dispatch({ type: "import-load", text: backup({ "app.b": "secret-value" }) });
    c.dispatch({ type: "import-confirm" });
    const html = c.html();
    expect(html).toContain("Restored from a file");
    expect(html).not.toContain("secret-value");
  });
  it("erasing clears a waiting restore", () => {
    const { c, storage } = make();
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2" }) });
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(c.getState().importPending).toBe(false);
    c.dispatch({ type: "import-confirm" });
    expect(storage?.getItem("app.b")).toBeNull();
  });
  it("shows the confirm and cancel buttons only while a file is waiting", () => {
    const { c } = make();
    expect(c.html()).not.toContain('data-action="import-confirm"');
    c.dispatch({ type: "import-load", text: backup({ "app.b": "2" }) });
    expect(c.html()).toContain('data-action="import-confirm"');
    expect(c.html()).toContain('data-action="import-cancel"');
  });
});

describe("support summary and printable page", () => {
  it("prepares both as downloads and says so", () => {
    const { c } = make({ purposes: PURPOSES, logActivity: true });
    c.dispatch({ type: "export-support" });
    expect(c.getState().lastExport?.mime).toBe("text/plain");
    expect(c.getState().status).toEqual({ kind: "support-prepared" });
    c.dispatch({ type: "export-printable" });
    expect(c.getState().lastExport?.mime).toBe("text/html");
    expect(c.getState().status).toEqual({ kind: "printable-prepared" });
    expect(c.html()).toContain("Downloaded a support summary");
    expect(c.html()).toContain("Downloaded a printable page");
  });
  it("neither one holds stored contents", () => {
    const { c } = make({}, createMemoryStorage({ [`${PREFIX}a`]: "PRIVATE-CONTENT" }));
    c.dispatch({ type: "export-support" });
    expect(c.getState().lastExport?.text).not.toContain("PRIVATE-CONTENT");
    c.dispatch({ type: "export-printable" });
    expect(c.getState().lastExport?.text).not.toContain("PRIVATE-CONTENT");
  });
  it("follows the language", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    c.dispatch({ type: "export-printable" });
    expect(c.getState().lastExport?.text).toContain('<html lang="fr">');
  });
  it("works when the browser does not allow storage", () => {
    const { c } = make({}, null);
    c.dispatch({ type: "export-support" });
    expect(c.getState().lastExport?.text).toContain("Items stored: 0");
  });
});

describe("network section", () => {
  it("is hidden unless a policy is given, and its storage entry is not listed", () => {
    const { c } = make();
    expect(c.html()).not.toContain("data-privacy-network");
    expect(c.html()).not.toContain("privacy-egress");
  });
  it("lists allowed addresses and says when nothing was stopped", () => {
    const { c } = make({ egress: policy });
    const html = c.html();
    expect(html).toContain("data-privacy-network");
    expect(html).toContain("https://app.example.ca");
    expect(html).toContain("https://data.example.ca");
    expect(html).toContain("No requests have been stopped.");
  });
  it("shows stopped requests by host with counts, and the record is listed as App data", () => {
    const storage = createMemoryStorage();
    recordBlocked(storage, PREFIX, { at: NOW.toISOString(), host: "evil.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const { c } = make({ egress: policy }, storage);
    const html = c.html();
    expect(html).toContain("evil.example.net");
    expect(html).toContain("1 request was stopped, to 1 address.");
    expect(html).toContain("Requests the App stopped");
    expect(html).toContain("egress.v1");
  });
  it("matches the stored record with the list, so it is not called undocumented", () => {
    const storage = createMemoryStorage();
    recordBlocked(storage, PREFIX, { at: NOW.toISOString(), host: "evil.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const { c } = make({ egress: policy }, storage);
    expect(c.html()).not.toContain("Not described in the list above");
  });
  it("is cleared when local data is erased", () => {
    const storage = createMemoryStorage();
    recordBlocked(storage, PREFIX, { at: NOW.toISOString(), host: "evil.example.net", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const { c } = make({ egress: policy }, storage);
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(c.html()).toContain("No requests have been stopped.");
  });
  it("is French in French", () => {
    const { c } = make({ egress: policy, languages: ["fr"] });
    expect(c.html()).toContain("Connexions réseau");
    expect(c.html()).toContain("Aucune demande n’a été arrêtée.");
  });
});
