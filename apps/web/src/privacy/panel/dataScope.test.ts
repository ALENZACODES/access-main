import { describe, expect, it } from "vitest";
import { assertScope, inScope, prefixScope, scopeKeysPresent, toScope, validateScope, type DataScope } from "./dataScope";
import { createMemoryStorage } from "./storage";

const SCOPE: DataScope = { prefix: "access.", keys: ["app.preferences.v1", "data-status:snapshot:v1"] };

describe("inScope", () => {
  it("covers the prefix and the exact extra names, and nothing else", () => {
    expect(inScope(SCOPE, "access.language")).toBe(true);
    expect(inScope(SCOPE, "app.preferences.v1")).toBe(true);
    expect(inScope(SCOPE, "data-status:snapshot:v1")).toBe(true);
    expect(inScope(SCOPE, "app.preferences.v2")).toBe(false);
    expect(inScope(SCOPE, "app.preferences.v1.extra")).toBe(false);
    expect(inScope(SCOPE, "app.other")).toBe(false);
    expect(inScope(SCOPE, "other.access.x")).toBe(false);
  });
  it("covers only the prefix when there are no extra names", () => {
    expect(inScope(prefixScope("access."), "app.preferences.v1")).toBe(false);
    expect(inScope(prefixScope("access."), "access.x")).toBe(true);
  });
});

describe("validateScope", () => {
  it("accepts a good scope", () => {
    expect(validateScope(SCOPE)).toEqual([]);
    expect(() => assertScope(SCOPE)).not.toThrow();
  });
  it("reports an empty prefix", () => {
    expect(validateScope({ prefix: "", keys: [] })).toEqual([{ code: "empty-prefix", key: "" }]);
  });
  it("reports a name with characters outside the allowed set, including a pattern star", () => {
    expect(validateScope({ prefix: "a.", keys: ["x*", "has space", "ok"] })).toEqual([
      { code: "bad-key", key: "x*" },
      { code: "bad-key", key: "has space" },
    ]);
  });
  it("reports a name inside the prefix and a repeated name", () => {
    expect(validateScope({ prefix: "access.", keys: ["access.x", "app.a", "app.a"] })).toEqual([
      { code: "inside-prefix", key: "access.x" },
      { code: "duplicate-key", key: "app.a" },
    ]);
  });
  it("reports names that could reach object internals", () => {
    expect(validateScope({ prefix: "a.", keys: ["__proto__", "constructor", "prototype"] }).map((p) => p.code)).toEqual(["reserved-key", "reserved-key", "reserved-key"]);
  });
  it("throws a message that names every problem", () => {
    expect(() => assertScope({ prefix: "", keys: ["x*"] })).toThrow(/empty-prefix.*bad-key x\*/);
  });
});

describe("scopeKeysPresent", () => {
  it("lists stored names in scope, sorted, and leaves out listed names that are not stored", () => {
    const s = createMemoryStorage({ "access.b": "1", "access.a": "1", "app.preferences.v1": "x", "unrelated": "y", "app.preferences.v2": "z" });
    expect(scopeKeysPresent(s, SCOPE)).toEqual(["access.a", "access.b", "app.preferences.v1"]);
  });
  it("is empty for empty storage", () => {
    expect(scopeKeysPresent(createMemoryStorage(), SCOPE)).toEqual([]);
  });
});

describe("toScope", () => {
  it("turns a prefix into a scope and passes a scope through", () => {
    expect(toScope("access.")).toEqual({ prefix: "access.", keys: [] });
    expect(toScope(SCOPE)).toBe(SCOPE);
  });
});
