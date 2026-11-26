import { describe, expect, it } from "vitest";
import { isShortId } from "./packEarlierId";

describe("isShortId", () => {
  it.each(["a", "A", "cafe nord".replace(" ", "-"), "é", "a_b", "a.b", "1", "x".repeat(200), "北京", "a/b", "a?b#c"])("accepts %j", (id) => expect(isShortId(id)).toBe(true));
  it.each(["", " ", "a b", "a\tb", "a\nb", "a\r", "\u0000", "a\u0001", "a\u007f", "a b", "a b", " a", "a ", "x".repeat(201)])("rejects %j", (id) => expect(isShortId(id)).toBe(false));
  it("allows exactly 200 characters", () => {
    expect(isShortId("a".repeat(200))).toBe(true);
    expect(isShortId("a".repeat(201))).toBe(false);
  });
  it("counts characters, not bytes", () => expect(isShortId("é".repeat(200))).toBe(true));
  it("rejects every control character below the space", () => {
    for (let c = 0; c < 32; c++) expect(isShortId(`a${String.fromCharCode(c)}b`), String(c)).toBe(false);
  });
  it("accepts every printable ASCII character but the space", () => {
    for (let c = 33; c < 127; c++) expect(isShortId(String.fromCharCode(c)), String(c)).toBe(true);
  });
});
