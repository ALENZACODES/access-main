import { expect, type Page } from "@playwright/test";

export interface DataDisplayFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}

/** Tables, map alternatives and results summaries retain readable structure. */
export async function auditDataDisplays(page: Page): Promise<DataDisplayFinding[]> {
  return page.evaluate(() => {
    const issues: DataDisplayFinding[] = [];
    const report = (code: string, element: Element, detail: string): void => {
      issues.push({ code, target: element.id || element.localName, detail });
    };
    const displayed = (element: Element): boolean => {
      if (element.closest("[hidden],[inert],[aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table"))) {
      if (!displayed(table) || table.getAttribute("role") === "presentation" ||
          table.getAttribute("role") === "none") continue;
      const cells = Array.from(table.querySelectorAll("td"));
      if (!cells.length) continue;
      const headings = Array.from(table.querySelectorAll("th"));
      if (!headings.length) report("table-no-headings", table, "Data cells have no associated headers");
      const tableName = table.querySelector("caption")?.textContent?.trim() ||
        table.getAttribute("aria-label")?.trim() ||
        table.getAttribute("aria-labelledby")?.trim();
      if (!tableName) report("table-no-name", table, "Data table has no caption or accessible name");
      const headerIds = new Set(headings.map((th) => th.id).filter(Boolean));
      for (const header of headings) {
        const scope = header.getAttribute("scope");
        if (scope && !["row", "col", "rowgroup", "colgroup"].includes(scope)) {
          report("table-invalid-scope", header, scope);
        }
        if (!header.textContent?.trim() && !header.getAttribute("aria-label")?.trim()) {
          report("table-empty-heading", header, "Header has no name");
        }
      }
      for (const cell of cells) {
        const refs = cell.getAttribute("headers");
        if (!refs) continue;
        for (const id of refs.split(/\s+/).filter(Boolean)) {
          if (!headerIds.has(id)) report("table-broken-header", cell, id);
        }
      }
    }
    for (const grid of Array.from(document.querySelectorAll<HTMLElement>(
      "[role='grid'],[role='treegrid']",
    ))) {
      if (!displayed(grid)) continue;
      if (!grid.getAttribute("aria-label")?.trim() && !grid.getAttribute("aria-labelledby")) {
        report("grid-name", grid, "Interactive grid has no name");
      }
      const rows = grid.querySelectorAll("[role='row']");
      if (!rows.length) report("grid-rows", grid, "Grid has no rows");
      for (const row of Array.from(rows)) {
        if (!row.querySelector("[role='gridcell'],[role='columnheader'],[role='rowheader']")) {
          report("grid-row-cells", row, "Row contains no cells");
        }
      }
      for (const cell of Array.from(grid.querySelectorAll<HTMLElement>("[role='gridcell']"))) {
        if (cell.getAttribute("aria-selected") &&
            !["true", "false"].includes(cell.getAttribute("aria-selected") || "")) {
          report("grid-cell-selection", cell, "Invalid selection state");
        }
      }
    }
    for (const map of Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-map]"))) {
      if (!displayed(map)) continue;
      const referenceId = map.getAttribute("data-a11y-list-alternative") || "";
      if (!referenceId) {
        report("map-no-list", map, "Map must reference a non-visual list alternative");
        continue;
      }
      const list = document.getElementById(referenceId);
      if (!list) {
        report("map-list-missing", map, referenceId);
        continue;
      }
      if (!list.matches("ul,ol,[role='list'],table")) {
        report("map-list-type", list, "Alternative is not a semantic list or table");
      }
      if (!displayed(list)) report("map-list-hidden", list, "Alternative cannot be hidden");
      if (!list.textContent?.trim()) report("map-list-empty", list, "Alternative contains no items");
    }
    for (const result of Array.from(document.querySelectorAll<HTMLElement>(
      "[data-a11y-results-count]",
    ))) {
      if (!displayed(result)) continue;
      const count = result.getAttribute("data-a11y-results-count") || "";
      if (!/^(0|[1-9]\d*)$/.test(count)) report("result-count-invalid", result, count);
      if (!result.textContent?.trim() && !result.getAttribute("aria-label")?.trim()) {
        report("result-count-not-announced", result, "Result summary has no accessible text");
      }
      if (result.hasAttribute("data-a11y-changes-dynamically") &&
          !result.closest("[aria-live],[role='status']") && !result.hasAttribute("aria-live")) {
        report("dynamic-results-not-live", result, "Changing results need a polite announcement");
      }
    }
    for (const evidence of Array.from(document.querySelectorAll<HTMLElement>("[data-a11y-evidence]"))) {
      const source = evidence.getAttribute("data-source")?.trim();
      const licence = evidence.getAttribute("data-licence")?.trim();
      const date = evidence.getAttribute("data-date")?.trim();
      if (!source) report("evidence-source", evidence, "Missing source");
      if (!licence) report("evidence-licence", evidence, "Missing open licence");
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) report("evidence-date", evidence, "Missing ISO collection date");
      const state = evidence.getAttribute("data-accessibility-status");
      if (state && !["UNKNOWN", "REPORTED", "OBSERVED", "NOT_APPLICABLE"].includes(state)) {
        report("evidence-state", evidence, "Unsupported accessibility state");
      }
      if (evidence.hasAttribute("data-a11y-unknown") && state !== "UNKNOWN") {
        report("evidence-unknown-changed", evidence, "Unspecified status must remain UNKNOWN");
      }
    }
    return issues;
  });
}

export async function assertDataDisplays(page: Page): Promise<void> {
  expect(await auditDataDisplays(page), "Tables, map alternatives, and metadata").toEqual([]);
}
