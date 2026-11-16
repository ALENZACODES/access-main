import { expect, test } from "@playwright/test";
import {
  contrast, contrastProblems, luminance, minimumRatio, readColour,
  type TextColour,
} from "./p20e-contrast";
import type { AuditContext } from "./p20e-policy";
const ctx: AuditContext = { page: "http://localhost/fr", locale: "fr" };
const text = (overrides: Partial<TextColour> = {}): TextColour => ({
  selector: "#description", text: "Description", foreground: "rgb(0, 0, 0)",
  background: "rgb(255, 255, 255)", fontSize: 16, fontWeight: 400,
  visible: true, ...overrides,
});
test.describe("P20E: contrast contracts", () => {
  test("black and white are parsed", () => {
    expect(readColour("rgb(0, 0, 0)")).toEqual([0, 0, 0]);
    expect(readColour("rgb(255, 255, 255)")).toEqual([255, 255, 255]);
  });
  test("transparent colours are not treated as opaque", () => {
    expect(readColour("rgba(0, 0, 0, 0)")).toBeNull();
  });
  test("invalid or out-of-range channels are rejected", () => {
    expect(readColour("rgb(300, 0, 0)")).toBeNull();
    expect(readColour("not-a-colour")).toBeNull();
  });
  test("black luminance is zero", () => {
    expect(luminance([0, 0, 0])).toBe(0);
  });
  test("white luminance is one", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
  });
  test("black and white contrast reaches 21 to one", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
  });
  test("contrast is symmetrical", () => {
    expect(contrast([12, 55, 80], [244, 240, 230])).toBeCloseTo(contrast([244, 240, 230], [12, 55, 80]));
  });
  test("same colours have a one to one contrast ratio", () => {
    expect(contrast([128, 128, 128], [128, 128, 128])).toBeCloseTo(1);
  });
  test("ordinary text uses the 4.5 ratio", () => {
    expect(minimumRatio(16, 400)).toBe(4.5);
  });
  test("large bold text can use the 3 ratio", () => {
    expect(minimumRatio(19, 700)).toBe(3);
  });
  test("large regular text can use the 3 ratio", () => {
    expect(minimumRatio(24, 400)).toBe(3);
  });
  test("small bold text retains the ordinary minimum", () => {
    expect(minimumRatio(15, 800)).toBe(4.5);
  });
  test("good normal contrast passes", () => {
    expect(contrastProblems([text()], ctx)).toEqual([]);
  });
  test("low contrast fails", () => {
    expect(contrastProblems([text({ foreground: "rgb(200, 200, 200)" })], ctx).map((item) => item.rule)).toContain("text-contrast");
  });
  test("transparent text is not silently accepted", () => {
    expect(contrastProblems([text({ foreground: "rgba(0, 0, 0, 0)" })], ctx).map((item) => item.rule)).toContain("text-colour-unresolved");
  });
  test("hidden text does not produce contrast findings", () => {
    expect(contrastProblems([text({ visible: false, foreground: "rgba(0,0,0,0)" })], ctx)).toEqual([]);
  });
  test("empty text does not produce contrast findings", () => {
    expect(contrastProblems([text({ text: "" })], ctx)).toEqual([]);
  });
});
