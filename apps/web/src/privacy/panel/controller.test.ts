import { describe, expect, it } from "vitest";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { listKeys } from "./localData";
import { prefsKey } from "./preferences";
import { createMemoryStorage, type StorageLike } from "./storage";

const NOW = new Date(2026, 10, 15, 9, 0, 0);

function make(patch: Partial<ControllerDeps> = {}, store?: StorageLike | null) {
  const storage = store === undefined ? createMemoryStorage({ [`${PREFIX}a`]: "1", [`${PREFIX}b`]: "2" }) : store;
  const deps: ControllerDeps = {
    storage,
    prefix: PREFIX,
    inventory: FIXTURE,
    now: () => NOW,
    ...patch,
  };
  return { storage, c: createPrivacyController(deps) };
}

describe("start-up", () => {
  it("refuses an invalid inventory", () => {
    expect(() => make({ inventory: [{ ...FIXTURE[0]!, id: "BAD" }] })).toThrow(/Invalid privacy inventory/);
  });
  it("uses the browser language when nothing is stored", () => {
    expect(make({ languages: ["fr-CA"] }).c.getState().prefs.locale).toBe("fr");
    expect(make({ languages: ["en-CA"] }).c.getState().prefs.locale).toBe("en");
    expect(make().c.getState().prefs.locale).toBe("en");
  });
  it("prefers a stored language over the browser language", () => {
    const s = createMemoryStorage({ [prefsKey(PREFIX)]: '{"locale":"en"}' });
    expect(make({ languages: ["fr"] }, s).c.getState().prefs.locale).toBe("en");
  });
  it("starts with no status, no confirmation and no export", () => {
    const st = make().c.getState();
    expect([st.confirmingErase, st.status, st.lastExport]).toEqual([false, null, null]);
  });
});

describe("language", () => {
  it("switches the rendered page and stores the choice", () => {
    const { c, storage } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain('lang="fr"');
    expect(storage?.getItem(prefsKey(PREFIX))).toBe('{"locale":"fr"}');
  });
  it("still switches when storage is unavailable", () => {
    const { c } = make({}, null);
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.getState().prefs.locale).toBe("fr");
  });
});

describe("export", () => {
  it("prepares a file and says how many items", () => {
    const { c } = make();
    const st = c.dispatch({ type: "export" });
    expect(st.status).toEqual({ kind: "exported", count: 2 });
    expect(st.lastExport?.filename).toBe("the-app-data-2026-11-15.json");
    expect(c.html()).toContain("Download prepared: 2 items.");
  });
  it("names the file in French after the language is switched", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    const st = c.dispatch({ type: "export" });
    expect(st.lastExport?.filename).toBe("l-app-donnees-2026-11-15.json");
    expect(st.status).toEqual({ kind: "exported", count: 3 });
  });
  it("says nothing was found instead of offering an empty file", () => {
    const { c } = make({}, createMemoryStorage());
    const st = c.dispatch({ type: "export" });
    expect(st.status).toEqual({ kind: "nothing" });
    expect(st.lastExport).toBeNull();
  });
  it("says so when storage is unavailable", () => {
    const { c } = make({}, null);
    expect(c.dispatch({ type: "export" }).status).toEqual({ kind: "unavailable" });
  });
});

