// CI audit: everything the privacy panel writes to storage must be described in
// the data list it shows. If a feature starts storing something new without an
// entry, this test fails.

import { describe, expect, it } from "vitest";
import { createPrivacyController, type PrivacyAction } from "../panel/controller";
import { listKeys } from "../panel/localData";
import { ownEntries } from "../panel/ownEntries";
import { reconcile } from "../panel/reconcile";
import { createMemoryStorage } from "../panel/storage";
import type { Purpose } from "../panel/consent";

const PURPOSES: readonly Purpose[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
    wordingVersion: 1,
  },
];
const NOW = new Date(2026, 10, 15, 9, 0, 0);
const ALL = ownEntries({ consent: true, activity: true, changes: true });

const FLOW: readonly PrivacyAction[] = [
  { type: "set-locale", locale: "fr" },
  { type: "set-locale", locale: "en" },
  { type: "consent", purposeId: "saved-places", value: "granted" },
  { type: "consent", purposeId: "saved-places", value: "declined" },
  { type: "export" },
  { type: "export-list-csv" },
  { type: "export-list-text" },
  { type: "mark-seen" },
];

function run() {
  const storage = createMemoryStorage();
  const c = createPrivacyController({
    storage,
    prefix: "app.",
    inventory: [],
    purposes: PURPOSES,
    logActivity: true,
    trackChanges: true,
    now: () => NOW,
  });
  for (const a of FLOW) c.dispatch(a);
  return { storage, c };
}

describe("what the panel stores", () => {
  it("every stored name is described by an entry in the list", () => {
    const { storage } = run();
    const r = reconcile(storage, "app.", ALL);
    expect(r.undocumented.map((i) => i.key)).toEqual([]);
    expect(r.documented.map((i) => i.key).sort()).toEqual(["activity.v1", "consent.v1", "prefs.v1", "seen.v1"]);
  });
  it("every entry in the list names its storage, so nothing is left unmatched", () => {
    expect(reconcile(createMemoryStorage(), "app.", ALL).unmatchable).toEqual([]);
  });
  it("writes only under the App's prefix", () => {
    const { storage } = run();
    expect(listKeys(storage, "")).toEqual(listKeys(storage, "app."));
  });
  it("the page shows no undocumented item after the whole flow", () => {
    const { c } = run();
    expect(c.html()).not.toContain("Not in the list above");
    expect(c.html()).not.toContain("Not described in the list above");
  });
  it("is not vacuous: a new, undescribed key is reported", () => {
    const { storage, c } = run();
    storage.setItem("app.new-feature", "1");
    expect(reconcile(storage, "app.", ALL).undocumented.map((i) => i.key)).toEqual(["new-feature"]);
    expect(c.html()).toContain("Not described in the list above: 1.");
  });
  it("with every optional feature off, only the language choice is stored and described", () => {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, prefix: "app.", inventory: [], now: () => NOW });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const r = reconcile(storage, "app.", ownEntries({ consent: false, activity: false, changes: false }));
    expect(r.items.map((i) => i.key)).toEqual(["prefs.v1"]);
    expect(r.undocumented).toEqual([]);
  });
  it("erasing leaves nothing behind", () => {
    const { storage, c } = run();
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(listKeys(storage, "")).toEqual([]);
  });
});
