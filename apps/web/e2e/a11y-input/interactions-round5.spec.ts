import { expect, test } from "@playwright/test";

import { auditSafeDisclosures } from "./composites-round5";
import { exerciseSafeAnnouncement } from "./announcements-round5";
import { auditOptInToggleFocus } from "./operability-round5";
import { exerciseSafeFormValidation } from "./forms-round5";
import { collectKeyboardPath, auditKeyboardPath, auditReverseFocus } from "./focus-path-round5";
import { configuredResilienceRoutes, snapshotOfflineShell } from "./offline-resilience-round5";

const layout = `<!doctype html><html lang="en"><head><title>Input lab</title></head>
<body><main id="main"><h1>Input lab</h1>`;
const close = `</main></body></html>`;

test("reversible disclosure changes aria-expanded twice with Enter", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="details" aria-controls="panel" aria-expanded="false"
      data-a11y-reversible="true">Details</button>
    <section id="panel" hidden>Additional details</section>
    <script>
      const trigger = document.getElementById('details');
      const panel = document.getElementById('panel');
      trigger.addEventListener('click', () => {
        const next = trigger.getAttribute('aria-expanded') !== 'true';
        trigger.setAttribute('aria-expanded', String(next));
        panel.hidden = !next;
      });
    </script>${close}`);
  expect(await auditSafeDisclosures(page)).toEqual([]);
  await expect(page.locator("#details")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#panel")).toBeHidden();
});

test("disclosure that never updates its expanded state fails", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="details" aria-controls="panel" aria-expanded="false"
      data-a11y-reversible="true">Details</button><section id="panel" hidden>Details</section>
    ${close}`);
  expect((await auditSafeDisclosures(page)).map((issue) => issue.code)).toContain(
    "disclosure-enter-no-change",
  );
});

test("live announcement changes text and preserves focused button", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="refresh" data-a11y-announcement-trigger="status">Refresh</button>
    <p role="status" id="status">Initial</p>
    <script>
      document.getElementById('refresh').addEventListener('click', () => {
        document.getElementById('status').textContent = 'Updated';
      });
    </script>${close}`);
  expect(await exerciseSafeAnnouncement(page)).toEqual([]);
  await expect(page.locator("#status")).toHaveText("Updated");
  await expect(page.locator("#refresh")).toBeFocused();
});

test("announcement trigger without a target reports an issue", async ({ page }) => {
  await page.setContent(`${layout}
    <button data-a11y-announcement-trigger="missing">Refresh</button>
    ${close}`);
  expect((await exerciseSafeAnnouncement(page)).map((issue) => issue.code)).toContain(
    "announcement-target-count",
  );
});

test("reversible switch retains keyboard focus after Space", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="switch" type="button" role="switch" aria-checked="false"
      data-a11y-toggle-test="reversible">Mode</button>
    <script>
      const switchButton = document.getElementById('switch');
      switchButton.addEventListener('click', () => {
        const next = switchButton.getAttribute('aria-checked') !== 'true';
        switchButton.setAttribute('aria-checked', String(next));
      });
    </script>${close}`);
  expect(await auditOptInToggleFocus(page)).toEqual([]);
  await expect(page.locator("#switch")).toHaveAttribute("aria-checked", "false");
});