describe("erase", () => {
  it("asks first, and cancel changes nothing", () => {
    const { c, storage } = make();
    expect(c.dispatch({ type: "erase-ask" }).confirmingErase).toBe(true);
    expect(c.html()).toContain("data-privacy-confirm");
    const st = c.dispatch({ type: "erase-cancel" });
    expect(st.confirmingErase).toBe(false);
    expect(listKeys(storage!, PREFIX)).toHaveLength(2);
  });
  it("erases only after confirmation and reports the count", () => {
    const { c, storage } = make();
    c.dispatch({ type: "erase-ask" });
    const st = c.dispatch({ type: "erase-confirm" });
    expect(st.status).toEqual({ kind: "erased", count: 2 });
    expect(st.confirmingErase).toBe(false);
    expect(listKeys(storage!, PREFIX)).toEqual([]);
  });
  it("does not ask when there is nothing to erase", () => {
    const { c } = make({}, createMemoryStorage({ "other.x": "1" }));
    const st = c.dispatch({ type: "erase-ask" });
    expect(st.confirmingErase).toBe(false);
    expect(st.status).toEqual({ kind: "nothing" });
  });
  it("leaves other keys alone", () => {
    const { c, storage } = make({}, createMemoryStorage({ [`${PREFIX}a`]: "1", "other.x": "2" }));
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(storage?.getItem("other.x")).toBe("2");
  });
  it("reports keys that could not be erased", () => {
    const inner = createMemoryStorage({ [`${PREFIX}a`]: "1", [`${PREFIX}b`]: "2" });
    const s: StorageLike = {
      get length() {
        return inner.length;
      },
      key: (i) => inner.key(i),
      getItem: (k) => inner.getItem(k),
      setItem: (k, v) => inner.setItem(k, v),
      removeItem: (k) => {
        if (k.endsWith("a")) throw new Error("blocked");
        inner.removeItem(k);
      },
    };
    const { c } = make({}, s);
    c.dispatch({ type: "erase-ask" });
    expect(c.dispatch({ type: "erase-confirm" }).status).toEqual({ kind: "erase-partial", failed: 1 });
    expect(c.html()).toContain("Partly erased: 1 item could not be erased.");
  });
  it("says so when storage is unavailable", () => {
    const { c } = make({}, null);
    expect(c.dispatch({ type: "erase-ask" }).status).toEqual({ kind: "unavailable" });
    expect(c.dispatch({ type: "erase-confirm" }).status).toEqual({ kind: "unavailable" });
  });
  it("a later action clears an old export", () => {
    const { c } = make();
    c.dispatch({ type: "export" });
    expect(c.dispatch({ type: "erase-ask" }).lastExport).toBeNull();
  });
});

import { consentKey, type Purpose } from "./consent";
import { putExpiring } from "./expiry";

const PURPOSES: readonly Purpose[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    description: { en: "Remember places on this device", fr: "Garder des lieux sur cet appareil" },
    wordingVersion: 1,
  },
  {
    id: "map-hints",
    label: { en: "Map hints", fr: "Indices de carte" },
    description: { en: "Show short hints on the map", fr: "Afficher de courts indices sur la carte" },
    wordingVersion: 1,
  },
];

describe("consent", () => {
  it("starts with every purpose undecided", () => {
    const { c } = make({ purposes: PURPOSES });
    expect(c.getState().consent).toEqual({});
    expect(c.html()).toContain("Not decided yet");
  });
  it("refuses invalid purposes at start-up", () => {
    expect(() => make({ purposes: [{ ...PURPOSES[0]!, description: { en: "Verified", fr: "Texte" } }] })).toThrow(
      /Invalid consent purposes/,
    );
  });
  it("records and stores a choice, and says so", () => {
    const { c, storage } = make({ purposes: PURPOSES });
    const st = c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    expect(st.consent["saved-places"]?.decidedOn).toBe("2026-11-15");
    expect(st.status).toEqual({ kind: "consent-saved", value: "granted", label: "Saved places" });
    expect(storage?.getItem(consentKey(PREFIX))).toContain("saved-places");
    expect(c.html()).toContain("Saved: allowed for “Saved places”.");
  });
  it("uses the French label after the language is switched", () => {
    const { c } = make({ purposes: PURPOSES });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const st = c.dispatch({ type: "consent", purposeId: "map-hints", value: "declined" });
    expect(st.status).toEqual({ kind: "consent-saved", value: "declined", label: "Indices de carte" });
  });
  it("loads earlier choices on the next start", () => {
    const { c, storage } = make({ purposes: PURPOSES });
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    const again = createPrivacyController({
      storage,
      prefix: PREFIX,
      inventory: FIXTURE,
      purposes: PURPOSES,
      now: () => NOW,
    });
    expect(again.getState().consent["saved-places"]?.value).toBe("granted");
  });
  it("ignores a purpose it does not know", () => {
    const { c } = make({ purposes: PURPOSES });
    const before = c.getState();
    expect(c.dispatch({ type: "consent", purposeId: "nope", value: "granted" })).toBe(before);
  });
  it("says so when the choice could not be saved, and still keeps it for this page", () => {
    const { c } = make({ purposes: PURPOSES }, null);
    const st = c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    expect(st.status).toEqual({ kind: "save-failed" });
    expect(st.consent["saved-places"]?.value).toBe("granted");
  });
  it("erasing local data also resets every choice to undecided", () => {
    const { c } = make({ purposes: PURPOSES });
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    c.dispatch({ type: "erase-ask" });
    const st = c.dispatch({ type: "erase-confirm" });
    expect(st.consent).toEqual({});
    expect(c.html()).not.toContain("Allowed since");
  });
  it("hides the section when there are no purposes", () => {
    expect(make().c.html()).not.toContain("data-privacy-consent");
  });
});

