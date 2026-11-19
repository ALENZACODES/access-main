import { describe, expect, it } from "vitest";
import { omit } from "./omit";

describe("omit", () => {
  it("drops the named keys and keeps the rest", () => {
    expect(omit({ a: 1, b: 2, c: 3 }, "a", "c")).toEqual({ b: 2 });
  });
  it("does not change the original", () => {
    const o = { a: 1, b: 2 };
    omit(o, "a");
    expect(o).toEqual({ a: 1, b: 2 });
  });
  it("accepts no keys", () => {
    expect(omit({ a: 1 })).toEqual({ a: 1 });
  });
});