test("reversible switch that removes itself on Space loses focus", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="switch" data-a11y-toggle-test="reversible">Mode</button>
    <script>
      document.getElementById('switch').addEventListener('click', (event) => {
        event.currentTarget.remove();
      });
    </script>${close}`);
  expect((await auditOptInToggleFocus(page)).map((issue) => issue.code)).toContain(
    "toggle-focus-lost",
  );
});

test("safe form activation does not require user-supplied values", async ({ page }) => {
  await page.setContent(`${layout}
    <form id="form" data-a11y-test-submit="safe">
      <label for="reference">Reference</label><input id="reference" aria-invalid="false">
      <button type="submit">Review</button>
    </form>
    <script>
      document.getElementById('form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.getElementById('reference');
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'error');
        const message = document.createElement('p');
        message.id = 'error';
        message.textContent = 'Reference is needed';
        event.currentTarget.append(message);
      });
    </script>${close}`);
  const observations = await exerciseSafeFormValidation(page);
  expect(observations).toHaveLength(1);
  expect(observations[0]?.errorReferences).toEqual(["error"]);
  expect(observations[0]?.after).toContain("Reference is needed");
});

test("safe form lacking error association is observed as missing", async ({ page }) => {
  await page.setContent(`${layout}
    <form data-a11y-test-submit="safe"><button type="submit">Review</button></form>
    <script>
      document.querySelector('form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.createElement('input');
        input.setAttribute('aria-invalid', 'true');
        event.currentTarget.append(input);
      });
    </script>${close}`);
  const observations = await exerciseSafeFormValidation(page);
  expect(observations).toHaveLength(1);
  expect(observations[0]?.errorReferences).toEqual([""]);
});

test("keyboard focus path observes three distinct controls", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="first">First</button>
    <button id="second">Second</button>
    <button id="third">Third</button>
    ${close}`);
  const steps = await collectKeyboardPath(page, 12);
  expect(steps.slice(0, 3).map((step) => step.id)).toEqual([
    "first", "second", "third",
  ]);
  expect(await auditKeyboardPath(page)).toEqual([]);
  expect(await auditReverseFocus(page)).toEqual([]);
});

test("keyboard audit rejects a page with no controls", async ({ page }) => {
  await page.setContent(`${layout}<p>No actions</p>${close}`);
  expect((await auditKeyboardPath(page)).map((issue) => issue.code)).toContain(
    "focus-path-empty",
  );
});

test("positive tabindex is detected on actual Tab traversal", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="late">Normal</button>
    <button id="early" tabindex="2">Early</button>
    ${close}`);
  const findings = await auditKeyboardPath(page);
  expect(findings.map((item) => item.code)).toContain("focus-path-positive-tabindex");
});

test("focus walk limit rejects out-of-range counts", async ({ page }) => {
  await page.setContent(`${layout}<button>Start</button>${close}`);
  await expect(collectKeyboardPath(page, 0)).rejects.toThrow(/limit/);
  await expect(collectKeyboardPath(page, 501)).rejects.toThrow(/limit/);
  await expect(collectKeyboardPath(page, 2.5)).rejects.toThrow(/limit/);
});

test("offline snapshot reflects authored document landmarks", async ({ page }) => {
  await page.setContent(`${layout}
    <button id="refresh">Refresh</button>
    <p data-accessibility-status="UNKNOWN">Unknown</p>
    ${close}`);
  const snapshot = await snapshotOfflineShell(page);
  expect(snapshot.title).toBe("Input lab");
  expect(snapshot.language).toBe("en");
  expect(snapshot.mainCount).toBe(1);
  expect(snapshot.headingCount).toBe(1);
  expect(snapshot.focusableCount).toBe(1);
  expect(snapshot.status).toBe("UNKNOWN");
});

test("offline paths default to opt-in only", async () => {
  const previous = process.env.A11Y_RESILIENCE_ROUTES;
  try {
    delete process.env.A11Y_RESILIENCE_ROUTES;
    expect(configuredResilienceRoutes()).toEqual([]);
    process.env.A11Y_RESILIENCE_ROUTES = "/en,/fr,/en";
    expect(configuredResilienceRoutes()).toEqual(["/en", "/fr"]);
    process.env.A11Y_RESILIENCE_ROUTES = "//external";
    expect(() => configuredResilienceRoutes()).toThrow();
    process.env.A11Y_RESILIENCE_ROUTES = "/../../../bad";
    expect(() => configuredResilienceRoutes()).toThrow();
  } finally {
    if (previous === undefined) delete process.env.A11Y_RESILIENCE_ROUTES;
    else process.env.A11Y_RESILIENCE_ROUTES = previous;
  }
});