describe("expired items", () => {
  const T0 = new Date(2026, 10, 1, 9, 0, 0);
  it("removes expired items at start-up and says how many", () => {
    const storage = createMemoryStorage({ [`${PREFIX}plain`]: "keep" });
    putExpiring(storage, `${PREFIX}old`, "a", T0, 1);
    putExpiring(storage, `${PREFIX}new`, "b", NOW, 30);
    const c = createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
    expect(c.getState().status).toEqual({ kind: "expired-removed", count: 1 });
    expect(storage.getItem(`${PREFIX}old`)).toBeNull();
    expect(storage.getItem(`${PREFIX}new`)).not.toBeNull();
    expect(storage.getItem(`${PREFIX}plain`)).toBe("keep");
    expect(c.html()).toContain("Expired items removed from this device: 1.");
  });
  it("shows no status when nothing expired", () => {
    expect(make().c.getState().status).toBeNull();
  });
  it("does not fail when storage is unavailable", () => {
    expect(make({}, null).c.getState().status).toBeNull();
  });
});

import { loadActivity } from "./activityLog";
import { loadSeen, seenKey } from "./changes";
import type { InventoryEntry } from "./inventory";

describe("data list downloads", () => {
  it("prepares a CSV with the entries, including the panel's own, and says so", () => {
    const { c } = make();
    const st = c.dispatch({ type: "export-list-csv" });
    expect(st.lastExport?.mime).toBe("text/csv");
    expect(st.lastExport?.filename).toBe("the-app-data-list-2026-11-15.csv");
    expect(st.lastExport?.text).toContain("Your language choice");
    expect(st.lastExport?.text).toContain("Saved places");
    expect(st.status).toEqual({ kind: "list-exported", format: "csv" });
    expect(c.html()).toContain("Data list prepared as CSV.");
  });
  it("uses a semicolon in French, for French spreadsheets", () => {
    const { c } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    const f = c.dispatch({ type: "export-list-csv" }).lastExport;
    expect(f?.text.split("\r\n")[0]).toContain(";");
    expect(f?.filename).toBe("l-app-liste-des-donnees-2026-11-15.csv");
  });
  it("prepares plain text with the review date", () => {
    const { c } = make({ reviewedOn: "2026-11-10" });
    const st = c.dispatch({ type: "export-list-text" });
    expect(st.lastExport?.mime).toBe("text/plain");
    expect(st.lastExport?.text).toContain("Last reviewed: 2026-11-10");
    expect(c.html()).toContain("Data list prepared as text.");
  });
  it("works when storage is unavailable", () => {
    const { c } = make({}, null);
    expect(c.dispatch({ type: "export-list-csv" }).lastExport?.count).toBeGreaterThan(0);
  });
});

