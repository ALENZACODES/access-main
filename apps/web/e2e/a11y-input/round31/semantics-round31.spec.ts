import { expect, test } from "@playwright/test";
import { inspectBrowserSemantics, inspectLiveRegions, inspectSwitchAlternatives } from "./browser";
import { auditSemanticSnapshot, summarizeSemanticIssues } from "./contracts.mjs";
import { auditLiveRegions } from "./announcements.mjs";
import { auditSwitchPath } from "./focus.mjs";

const documentFor = (content: string, language = "en") => `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><title>Accessibility fixture</title>
<style>body{font:16px system-ui}button,input,a{min-height:44px;min-width:44px}
:focus-visible{outline:3px solid black;outline-offset:3px}</style></head>
<body><main><h1>Fixture heading</h1>${content}</main></body></html>`;

async function inspect(page: import("@playwright/test").Page, markup: string, language = "en") {
  await page.setContent(documentFor(markup, language));
  return auditSemanticSnapshot(await inspectBrowserSemantics(page));
}
const codes = (issues: readonly { code: string }[]) => issues.map((item) => item.code);

test.describe("P16 Round 31: semantic browser fixture audit", () => {
  test("semantic heading, landmark and button have no findings", async ({ page }) => {
    const issues = await inspect(page, '<button id="run">Run</button>');
    expect(issues).toEqual([]);
  });

  test("French document language is captured without changing copy", async ({ page }) => {
    await page.setContent(documentFor('<button id="ouvrir">Ouvrir</button>', "fr"));
    const snapshot = await inspectBrowserSemantics(page);
    expect(snapshot.language).toBe("fr");
    expect(snapshot.nodes.some((item) => item.role === "main")).toBe(true);
  });

  test("hidden sequential control is reported", async ({ page }) => {
    const issues = await inspect(page, '<button id="hidden" style="display:none">Hidden</button>');
    expect(codes(issues)).toContain("node.hidden-focusable");
  });

  test("inert sequential control is reported", async ({ page }) => {
    const issues = await inspect(page, '<div inert><button id="blocked">Blocked</button></div>');
    expect(codes(issues)).toContain("node.inert-focusable");
  });

  test("aria-hidden focusable descendant is reported", async ({ page }) => {
    const issues = await inspect(page, '<div aria-hidden="true"><button id="quiet">Quiet</button></div>');
    expect(codes(issues)).toContain("node.aria-hidden-focusable");
  });

  test("duplicate IDs are never silently accepted", async ({ page }) => {
    const issues = await inspect(page, '<button id="duplicate">One</button><button id="duplicate">Two</button>');
    expect(codes(issues)).toContain("node.duplicate-id");
  });

  test("missing ARIA label reference is reported", async ({ page }) => {
    const issues = await inspect(page, '<button aria-labelledby="missing" id="trigger"></button>');
    expect(codes(issues)).toContain("node.dangling-reference");
  });

  test("valid ARIA label reference resolves", async ({ page }) => {
    const issues = await inspect(page, '<span id="label">Run check</span><button id="trigger" aria-labelledby="label"></button>');
    expect(codes(issues)).not.toContain("node.dangling-reference");
    expect(codes(issues)).not.toContain("node.unnamed-control");
  });

  test("empty button name is reported", async ({ page }) => {
    const issues = await inspect(page, '<button id="unnamed"></button>');
    expect(codes(issues)).toContain("node.unnamed-control");
  });

  test("invalid checkbox state is reported", async ({ page }) => {
    const issues = await inspect(page, '<button id="choice" role="checkbox" aria-checked="perhaps">Select</button>');
    expect(codes(issues)).toContain("node.checked");
  });

  test("invalid disclosure expanded state is reported", async ({ page }) => {
    const issues = await inspect(page, '<button id="details" aria-expanded="maybe">Details</button>');
    expect(codes(issues)).toContain("node.expanded");
  });

  test("positive sequential tabindex is reported", async ({ page }) => {
    const issues = await inspect(page, '<button id="priority" tabindex="4">Priority</button>');
    expect(codes(issues)).toContain("node.positive-tabindex");
  });

  test("multiple main landmarks are detected", async ({ page }) => {
    const issues = await inspect(page, '<main><h2>Second main</h2></main>');
    expect(codes(issues)).toContain("document.main-count");
  });

  test("shadow root ID scope differs from document ID scope", async ({ page }) => {
    await page.setContent(documentFor('<div id="host"></div><button id="duplicate">Outside</button>'));
    await page.locator("#host").evaluate((element) => {
      const root = element.attachShadow({ mode: "open" });
      const button = document.createElement("button");
      button.id = "duplicate";
      button.textContent = "Inside";
      root.appendChild(button);
    });
    const snapshot = await inspectBrowserSemantics(page);
    expect(snapshot.nodes.filter((item) => item.id === "duplicate")).toHaveLength(2);
    expect(codes(auditSemanticSnapshot(snapshot))).not.toContain("node.duplicate-id");
  });

  test("shadow reference to outer document is unresolved", async ({ page }) => {
    await page.setContent(documentFor('<span id="outer-label">Label</span><div id="host"></div>'));
    await page.locator("#host").evaluate((element) => {
      const root = element.attachShadow({ mode: "open" });
      const button = document.createElement("button");
      button.id = "inner";
      button.setAttribute("aria-labelledby", "outer-label");
      root.appendChild(button);
    });
    expect(codes(auditSemanticSnapshot(await inspectBrowserSemantics(page))))
      .toContain("node.dangling-reference");
  });

  test("native live status is visible as polite region", async ({ page }) => {
    await page.setContent(documentFor('<div role="status" id="status">Loading</div>'));
    const regions = await inspectLiveRegions(page);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.live).toBe("polite");
    expect(auditLiveRegions(regions)).toEqual([]);
  });

  test("silent explicit status is reported", async ({ page }) => {
    await page.setContent(documentFor('<div role="status" aria-live="off" id="status">Loading</div>'));
    expect(codes(auditLiveRegions(await inspectLiveRegions(page)))).toContain("live.silent-status");
  });

  test("switch scanning alternatives expose named actions", async ({ page }) => {
    await page.setContent(documentFor('<button id="action" data-a11y-drag-required data-a11y-alternative="button">Activate</button>'));
    expect(auditSwitchPath(await inspectSwitchAlternatives(page))).toEqual([]);
  });

  test("switch scanning reports a drag without another input path", async ({ page }) => {
    await page.setContent(documentFor('<button id="drag" data-a11y-drag-required>Drag</button>'));
    expect(codes(auditSwitchPath(await inspectSwitchAlternatives(page)))).toContain("switch.no-drag-alternative");
  });

  test("diagnostic summary cannot expose source copy", async ({ page }) => {
    const issues = await inspect(page, '<button id="private-copy"></button>');
    const result = summarizeSemanticIssues(issues);
    expect(JSON.stringify(result)).not.toContain("private-copy");
    expect(result.some((entry: { code: string }) => entry.code === "node.unnamed-control")).toBe(true);
  });
});
