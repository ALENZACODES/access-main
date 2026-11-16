import { describe, expect, it } from "vitest";
import { hasControlCharacter } from "./controlCharacters";

const at = (code: number) => `a${String.fromCharCode(code)}b`;

describe("hasControlCharacter", () => {
  it("flags C0 controls and DEL, and allows tab, line feed and carriage return by default", () => {
    for (const code of [0x00, 0x01, 0x08, 0x0b, 0x0c, 0x0e, 0x1f, 0x7f]) expect(hasControlCharacter(at(code))).toBe(true);
    for (const code of [0x09, 0x0a, 0x0d, 0x20, 0x7e, 0x80, 0x9f, 0xe9]) expect(hasControlCharacter(at(code))).toBe(false);
  });

  it("flags tab, line feed and carriage return when strict", () => {
    for (const code of [0x09, 0x0a, 0x0d, 0x00, 0x1f, 0x7f]) expect(hasControlCharacter(at(code), { strict: true })).toBe(true);
    expect(hasControlCharacter("plain text", { strict: true })).toBe(false);
  });

  it("flags C1 controls only when asked", () => {
    for (const code of [0x80, 0x85, 0x9f]) {
      expect(hasControlCharacter(at(code), { strict: true, c1: true })).toBe(true);
      expect(hasControlCharacter(at(code), { strict: true })).toBe(false);
    }
    expect(hasControlCharacter(at(0xa0), { strict: true, c1: true })).toBe(false);
  });
});
