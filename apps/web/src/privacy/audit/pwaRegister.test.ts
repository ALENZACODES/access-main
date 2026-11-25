import { describe, expect, it } from "vitest";
import { assertPwaRegister, PWA_ACCEPTABLE, PWA_ACCEPTED, PWA_REGISTER, validatePwaRegister, type PwaAcceptRow, type PwaRegister } from "./pwaRegister";
import { PWA_CODES } from "./pwaRules";

const reg = (settings: Record<string, string>, note = "A note that says what the settings are for."): PwaRegister => ({ path: "x.ts", settings, note });
const okRow: PwaAcceptRow = { path: "x.ts", code: "long-max-age", count: 1, reason: "A real reason that is long enough to count." };
const msgs = (r: PwaRegister, a: readonly PwaAcceptRow[] = []): string[] => validatePwaRegister(r, a).map((p) => p.message);

describe("the real register", () => {
  it("is valid", () => expect(validatePwaRegister()).toEqual([]));
  it("does not throw when asserted", () => expect(() => assertPwaRegister()).not.toThrow());
  it("is for the configuration file of the web app", () => expect(PWA_REGISTER.path).toBe("apps/web/vite.config.ts"));
  it("keeps its keys in sorted order", () => {
    const k = Object.keys(PWA_REGISTER.settings);
    expect(k).toEqual([...k].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
  it("has a runtime row for each of the count", () => {
    const n = Number(PWA_REGISTER.settings["workbox.runtime.count"]);
    for (let i = 0; i < n; i++) expect(PWA_REGISTER.settings[`workbox.runtime.${i}`]).toBeDefined();
  });
  it("says that the data and the packs are not kept in the page cache, and that a new version waits", () => {
    expect(PWA_REGISTER.settings["workbox.runtime.0"]?.split("|")[1]).toBe("NetworkOnly");
    expect(PWA_REGISTER.settings["registerType"]).toBe("prompt");
    expect(PWA_REGISTER.settings["workbox.skipWaiting"]).toBe("false");
  });
  it("writes a setting held in a variable as unknown, not as a value", () => {
    expect(PWA_REGISTER.settings["manifest.start_url"]).toBe("unknown:base");
    expect(PWA_REGISTER.settings["manifest.scope"]).toBe("unknown:base");
  });
});

describe("the accepted list", () => {
  it("has only codes that may be accepted, each with a real reason", () => {
    for (const a of PWA_ACCEPTED) {
      expect(PWA_ACCEPTABLE).toContain(a.code);
      expect(a.reason.length).toBeGreaterThan(40);
      expect(a.path).toBe(PWA_REGISTER.path);
    }
  });
  it("never allows the findings that put the person's data or updates at risk", () => {
    for (const never of ["auto-update", "skip-waiting", "data-cached", "packs-cached", "third-party-cache", "any-origin-cache", "unbounded-cache", "manifest-org", "dev-enabled", "no-pwa-call", "options-unknown"] as const) expect(PWA_ACCEPTABLE).not.toContain(never);
  });
  it("uses only codes that exist", () => {
    for (const c of PWA_ACCEPTABLE) expect(PWA_CODES).toContain(c);
  });
  it("names the wording finding and says the file is not this lane's", () => {
    const row = PWA_ACCEPTED.find((a) => a.code === "verification-wording");
    expect(row?.count).toBe(1);
    expect(row?.reason).toContain("another lane");
  });
});

describe("validatePwaRegister", () => {
  const base = { a: "1", "workbox.runtime.0": "x", "workbox.runtime.count": "1" };
  it("accepts a small valid register", () => expect(msgs(reg(base))).toEqual([]));
  it("finds keys out of order", () => expect(msgs(reg({ b: "1", a: "2", "workbox.runtime.count": "0" }))).toEqual(["the settings are not in sorted order"]));
  it("finds an empty value", () => expect(msgs(reg({ a: "", "workbox.runtime.count": "0" }))).toEqual(["the setting a has an empty value"]));
  it("finds a count that is not the number of rows", () => expect(msgs(reg({ a: "1", "workbox.runtime.0": "x", "workbox.runtime.count": "2" }))).toEqual(["workbox.runtime.count is 2 but 1 rows are written"]));
  it("finds a count that is not written", () => expect(msgs(reg({ a: "1" }))).toEqual(["workbox.runtime.count is absent but 0 rows are written"]));
  it("finds a row that is skipped", () => expect(msgs(reg({ a: "1", "workbox.runtime.1": "x", "workbox.runtime.count": "1" }))).toEqual(["the runtime rows skip 0"]));
  it("finds an empty note", () => expect(msgs(reg(base, "  "))).toEqual(["the note is empty"]));
  it("accepts a valid accepted row", () => expect(msgs(reg(base), [okRow])).toEqual([]));
  it("finds a row accepted twice", () => expect(msgs(reg(base), [okRow, okRow])).toEqual(["x.ts accepts long-max-age twice"]));
  it("finds a code that may not be accepted", () => expect(msgs(reg(base), [{ ...okRow, code: "auto-update" }])).toEqual(["auto-update may not be accepted (x.ts)"]));
  it.each([[0], [-1], [1.5]])("finds a count of %d", (n) => expect(msgs(reg(base), [{ ...okRow, count: n }])).toEqual([`x.ts long-max-age has a count of ${n}`]));
  it("finds a reason that is too short", () => expect(msgs(reg(base), [{ ...okRow, reason: "ok." }])).toEqual(["x.ts long-max-age has no real reason"]));
  it("gives every problem, not only the first", () => expect(msgs(reg({ b: "", a: "2" }, ""), [{ ...okRow, count: 0, reason: "" }]).length).toBeGreaterThanOrEqual(5));
  it("throws with the problems from assertPwaRegister when the real list is changed", () => {
    expect(() => {
      const p = validatePwaRegister(reg({ a: "" }));
      if (p.length > 0) throw new Error(`The install-settings register is wrong:\n${p.map((x) => `  ${x.message}`).join("\n")}`);
    }).toThrow(/register is wrong/);
  });
});
