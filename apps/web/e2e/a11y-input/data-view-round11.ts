import type { Page } from "@playwright/test";

export type DataViewCode =
  | "table-without-name"
  | "table-without-headings"
  | "empty-table-heading"
  | "invalid-header-scope"
  | "broken-headers-ref"
  | "ambiguous-headers-ref"
  | "caption-hidden"
  | "table-presentation-has-headers"
  | "sorting-without-direction"
  | "invalid-sort-direction"
  | "sort-direction-on-cell"
  | "multiple-sort-primaries"
  | "sort-action-not-keyboard"
  | "selection-without-state"
  | "invalid-selection-state"
  | "invalid-row-index"
  | "invalid-column-index"
  | "invalid-row-count"
  | "invalid-column-count"
  | "grid-without-rows"
  | "grid-row-without-cells"
  | "grid-cell-outside-row"
  | "grid-without-name"
  | "grid-without-keyboard-entry"
  | "listbox-without-name"
  | "listbox-without-options"
  | "option-without-name"
  | "option-outside-listbox"
  | "multiple-selected-options"
  | "invalid-option-state"
  | "slider-without-name"
  | "slider-without-range"
  | "slider-value-outside-range"
  | "slider-without-keyboard-entry"
  | "hidden-active-row"
  | "invalid-cell-span";

export interface DataViewFinding {
  readonly code: DataViewCode;
  readonly path: string;
  readonly detail: string;
}
export interface DataViewReport {
  readonly tables: number;
  readonly grids: number;
  readonly listboxes: number;
  readonly sliders: number;
  readonly findings: readonly DataViewFinding[];
}

