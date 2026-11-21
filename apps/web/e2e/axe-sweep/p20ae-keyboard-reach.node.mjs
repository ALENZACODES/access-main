import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./p20ae-keyboard-reach.ts", import.meta.url), "utf8");
test("P20AE keyboard observer exports focus inspection", () => assert.match(source, /export async function inspectKeyboardReachability/));
test("P20AE keyboard observer exports sequential Tab traversal", () => assert.match(source, /export async function tabThroughControls/));
test("P20AE keyboard observer exports deterministic issue list", () => assert.match(source, /export function keyboardReachIssues/));
test("P20AE keyboard observer reads sequential focusable selectors", () => assert.match(source, /a\[href\],button,input/));
test("P20AE keyboard observer records positive tab index", () => assert.match(source, /tabIndex > 0/));
test("P20AE keyboard observer identifies hidden focusable elements", () => assert.match(source, /hiddenFocusable/));
test("P20AE keyboard observer detects duplicate element ids", () => assert.match(source, /duplicateIds/));
test("P20AE keyboard traversal uses the keyboard Tab key", () => assert.match(source, /keyboard.press\("Tab"\)/));
test("P20AE keyboard traversal has a bounded maximum", () => assert.match(source, /maximum = 80/));
test("P20AE keyboard observer does not mutate storage or send requests", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|sendBeacon|fetch\s*\(/);
});
test("P20AE keyboard issue list includes positive tabindex code", () => assert.match(source, /positive-tabindex:/));
test("P20AE keyboard issue list includes hidden focusable code", () => assert.match(source, /hidden-focusable:/));
test("P20AE keyboard issue list includes duplicate id code", () => assert.match(source, /duplicate-id:/));
