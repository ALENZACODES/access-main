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