/** Accessible data-view structure, sorting, selection and input affordances. */
export async function auditDataViewsRound11(page: Page): Promise<DataViewReport> {
  return page.evaluate(() => {
    type Code = DataViewCode;
    const findings: DataViewFinding[] = [];
    const path = (node: Element): string => {
      if (node.id) return `#${CSS.escape(node.id)}`;
      const parts: string[] = [];
      let current: Element | null = node;
      while (current && parts.length < 5) {
        const parent: Element | null = current.parentElement;
        const siblings = parent ? Array.from(parent.children).filter((item) => item.localName === current!.localName) : [current];
        parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
        current = parent;
      }
      return parts.join(" > ");
    };
    const add = (code: Code, element: Element, detail = ""): void => { findings.push({ code, path: path(element), detail }); };
    const rendered = (node: Element): boolean => {
      if (node.closest("[hidden],[aria-hidden='true'],[inert]")) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const name = (node: Element): string => {
      const label = node.getAttribute("aria-label")?.trim();
      if (label) return label;
      const by = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const linked = by.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
      return linked || node.getAttribute("title")?.trim() || node.textContent?.trim() || "";
    };
    const tabStop = (node: Element): boolean => (node as HTMLElement).tabIndex >= 0 && rendered(node) && !node.matches(":disabled,[aria-disabled='true']");
    const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table")).filter(rendered);
    for (const table of tables) {
      const rows = Array.from(table.rows);
      const presentation = table.getAttribute("role") === "presentation" || table.getAttribute("role") === "none";
      const headingCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("th"));
      const dataCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("td"));
      const caption = table.caption;
      if (!presentation && rows.length > 0 && dataCells.length > 0 && !headingCells.length) add("table-without-headings", table);
      const title = table.getAttribute("aria-label")?.trim() || table.getAttribute("aria-labelledby")?.trim() || caption?.textContent?.trim();
      if (!presentation && !title) add("table-without-name", table);
      if (presentation && headingCells.length) add("table-presentation-has-headers", table);
      if (caption && !rendered(caption) && !table.getAttribute("aria-label") && !table.getAttribute("aria-labelledby")) add("caption-hidden", caption);
      const primarySort: Element[] = [];
      for (const cell of headingCells) {
        if (!name(cell)) add("empty-table-heading", cell);
        const authoredScope = cell.getAttribute("scope");
        if (authoredScope && !["col", "row", "colgroup", "rowgroup", "auto"].includes(authoredScope)) add("invalid-header-scope", cell, authoredScope);
        const direction = cell.getAttribute("aria-sort");
        if (direction && !["ascending", "descending", "none", "other"].includes(direction)) add("invalid-sort-direction", cell, direction);
        if (direction === "ascending" || direction === "descending") primarySort.push(cell);
        if (cell.hasAttribute("data-a11y-sortable")) {
          if (!direction) add("sorting-without-direction", cell);
          if (!Array.from(cell.querySelectorAll("button,[role='button'],[tabindex]" )).some(tabStop) && !tabStop(cell)) add("sort-action-not-keyboard", cell);
        }
      }
      if (primarySort.length > 1 && !table.hasAttribute("data-a11y-multi-sort")) add("multiple-sort-primaries", table, String(primarySort.length));
      for (const cell of dataCells) {
        if (cell.hasAttribute("aria-sort")) add("sort-direction-on-cell", cell);
        if (cell.colSpan < 1 || cell.rowSpan < 0) add("invalid-cell-span", cell);
      }
      const allCells = [...headingCells, ...dataCells];
      const counts = new Map<string, number>();
      for (const node of Array.from(table.querySelectorAll("[id]"))) counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
      for (const cell of allCells) {
        const headers = cell.getAttribute("headers");
        if (!headers) continue;
        for (const id of headers.split(/\s+/).filter(Boolean)) {
          const candidates = Array.from(document.querySelectorAll<HTMLElement>("th[id]")).filter((node) => node.id === id && table.contains(node));
          if (!candidates.length) add("broken-headers-ref", cell, id);
          else if (candidates.length > 1 || (counts.get(id) ?? 0) > 1) add("ambiguous-headers-ref", cell, id);
        }
      }
    }
    const grids = Array.from(document.querySelectorAll<HTMLElement>("[role='grid'],[role='treegrid']")).filter(rendered);
    for (const grid of grids) {
      if (!grid.getAttribute("aria-label")?.trim() && !grid.getAttribute("aria-labelledby")?.trim()) add("grid-without-name", grid);
      const rows = Array.from(grid.querySelectorAll<HTMLElement>("[role='row']")).filter(rendered);
      if (!rows.length) add("grid-without-rows", grid);
      const rowCount = grid.getAttribute("aria-rowcount");
      const colCount = grid.getAttribute("aria-colcount");
      if (rowCount !== null && (!Number.isInteger(Number(rowCount)) || Number(rowCount) < -1 || Number(rowCount) === 0)) add("invalid-row-count", grid, rowCount);
      if (colCount !== null && (!Number.isInteger(Number(colCount)) || Number(colCount) < -1 || Number(colCount) === 0)) add("invalid-column-count", grid, colCount);
      const focusable = tabStop(grid) || Array.from(grid.querySelectorAll<HTMLElement>("[tabindex],button,a[href],input")).some(tabStop);
      if (!focusable) add("grid-without-keyboard-entry", grid);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll<HTMLElement>("[role='gridcell'],[role='columnheader'],[role='rowheader']"));
        if (!cells.length) add("grid-row-without-cells", row);
        if (row.closest("[hidden],[inert],[aria-hidden='true']") && cells.some(tabStop)) add("hidden-active-row", row);
      }
      for (const cell of Array.from(grid.querySelectorAll<HTMLElement>("[role='gridcell'],[role='columnheader'],[role='rowheader']"))) {
        if (!cell.closest("[role='row']")) add("grid-cell-outside-row", cell);
        for (const [attribute, code] of [["aria-rowindex", "invalid-row-index"], ["aria-colindex", "invalid-column-index"]] as const) {
          const raw = cell.getAttribute(attribute);
          if (raw !== null && (!Number.isInteger(Number(raw)) || Number(raw) < 1)) add(code, cell, raw);
        }
        const state = cell.getAttribute("aria-selected");
        if (state !== null && !["true", "false", "undefined"].includes(state)) add("invalid-selection-state", cell, state);
        if (cell.hasAttribute("data-a11y-selectable") && state === null) add("selection-without-state", cell);
      }
    }
    const listboxes = Array.from(document.querySelectorAll<HTMLElement>("[role='listbox']")).filter(rendered);
    for (const listbox of listboxes) {
      if (!listbox.getAttribute("aria-label")?.trim() && !listbox.getAttribute("aria-labelledby")?.trim()) add("listbox-without-name", listbox);
      const options = Array.from(listbox.querySelectorAll<HTMLElement>("[role='option']")).filter(rendered);
      if (!options.length) add("listbox-without-options", listbox);
      const selected = options.filter((node) => node.getAttribute("aria-selected") === "true");
      if (selected.length > 1 && listbox.getAttribute("aria-multiselectable") !== "true") add("multiple-selected-options", listbox);
      for (const option of options) {
        if (!name(option)) add("option-without-name", option);
        const state = option.getAttribute("aria-selected");
        if (state !== null && !["true", "false", "undefined"].includes(state)) add("invalid-option-state", option, state);
      }
    }
    for (const option of Array.from(document.querySelectorAll<HTMLElement>("[role='option']")).filter(rendered)) {
      if (!option.closest("[role='listbox'],[role='combobox']")) add("option-outside-listbox", option);
    }
    const sliders = Array.from(document.querySelectorAll<HTMLElement>("[role='slider'],input[type='range']")).filter(rendered);
    for (const slider of sliders) {
      if (!slider.getAttribute("aria-label")?.trim() && !slider.getAttribute("aria-labelledby")?.trim() && !slider.closest("label") && !slider.getAttribute("title")?.trim()) {
        const html = slider as HTMLInputElement;
        if (!html.labels?.length) add("slider-without-name", slider);
      }
      if (!tabStop(slider)) add("slider-without-keyboard-entry", slider);
      const min = Number(slider.getAttribute("aria-valuemin") ?? slider.getAttribute("min") ?? "0");
      const max = Number(slider.getAttribute("aria-valuemax") ?? slider.getAttribute("max") ?? "100");
      const raw = slider.getAttribute("aria-valuenow") ?? slider.getAttribute("value");
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) add("slider-without-range", slider);
      if (raw !== null && (!Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max)) add("slider-value-outside-range", slider, raw);
    }
    return { tables: tables.length, grids: grids.length, listboxes: listboxes.length, sliders: sliders.length, findings };
  });
}
