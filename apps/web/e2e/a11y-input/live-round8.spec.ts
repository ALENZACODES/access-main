import { expect, test } from "@playwright/test";

import { routes, visit } from "./helpers";
import { auditDialogRoute } from "./dialog-path-round8";
import { auditEvidenceRoute } from "./evidence-round8";
import { auditFormRoute } from "./form-path-round8";
import {
  assertFocusDoesNotNavigate,
  inspectKeyboardCandidates,
  scanKeyboardRoute,
} from "./keyboard-path-round8";
import {
  activateSkipLink,
  auditRouteContext,
  exerciseLanguageRoundTrip,
} from "./route-state-round8";

/**
 * The existing web Playwright config discovers every *.spec.ts under e2e.
 * This suite uses the current route table rather than a duplicated list.
 * Static checks do not trigger user actions or mutate personal information.
 */
for (const route of routes()) {
  test.describe(`Round 8 live input contract: ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await visit(page, route, "en");
    });

    test("static keyboard, dialog, form, provenance and route contracts", async ({ page }) => {
      expect(await auditRouteContext(page), `Route context: ${route}`).toEqual([]);
      expect(await inspectKeyboardCandidates(page), `Keyboard candidates: ${route}`).toEqual([]);
      expect(await auditDialogRoute(page), `Dialogs: ${route}`).toEqual([]);
      expect(await auditFormRoute(page), `Form semantics: ${route}`).toEqual([]);
      expect(await auditEvidenceRoute(page), `Evidence semantics: ${route}`).toEqual([]);
    });
  });
}

test("Round 8: home switch-style Tab scan reaches labelled controls", async ({ page }) => {
  await visit(page, "/", "en");
  const sequence = await scanKeyboardRoute(page, 120);
  expect(sequence.failures).toEqual([]);
  expect(sequence.steps.length).toBeGreaterThan(1);
  expect(sequence.terminated).toBe(true);
});

test("Round 8: navigation focus alone leaves the route unchanged", async ({ page }) => {
  await visit(page, "/", "en");
  await assertFocusDoesNotNavigate(page, "nav .nav-link[href='/data-status']");
  await expect(page).toHaveURL(/\/$/);
});

test("Round 8: skip navigation reaches the main document region", async ({ page }) => {
  await visit(page, "/", "en");
  const result = await activateSkipLink(page);
  expect(result.focusInMain).toBe(true);
  expect(result.headingVisible).toBe(true);
  expect(result.skipTargetPresent).toBe(true);
});

test("Round 8: language toggle remains keyboard operable in both languages", async ({ page }) => {
  await visit(page, "/", "en");
  await exerciseLanguageRoundTrip(page);
  expect(await auditRouteContext(page)).toEqual([]);
});
