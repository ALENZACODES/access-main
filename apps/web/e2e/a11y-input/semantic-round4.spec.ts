import { expect, test } from "@playwright/test";

import { auditRoleNames, auditSemantics } from "./semantic-round4";
import { auditContentIntegrity } from "./content-round4";

const template = `<!doctype html>
<html lang="en"><head><title>Input audit</title></head><body>
<main id="content"><h1>Input audit</h1>
<label for="query">Search</label><input id="query" />
<button id="save">Save</button>
<a id="more" href="#content">Details</a>
<div id="hint">More information</div>
<div id="widget" role="switch" tabindex="0" aria-checked="false" aria-label="Notifications" style="min-width:44px;min-height:44px;display:inline-block"></div>
<button id="expand" aria-expanded="false" aria-controls="panel">Open panel</button>
<div id="panel">Panel</div>
<div id="status" role="status" aria-live="polite">Ready</div>
<img id="illustration" alt="Route diagram" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" />
</main></body></html>`;

const codes = (issues: readonly { code: string }[]): string[] => issues.map((issue) => issue.code);

async function setup(page: import("@playwright/test").Page): Promise<void> {
  await page.setContent(template);
}

test.describe("P16D semantics: deterministic failure and passing cases", () => {
  test("valid native controls and stateful widgets pass", async ({ page }) => {
    await setup(page);
    expect(await auditSemantics(page)).toEqual([]);
    expect(await auditRoleNames(page)).toEqual([]);
  });

  test("unresolved aria-labelledby reference fails", async ({ page }) => {
    await setup(page);
    await page.locator("#save").evaluate((node) => node.setAttribute("aria-labelledby", "absent"));
    expect(codes(await auditSemantics(page))).toContain("missing-idref");
  });

  test("unresolved aria-describedby reference fails", async ({ page }) => {
    await setup(page);
    await page.locator("#query").evaluate((node) => node.setAttribute("aria-describedby", "missing-help"));
    expect(codes(await auditSemantics(page))).toContain("missing-idref");
  });

  test("empty aria-controls reference fails", async ({ page }) => {
    await setup(page);
    await page.locator("#expand").evaluate((node) => node.setAttribute("aria-controls", " "));
    expect(codes(await auditSemantics(page))).toContain("empty-idref");
  });

  test("unresolved error message reference fails", async ({ page }) => {
    await setup(page);
    await page.locator("#query").evaluate((node) => node.setAttribute("aria-errormessage", "missing-error"));
    expect(codes(await auditSemantics(page))).toContain("missing-idref");
  });

  test("valid labelled-by reference passes", async ({ page }) => {
    await setup(page);
    await page.locator("#save").evaluate((node) => node.setAttribute("aria-labelledby", "hint"));
    expect(codes(await auditSemantics(page))).not.toContain("missing-idref");
  });

  test("switch without checked state fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.removeAttribute("aria-checked"));
    expect(codes(await auditSemantics(page))).toContain("missing-widget-state");
  });

  test("switch with illegal state fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("aria-checked", "unknown"));
    expect(codes(await auditSemantics(page))).toContain("invalid-widget-state");
  });

  test("unnamed custom switch fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.removeAttribute("aria-label"));
    expect(codes(await auditSemantics(page))).toContain("unnamed-widget");
  });

  test("custom switch removed from Tab order fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("tabindex", "-1"));
    expect(codes(await auditSemantics(page))).toContain("unreachable-custom-control");
  });

  test("positive tabindex fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("tabindex", "4"));
    expect(codes(await auditSemantics(page))).toContain("positive-tabindex");
  });

  test("malformed tabindex fails", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("tabindex", "not-a-number"));
    expect(codes(await auditSemantics(page))).toContain("invalid-tabindex");
  });

  test("invalid disclosure state fails", async ({ page }) => {
    await setup(page);
    await page.locator("#expand").evaluate((node) => node.setAttribute("aria-expanded", "sometimes"));
    expect(codes(await auditSemantics(page))).toContain("invalid-expanded-state");
  });

  test("unnamed disclosure fails", async ({ page }) => {
    await setup(page);
    await page.locator("#expand").evaluate((node) => { node.textContent = ""; });
    expect(codes(await auditSemantics(page))).toContain("unnamed-expander");
  });

  test("invalid aria-current value fails", async ({ page }) => {
    await setup(page);
    await page.locator("#more").evaluate((node) => node.setAttribute("aria-current", "unknown"));
    expect(codes(await auditSemantics(page))).toContain("invalid-current-state");
  });

  test("valid aria-current page passes", async ({ page }) => {
    await setup(page);
    await page.locator("#more").evaluate((node) => node.setAttribute("aria-current", "page"));
    expect(codes(await auditSemantics(page))).not.toContain("invalid-current-state");
  });

  test("placeholder link fails", async ({ page }) => {
    await setup(page);
    await page.locator("#more").evaluate((node) => node.setAttribute("href", "#"));
    expect(codes(await auditSemantics(page))).toContain("placeholder-link");
  });

  test("missing fragment target fails", async ({ page }) => {
    await setup(page);
    await page.locator("#more").evaluate((node) => node.setAttribute("href", "#nonexistent"));
    expect(codes(await auditSemantics(page))).toContain("missing-fragment-target");
  });

  test("unnamed button fails", async ({ page }) => {
    await setup(page);
    await page.locator("#save").evaluate((node) => { node.textContent = ""; });
    expect(codes(await auditSemantics(page))).toContain("unnamed-button");
  });

  test("unnamed link fails", async ({ page }) => {
    await setup(page);
    await page.locator("#more").evaluate((node) => { node.textContent = ""; });
    expect(codes(await auditSemantics(page))).toContain("unnamed-link");
  });

  test("invalid aria-live value fails", async ({ page }) => {
    await setup(page);
    await page.locator("#status").evaluate((node) => node.setAttribute("aria-live", "urgent"));
    expect(codes(await auditSemantics(page))).toContain("invalid-live-value");
  });

  test("invalid aria-atomic value fails", async ({ page }) => {
    await setup(page);
    await page.locator("#status").evaluate((node) => node.setAttribute("aria-atomic", "sometimes"));
    expect(codes(await auditSemantics(page))).toContain("invalid-live-atomic");
  });

  test("an invisible invalid widget is not treated as operable", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("aria-checked", "bad"));
    await page.locator("#widget").evaluate((node) => node.setAttribute("hidden", ""));
    expect(codes(await auditSemantics(page))).not.toContain("invalid-widget-state");
  });

  test("several failures are reported together", async ({ page }) => {
    await setup(page);
    await page.locator("#widget").evaluate((node) => node.setAttribute("tabindex", "6"));
    await page.locator("#expand").evaluate((node) => node.setAttribute("aria-expanded", "maybe"));
    await page.locator("#more").evaluate((node) => node.setAttribute("href", "#lost"));
    const result = codes(await auditSemantics(page));
    expect(result).toContain("positive-tabindex");
    expect(result).toContain("invalid-expanded-state");
    expect(result).toContain("missing-fragment-target");
  });
});

