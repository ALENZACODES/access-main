import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./p20ae-browser-reflow.ts", import.meta.url), "utf8");
test("P20AE observer exports observation reader", () => assert.match(source, /export async function readObservation/));
test("P20AE observer exports full page audit", () => assert.match(source, /export async function auditPageReflow/));
test("P20AE observer exports opt-in text spacing stress", () => assert.match(source, /export async function applySpacingStress/));
test("P20AE observer exports text spacing cleanup", () => assert.match(source, /export async function clearSpacingStress/));
test("P20AE observer exports control rectangle reader", () => assert.match(source, /export async function readControlRects/));
test("P20AE observer reads bounding client rectangles", () => assert.match(source, /getBoundingClientRect/));
test("P20AE observer reads layout viewport width", () => assert.match(source, /innerWidth/));
test("P20AE observer reads document scroll width", () => assert.match(source, /scrollWidth/));
test("P20AE observer reads nested overflow styles", () => assert.match(source, /overflowX/));
test("P20AE observer captures accessible names", () => assert.match(source, /aria-label/));
test("P20AE observer records disabled state", () => assert.match(source, /aria-disabled/));
test("P20AE observer records sticky and fixed positions", () => {
  assert.match(source, /position === "fixed"/);
  assert.match(source, /position === "sticky"/);
});
test("P20AE observer does not write storage or send requests", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|sendBeacon|fetch\s*\(/);
});
test("P20AE spacing helper applies 1.5 line height", () => assert.match(source, /line-height:1\.5/));
test("P20AE spacing helper applies 2em paragraph gap", () => assert.match(source, /margin-bottom:2em/));
test("P20AE spacing helper applies letter spacing", () => assert.match(source, /letter-spacing:\.12em/));
test("P20AE spacing helper applies word spacing", () => assert.match(source, /word-spacing:\.16em/));
test("P20AE spacing cleanup removes its data attribute", () => assert.match(source, /delete element\.dataset\.p20aeSpacing/));