describe("the panel's own entries", () => {
  it("are shown in the table, matching only the features that are on", () => {
    const off = make().c.html();
    expect(off).toContain("Your language choice");
    expect(off).not.toContain("Recent privacy actions");
    expect(off).not.toContain("The last data list you saw");
    expect(off).not.toContain("Your choices about optional features");
    const on = make({ purposes: PURPOSES, logActivity: true, trackChanges: true }).c.html();
    expect(on).toContain("Your choices about optional features");
    expect(on).toContain("The last data list you saw");
    expect(on).toContain("Up to 90 days after the latest action");
  });
  it("refuses a caller entry that uses the reserved id prefix", () => {
    expect(() => make({ inventory: [{ ...FIXTURE[0]!, id: "privacy-mine" }] })).toThrow(/reserved-id/);
  });
  it("refuses a caller entry that claims a storage name the panel uses", () => {
    expect(() => make({ inventory: [{ ...FIXTURE[0]!, storageKeys: ["prefs.v1"] }] })).toThrow(/duplicate-storage-key/);
  });
});

describe("stored items", () => {
  it("shows what is stored now, matched to the list, and flags the rest", () => {
    const { c, storage } = make({ inventory: [{ ...FIXTURE[0]!, storageKeys: ["a"] }, ...FIXTURE.slice(1)] });
    expect(c.html()).toContain('data-key="a"');
    storage?.setItem(`${PREFIX}surprise`, "1");
    expect(c.html()).toContain("Not described in the list above: 2.");
  });
  it("reads the current storage each time, not a copy", () => {
    const { c, storage } = make({}, createMemoryStorage());
    expect(c.html()).toContain("No items from the App are stored in this browser.");
    storage?.setItem(`${PREFIX}x`, "1");
    expect(c.html()).toContain('data-key="x"');
  });
});

describe("activity log", () => {
  const withLog = (storage?: StorageLike | null) => make({ logActivity: true, purposes: PURPOSES }, storage);

  it("is off by default and writes nothing", () => {
    const { c, storage } = make();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).not.toContain("data-privacy-activity");
    expect(storage?.getItem(`${PREFIX}activity.v1`)).toBeNull();
  });
  it("starts empty when on", () => {
    expect(withLog().c.html()).toContain("No actions are listed.");
  });
  it("records language changes, but not a choice of the language already in use", () => {
    const { c, storage } = withLog();
    c.dispatch({ type: "set-locale", locale: "en" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const log = loadActivity(storage!, PREFIX, NOW);
    expect(log.map((e) => [e.kind, e.lang])).toEqual([["language", "fr"]]);
  });
  it("records consent choices by purpose id", () => {
    const { c, storage } = withLog();
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    c.dispatch({ type: "consent", purposeId: "map-hints", value: "declined" });
    expect(loadActivity(storage!, PREFIX, NOW).map((e) => [e.kind, e.purposeId])).toEqual([
      ["consent-declined", "map-hints"],
      ["consent-granted", "saved-places"],
    ]);
  });
  it("records a download with its item count, but not an empty one", () => {
    const { c, storage } = withLog();
    c.dispatch({ type: "export" });
    expect(loadActivity(storage!, PREFIX, NOW).some((e) => e.kind === "export")).toBe(true);
    const empty = withLog(createMemoryStorage());
    empty.c.dispatch({ type: "export" });
    expect(loadActivity(empty.storage!, PREFIX, NOW)).toEqual([]);
  });
  it("records list downloads with their format", () => {
    const { c, storage } = withLog();
    c.dispatch({ type: "export-list-csv" });
    c.dispatch({ type: "export-list-text" });
    expect(loadActivity(storage!, PREFIX, NOW).map((e) => e.format)).toEqual(["text", "csv"]);
  });
  it("records removal of expired items at start-up", () => {
    const storage = createMemoryStorage();
    putExpiring(storage, `${PREFIX}old`, "a", new Date(2026, 9, 1), 1);
    createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, logActivity: true });
    expect(loadActivity(storage, PREFIX, NOW)).toMatchObject([{ kind: "expired-removed", count: 1 }]);
  });
  it("shows the entries on the page, newest first, with purpose labels in the page language", () => {
    const { c } = withLog();
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    c.dispatch({ type: "set-locale", locale: "fr" });
    const html = c.html();
    expect(html).toContain("Langue changée\u00a0: français");
    expect(html).toContain("Autorisé\u00a0: «\u202fLieux enregistrés\u202f»");
    expect(html.indexOf("Langue changée")).toBeLessThan(html.indexOf("Autorisé\u00a0:"));
  });
  it("is removed with everything else when local data is erased, and erasing is not logged", () => {
    const { c, storage } = withLog();
    c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" });
    c.dispatch({ type: "erase-ask" });
    c.dispatch({ type: "erase-confirm" });
    expect(loadActivity(storage!, PREFIX, NOW)).toEqual([]);
    expect(listKeys(storage!, PREFIX)).toEqual([]);
    expect(c.html()).toContain("No actions are listed.");
  });
  it("does not fail when storage is unavailable", () => {
    const { c } = withLog(null);
    expect(() => c.dispatch({ type: "consent", purposeId: "saved-places", value: "granted" })).not.toThrow();
    expect(c.html()).toContain("No actions are listed.");
  });
});

