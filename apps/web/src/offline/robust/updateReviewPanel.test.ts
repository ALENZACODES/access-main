// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DashboardModel, type DashboardState } from "./offlineDashboard";
import { type RegionManifest, type StorageEstimate } from "./regionDownload";
import { type RegionInventory } from "./regionInventory";
import { mountOfflineUpdateReview } from "./updateReviewPanel";
import { UPDATE_COPY } from "./updateCopy";

const provenance = {
  source: "Ontario open data",
  licence: "CC BY 4.0",
  date: "2026-03-02",
};
const manifest: RegionManifest = {
  regionId: "central",
  cells: [
    { id: "alpha", bytes: 10, provenance },
    { id: "beta", bytes: 20, provenance },
    { id: "gamma", bytes: 30, provenance },
  ],
};
const inventory: RegionInventory = {
  regionId: "central",
  cells: [
    { id: "alpha", expectedBytes: 10, provenance, state: "saved", cause: "present" },
    { id: "beta", expectedBytes: 20, provenance, state: "unknown", cause: "missing" },
    { id: "gamma", expectedBytes: 30, provenance, state: "unknown", cause: "stale" },
  ],
  savedCount: 1,
  unknownCount: 2,
  savedBytes: 10,
  expectedBytes: 60,
  complete: false,
};

function state(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    phase: "ready", inventory, plan: null, lastResult: null,
    page: 0, expanded: false,
    ...overrides,
  };
}

function model(initial: DashboardState): {
  readonly dashboard: DashboardModel;
  readonly send: (state: DashboardState) => void;
  readonly refresh: ReturnType<typeof vi.fn>;
} {
  let current = initial;
  const listeners = new Set<(state: DashboardState) => void>();
  const refresh = vi.fn(async () => undefined);
  return {
    dashboard: {
      getState: () => current,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      refresh,
      download: async () => undefined,
      downloadSelected: async () => undefined,
      cancel: () => undefined,
      toggleDetails: () => undefined,
      setPage: () => undefined,
      dispose: () => undefined,
    },
    send(next) {
      current = next;
      for (const listener of listeners) listener(next);
    },
    refresh,
  };
}