test.describe("P16D content and evidence provenance", () => {
  test("valid page structure and accessible image pass", async ({ page }) => {
    await setup(page);
    expect(await auditContentIntegrity(page)).toEqual([]);
  });

  test("missing main landmark fails", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => { node.outerHTML = node.innerHTML; });
    expect(codes(await auditContentIntegrity(page))).toContain("main-landmark-count");
  });

  test("duplicate main landmark fails", async ({ page }) => {
    await setup(page);
    await page.locator("body").evaluate((node) => node.insertAdjacentHTML("beforeend", "<main></main>"));
    expect(codes(await auditContentIntegrity(page))).toContain("main-landmark-count");
  });

  test("duplicate top-level headings fail", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => node.insertAdjacentHTML("beforeend", "<h1>Another</h1>"));
    expect(codes(await auditContentIntegrity(page))).toContain("primary-heading-count");
  });

  test("empty document title fails", async ({ page }) => {
    await setup(page);
    await page.evaluate(() => { document.title = ""; });
    expect(codes(await auditContentIntegrity(page))).toContain("empty-document-title");
  });

  test("image without alt fails", async ({ page }) => {
    await setup(page);
    await page.locator("#illustration").evaluate((node) => node.removeAttribute("alt"));
    expect(codes(await auditContentIntegrity(page))).toContain("image-no-alt");
  });

  test("decorative image can have an empty alt", async ({ page }) => {
    await setup(page);
    await page.locator("#illustration").evaluate((node) => node.setAttribute("alt", ""));
    expect(codes(await auditContentIntegrity(page))).not.toContain("image-no-alt");
  });

  test("source, licence and collection date are required", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<div id="evidence" data-a11y-evidence>Entry</div>`);
    });
    const result = codes(await auditContentIntegrity(page));
    expect(result).toContain("missing-source");
    expect(result).toContain("missing-licence");
    expect(result).toContain("missing-date");
  });

  test("complete open-licence metadata passes", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<div id="evidence" data-a11y-evidence
        data-source="City open data" data-licence="CC-BY-4.0"
        data-date="2026-06-15" data-accessibility-status="UNKNOWN">Unknown</div>`);
    });
    expect(await auditContentIntegrity(page)).toEqual([]);
  });

  test("invalid leap-day date fails", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<div data-a11y-evidence
        data-source="Source" data-licence="CC0-1.0" data-date="2025-02-29">Entry</div>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("invalid-date");
  });

  test("unknown state must not be promoted", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-unknown
        data-accessibility-status="REPORTED">Entry</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("unknown-state-changed");
  });

  test("inferred accessibility is rejected", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-unknown
        data-accessibility-status="UNKNOWN" data-inferred-accessibility="true">Unknown</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("inferred-accessibility");
  });

  test("unrecognised licence fails instead of silently passing", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-evidence
        data-source="Source" data-date="2026-01-01" data-licence="restricted">Entry</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("unrecognised-open-licence");
  });

  test("unknown custom evidence status fails", async ({ page }) => {
    await setup(page);
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-evidence
        data-source="Source" data-date="2026-01-01" data-licence="CC0"
        data-accessibility-status="ASSUMED">Entry</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("invalid-evidence-state");
  });

  test("French narrow spacing is required before punctuation", async ({ page }) => {
    await setup(page);
    await page.locator("html").evaluate((node) => node.setAttribute("lang", "fr"));
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-localized-copy>Prêt !</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("french-narrow-space");
  });

  test("French straight apostrophe is rejected", async ({ page }) => {
    await setup(page);
    await page.locator("html").evaluate((node) => node.setAttribute("lang", "fr"));
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-localized-copy>L'App</p>`);
    });
    expect(codes(await auditContentIntegrity(page))).toContain("french-straight-apostrophe");
  });

  test("French correct punctuation passes", async ({ page }) => {
    await setup(page);
    await page.locator("html").evaluate((node) => node.setAttribute("lang", "fr"));
    await page.locator("main").evaluate((node) => {
      node.insertAdjacentHTML("beforeend", `<p data-a11y-localized-copy>L’App\u00a0: «\u202fPrêt\u202f»\u202f!</p>`);
    });
    expect(await auditContentIntegrity(page)).toEqual([]);
  });
});
