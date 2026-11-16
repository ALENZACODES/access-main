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