function setup(language: "en" | "fr" = "en", estimate?: () => Promise<StorageEstimate>) {
  const root = document.createElement("div");
  document.body.append(root);
  const store = model(state());
  const estimateFn = estimate ?? vi.fn(async () => ({ quota: 2_000_000, usage: 0 }));
  const dispose = mountOfflineUpdateReview(root, manifest, store.dashboard, language, estimateFn);
  return { root, store, dispose, estimateFn };
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

function open(root: HTMLElement, language: "en" | "fr" = "en"): void {
  button(root, UPDATE_COPY[language].start).click();
}

function input(root: HTMLElement, type: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(`input[type="${type}"]`);
  if (!found) throw new Error(`Missing ${type} input`);
  return found;
}

function changeInput(element: HTMLInputElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function choose(root: HTMLElement, index: number, value: string): void {
  const controls = root.querySelectorAll("select");
  const control = controls.item(index);
  if (!control) throw new Error(`Missing select ${index}`);
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("mounted offline update review", () => {
  it("mounts inside the existing dashboard host without an automatic fetch", () => {
    const estimate = vi.fn(async () => ({ quota: 2_000_000, usage: 0 }));
    const view = setup("en", estimate);
    expect(view.root.textContent).toContain(UPDATE_COPY.en.title);
    expect(view.root.textContent).toContain(UPDATE_COPY.en.privacy);
    expect(estimate).not.toHaveBeenCalled();
    expect(view.root.querySelectorAll("a[href^=http]")).toHaveLength(0);
    view.dispose();
  });

  it("keeps inspection hidden until the user opens the review", () => {
    const view = setup();
    const trigger = button(view.root, UPDATE_COPY.en.start);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.root.querySelector("#" + trigger.getAttribute("aria-controls"))?.hasAttribute("hidden")).toBe(true);
    trigger.click();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(view.root.textContent).toContain(UPDATE_COPY.en.countUnknown);
    view.dispose();
  });

  it("collapses back to its initial state on repeated clicks", () => {
    const view = setup();
    open(view.root);
    button(view.root, UPDATE_COPY.en.hide).click();
    expect(button(view.root, UPDATE_COPY.en.start).getAttribute("aria-expanded")).toBe("false");
    view.dispose();
  });

  it("shows a saved cell without assigning that status to missing cells", () => {
    const view = setup();
    open(view.root);
    const list = view.root.querySelector("ol");
    expect(list?.textContent).toContain("alpha");
    expect(list?.textContent).toContain("beta");
    expect(list?.textContent).toContain("gamma");
    expect(list?.textContent).toContain("UNKNOWN");
    view.dispose();
  });

  it("includes the required source, licence and publication date", () => {
    const view = setup();
    open(view.root);
    expect(view.root.textContent).toContain("Ontario open data");
    expect(view.root.textContent).toContain("CC BY 4.0");
    expect(view.root.textContent).toContain("2026-03-02");
    view.dispose();
  });

  it("shows translated French copy rather than English-only controls", () => {
    const view = setup("fr");
    open(view.root, "fr");
    expect(view.root.textContent).toContain(UPDATE_COPY.fr.title);
    expect(view.root.textContent).toContain(UPDATE_COPY.fr.countUnknown);
    expect(view.root.textContent).toContain("INCONNU");
    expect(view.root.textContent).toContain(UPDATE_COPY.fr.privacy);
    view.dispose();
  });

  it("gives every button a minimum 44px touch target", () => {
    const view = setup();
    open(view.root);
    for (const control of view.root.querySelectorAll("button")) {
      expect(parseInt((control as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt((control as HTMLElement).style.minWidth, 10)).toBeGreaterThanOrEqual(44);
      expect(control.textContent?.trim().length).toBeGreaterThan(0);
    }
    view.dispose();
  });

  it("gives search and select controls a minimum 44px height", () => {
    const view = setup();
    open(view.root);
    for (const control of view.root.querySelectorAll("input, select")) {
      expect(parseInt((control as HTMLElement).style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(control.closest("label")).not.toBeNull();
    }
    view.dispose();
  });

  it("provides a polite live region for status changes", () => {
    const view = setup();
    open(view.root);
    const region = view.root.querySelector('[aria-live="polite"]');
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-atomic")).toBe("true");
    view.dispose();
  });

  it("filters cells by listed identifiers", () => {
    const view = setup();
    open(view.root);
    changeInput(input(view.root, "search"), "beta");
    expect(view.root.querySelector("ol")?.textContent).toContain("beta");
    expect(view.root.querySelector("ol")?.textContent).not.toContain("alpha");
    view.dispose();
  });

  it("filters cells by exact source without fetching another resource", () => {
    const estimate = vi.fn(async () => ({}));
    const view = setup("en", estimate);
    open(view.root);
    changeInput(input(view.root, "search"), "Ontario open data");
    expect(view.root.querySelector("ol")?.children.length).toBe(3);
    view.dispose();
  });

  it("only lists missing and stale cells in the download filter", () => {
    const view = setup();
    open(view.root);
    choose(view.root, 0, "needs-download");
    const content = view.root.querySelector("ol")?.textContent ?? "";
    expect(content).not.toContain("alpha");
    expect(content).toContain("beta");
    expect(content).toContain("gamma");
    view.dispose();
  });

  it("filters saved cells without inflating the summary", () => {
    const view = setup();
    open(view.root);
    choose(view.root, 0, "saved");
    const content = view.root.querySelector("ol")?.textContent ?? "";
    expect(content).toContain("alpha");
    expect(content).not.toContain("beta");
    expect(view.root.textContent).toContain(UPDATE_COPY.en.countUnknown);
    view.dispose();
  });

  it("orders largest cells before smaller cells", () => {
    const view = setup();
    open(view.root);
    choose(view.root, 1, "size-desc");
    const items = [...view.root.querySelectorAll("ol > li")];
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual([
      "gamma", "beta", "alpha",
    ]);
    view.dispose();
  });

  it("preserves UNKNOWN when the dashboard inventory becomes unavailable", () => {
    const view = setup();
    open(view.root);
    view.store.send(state({ inventory: null, phase: "error" }));
    expect(view.root.textContent).toContain(UPDATE_COPY.en.unknownRegion);
    expect(view.root.textContent).toContain("UNKNOWN");
    view.dispose();
  });

  it("updates from the existing dashboard subscription", () => {
    const view = setup();
    open(view.root);
    const completed: RegionInventory = {
      ...inventory,
      cells: inventory.cells.map((row) => ({ ...row, state: "saved" as const, cause: "present" as const })),
      savedCount: 3, unknownCount: 0, savedBytes: 60, complete: true,
    };
    view.store.send(state({ inventory: completed }));
    expect(view.root.textContent).toContain(UPDATE_COPY.en.complete);
    view.dispose();
  });

  it("refreshes only after explicit user activation", () => {
    const view = setup();
    expect(view.store.refresh).not.toHaveBeenCalled();
    open(view.root);
    button(view.root, UPDATE_COPY.en.refresh).click();
    expect(view.store.refresh).toHaveBeenCalledTimes(1);
    view.dispose();
  });

  it("can clear the search and restore all listed records", () => {
    const view = setup();
    open(view.root);
    changeInput(input(view.root, "search"), "beta");
    changeInput(input(view.root, "search"), "");
    expect(view.root.querySelectorAll("ol > li")).toHaveLength(3);
    view.dispose();
  });

  it("disables paging when fewer than twelve rows are visible", () => {
    const view = setup();
    open(view.root);
    expect(button(view.root, UPDATE_COPY.en.previous).disabled).toBe(true);
    expect(button(view.root, UPDATE_COPY.en.next).disabled).toBe(true);
    view.dispose();
  });

  it("does not leave a mounted panel after disposal", () => {
    const view = setup();
    open(view.root);
    view.dispose();
    expect(view.root.children).toHaveLength(0);
  });

  it("ignores dashboard updates after disposal", () => {
    const view = setup();
    open(view.root);
    view.dispose();
    expect(() => view.store.send(state({ inventory: null }))).not.toThrow();
    expect(view.root.childElementCount).toBe(0);
  });
});
