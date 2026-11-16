import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  MIN_TARGET_PX,
  MIN_TOUCH_TARGET_PX,
  STATE_PALETTE,
  type PaletteRole,
  type Theme,
  contrastRatio,
  meetsAA,
  meetsTargetSize,
  parseHex,
  styleFor,
} from "./index";

describe("contrast maths", () => {
  it("parses 3 and 6 digit hex and rejects junk", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#0B4F9E")).toEqual([11, 79, 158]);
    expect(parseHex("blue")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });
  it("matches the WCAG reference ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#nope", "#FFFFFF")).toBeNull();
  });
  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#fedcba")).toBeCloseTo(contrastRatio("#fedcba", "#123456")!, 10);
  });
  it("applies the right threshold per kind", () => {
    expect(meetsAA("#777777", "#FFFFFF", "text")).toBe(false);
    expect(meetsAA("#777777", "#FFFFFF", "large-text")).toBe(true);
    expect(meetsAA("#949494", "#FFFFFF", "ui")).toBe(true);
    expect(meetsAA("bad", "#FFFFFF")).toBe(false);
  });
});

describe("target size", () => {
  it("requires 44px in both dimensions", () => {
    expect(meetsTargetSize(44, 44)).toBe(true);
    expect(meetsTargetSize(43, 44)).toBe(false);
    expect(meetsTargetSize(44, 24)).toBe(false);
  });
  it("uses the same constant as the state actions", () => {
    expect(MIN_TARGET_PX).toBe(MIN_TOUCH_TARGET_PX);
  });
});

describe("state palette", () => {
  const themes: Theme[] = ["light", "dark"];
  const roles: PaletteRole[] = ["body", "alert", "status", "button", "unknown"];
  for (const theme of themes) {
    for (const role of roles) {
      it(`${theme}/${role} text meets AA`, () => {
        const p = STATE_PALETTE[theme].roles[role];
        expect(contrastRatio(p.fg, p.bg)!, `${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
    it(`${theme} focus ring reaches 3:1 against the body background`, () => {
      const pal = STATE_PALETTE[theme];
      expect(meetsAA(pal.focusRing, pal.roles.body.bg, "ui")).toBe(true);
    });
  }
  it("builds a style string", () => {
    expect(styleFor("body")).toBe("color:#1A1A1A;background:#FFFFFF");
    expect(styleFor("body", "dark")).toBe("color:#F2F2F2;background:#121212");
  });
});
