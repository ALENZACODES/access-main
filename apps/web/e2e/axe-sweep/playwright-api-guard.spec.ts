import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  auditPlaywrightSpecs,
  incompatiblePlaywrightCalls,
  playwrightSpecPaths,
} from "./playwright-api-guard";

const E2E_ROOT = resolve(import.meta.dirname, "..");

test("all Playwright specs use supported collection APIs", () => {
  const files = playwrightSpecPaths(E2E_ROOT);
  expect(files.length).toBeGreaterThan(0);
  expect(auditPlaywrightSpecs(E2E_ROOT)).toEqual([]);
});

test("runner guard detects each and conditional Vitest methods", () => {
  const code = [
    "test.each([1, 2])('name', () => {});",
    "test.skipIf(true)('skip', () => {});",
    "test.runIf(true)('run', () => {});",
    "test.concurrent('parallel', () => {});",
    "test.fails('expected failure', () => {});",
  ].join("\n");
  expect(incompatiblePlaywrightCalls(code, "sample.spec.ts").map((item) => item.call))
    .toEqual(["test.each", "test.skipIf", "test.runIf", "test.concurrent", "test.fails"]);
});

test("runner guard ignores comments and strings and accepts Playwright loops", () => {
  const code = [
    "// test.each([1])('comment', () => {});",
    "const note = \"test.each is not available\";",
    "for (const value of [1, 2]) test(`value ${value}`, () => {});",
    "test.describe('suite', () => { test('case', () => {}); });",
  ].join("\n");
  expect(incompatiblePlaywrightCalls(code, "sample.spec.ts")).toEqual([]);
});

test("runner guard reports source coordinates", () => {
  const found = incompatiblePlaywrightCalls("\n\ntest.each([])('case', () => {});", "sample.spec.ts");
  expect(found).toEqual([{
    file: "sample.spec.ts",
    line: 3,
    column: 1,
    call: "test.each",
  }]);
});