describe("change tracking", () => {
  const track = (inventory: readonly InventoryEntry[], storage: StorageLike | null) =>
    createPrivacyController({ storage, prefix: PREFIX, inventory, now: () => NOW, trackChanges: true });

  it("is off by default: no section, nothing stored", () => {
    const { c, storage } = make();
    expect(c.getState().changes).toBeNull();
    expect(c.html()).not.toContain("data-privacy-changes");
    expect(storage?.getItem(seenKey(PREFIX))).toBeNull();
  });
  it("the first time compares nothing and remembers the list as the starting point", () => {
    const storage = createMemoryStorage();
    const c = track(FIXTURE, storage);
    expect(c.getState().changes).toEqual({ kind: "first-view" });
    expect(c.html()).toContain("first time the list is shown");
    expect(loadSeen(storage, PREFIX, NOW)?.seenOn).toBe("2026-11-15");
  });
  it("the next visit reports no change when the list is the same", () => {
    const storage = createMemoryStorage();
    track(FIXTURE, storage);
    expect(track(FIXTURE, storage).getState().changes).toEqual({ kind: "none", seenOn: "2026-11-15" });
  });
  it("the next visit lists what changed, and mark-seen clears it", () => {
    const storage = createMemoryStorage();
    track(FIXTURE, storage);
    const changed = [{ ...FIXTURE[0]!, where: "sent-to-server" as const }, ...FIXTURE.slice(1)];
    const c = track(changed, storage);
    expect(c.getState().changes).toMatchObject({ kind: "diff", changed: [{ en: "Saved places" }] });
    expect(c.html()).toContain("Changed: Saved places");
    const st = c.dispatch({ type: "mark-seen" });
    expect(st.changes).toEqual({ kind: "none", seenOn: "2026-11-15" });
    expect(st.status).toEqual({ kind: "seen-saved" });
    expect(track(changed, storage).getState().changes?.kind).toBe("none");
  });
  it("mark-seen does nothing when tracking is off", () => {
    const { c } = make();
    const before = c.getState();
    expect(c.dispatch({ type: "mark-seen" })).toBe(before);
  });
  it("erasing local data goes back to the first-view state without writing a new baseline", () => {
    const storage = createMemoryStorage();
    const c = track(FIXTURE, storage);
    c.dispatch({ type: "erase-ask" });
    expect(c.dispatch({ type: "erase-confirm" }).changes).toEqual({ kind: "first-view" });
    expect(storage.getItem(seenKey(PREFIX))).toBeNull();
  });
  it("works without storage, always as a first view", () => {
    expect(track(FIXTURE, null).getState().changes).toEqual({ kind: "first-view" });
  });
});

describe("subscribe", () => {
  it("calls listeners after every dispatch, and stops after unsubscribe", () => {
    const { c } = make();
    const seen: string[] = [];
    const stop = c.subscribe((s) => seen.push(s.prefs.locale));
    c.dispatch({ type: "set-locale", locale: "fr" });
    c.dispatch({ type: "erase-ask" });
    stop();
    c.dispatch({ type: "set-locale", locale: "en" });
    expect(seen).toEqual(["fr", "fr"]);
  });
});
