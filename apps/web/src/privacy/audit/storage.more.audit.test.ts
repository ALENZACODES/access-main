// CI audit: the network record, restoring from a file, the support summary and
// the printable page must not store anything the data list does not describe.

import { describe, expect, it } from "vitest";
import { createPrivacyController } from "../panel/controller";
import type { Purpose } from "../panel/consent";
import { createEgressPolicy, type GuardHost } from "../panel/egress";
import { installPersistentGuard } from "../panel/egressLog";
import { exportLocalData, listKeys } from "../panel/localData";
import { ownEntries } from "../panel/ownEntries";
import { reconcile } from "../panel/reconcile";
import { createMemoryStorage } from "../panel/storage";

const NOW = new Date(2026, 10, 15, 9, 0, 0);
const PURPOSES: readonly Purpose[] = [
  { id: "saved-places", label: { en: "Saved places", fr: "Lieux enregistrés" }, description: { en: "Remember places", fr: "Garder des lieux" }, wordingVersion: 1 },
];
const ALL = ownEntries({ consent: true, activity: true, changes: true, egress: true });
const policy = createEgressPolicy({ selfOrigin: "https://app.example.ca" });

async function run() {
  const storage = createMemoryStorage();
  const host: GuardHost = { fetch: () => Promise.resolve("ok") };
  installPersistentGuard(host, policy, storage, "app.", () => NOW);
  await host.fetch?.("https://evil.example.net/x?y=1").catch(() => undefined);
  const c = createPrivacyController({
    storage,
    prefix: "app.",
    inventory: [],
    purposes: PURPOSES,
    logActivity: true,
    trackChanges: true,
    egress: policy,
    now: () => NOW,
  });
  c.dispatch({ type: "set-locale", locale: "fr" });
  c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
  c.dispatch({ type: "export-support" });
  c.dispatch({ type: "export-printable" });
  c.dispatch({ type: "import-load", text: exportLocalData(storage, "app.", NOW, "en").text });
  c.dispatch({ type: "mark-seen" });
  c.dispatch({ type: "import-confirm" });
  return { storage, c };
}

describe("what the panel stores, with the network guard and restore", () => {
  it("every stored name is described, and the network record is among them", async () => {
    const { storage } = await run();
    const r = reconcile(storage, "app.", ALL);
    expect(r.undocumented.map((i) => i.key)).toEqual([]);
    expect(r.documented.map((i) => i.key).sort()).toEqual(["activity.v1", "consent.v1", "egress.v1", "prefs.v1", "seen.v1"]);
  });
  it("support summary and printable page write nothing", () => {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, prefix: "app.", inventory: [], now: () => NOW });
    const before = listKeys(storage, "");
    c.dispatch({ type: "export-support" });
    c.dispatch({ type: "export-printable" });
    expect(listKeys(storage, "")).toEqual(before);
  });
  it("a restore writes only keys that were in the file", () => {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, prefix: "app.", inventory: [], now: () => NOW });
    c.dispatch({ type: "import-load", text: exportLocalData(createMemoryStorage({ "app.one": "1" }), "app.", NOW, "en").text });
    c.dispatch({ type: "import-confirm" });
    expect(listKeys(storage, "")).toEqual(["app.one"]);
  });
  it("the data list says nothing about the network record when the guard is off", () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: "app.", inventory: [], now: () => NOW });
    expect(c.html()).not.toContain("egress.v1");
  });
});
