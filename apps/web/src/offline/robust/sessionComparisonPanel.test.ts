// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegionManifest, Provenance } from "./regionDownload";
import type { RegionInventory, InventoryCell } from "./regionInventory";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import { mountOfflineSessionComparison } from "./sessionComparisonPanel";

const provenance: Provenance = { source: "Local open dataset", licence: "CC BY 4.0", date: "2026-05-01" };
const manifest: RegionManifest = {
  regionId: "north-zone",
  cells: [
    { id: "one", bytes: 10, provenance },
    { id: "two", bytes: 20, provenance },
  ],
};

function item(id: string, cause: InventoryCell["cause"]): InventoryCell {
  return {
    id, expectedBytes: id === "one" ? 10 : 20,
    provenance, cause, state: cause === "present" ? "saved" : "unknown",
  };
}

function inventory(cause: InventoryCell["cause"]): RegionInventory {
  const cells = [item("one", "present"), item("two", cause)];
  const saved = cells.filter((cell) => cell.state === "saved");
  return {
    regionId: manifest.regionId, cells, savedCount: saved.length,
    unknownCount: cells.length - saved.length,
    savedBytes: saved.reduce((sum, cell) => sum + cell.expectedBytes, 0),
    expectedBytes: 30,
    complete: saved.length === cells.length,
  };
}

function createModel(): { model: DashboardModel; setInventory: (next: RegionInventory | null) => void; refresh: ReturnType<typeof vi.fn> } {
  let current: RegionInventory | null = inventory("missing");
  const refresh = vi.fn(async () => undefined);
  const state = (): DashboardState => ({
    phase: "ready", inventory: current, plan: null,
    lastResult: null, page: 0, expanded: false,
  });
  const model: DashboardModel = {
    getState: state,
    subscribe: () => () => undefined,
    refresh,
    download: async () => undefined,
    downloadSelected: async () => undefined,
    cancel: () => undefined,
    toggleDetails: () => undefined,
    setPage: () => undefined,
    dispose: () => undefined,
  };
  return { model, setInventory: (value) => { current = value; }, refresh };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll("button")].find((node) => node.textContent === label);
  if (result === undefined) throw new Error(`Missing button: ${label}`);
  return result;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("mounted offline session comparison", () => {
  it("starts with a manual capture action and makes no network request", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model, refresh } = createModel();
    mounted.push(mountOfflineSessionComparison(root, manifest, model, "en"));
    expect(root.textContent).toContain("Save a starting reading");
    expect(button(root, "Compare with current copies").disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("uses native controls with 44px minimum targets", () => {
    const root = document.createElement("div");
    document.body.append(root);
    mounted.push(mountOfflineSessionComparison(root, manifest, createModel().model, "en"));
    for (const control of root.querySelectorAll("button, input, select")) {
      expect((control as HTMLElement).style.minHeight).toBe("44px");
      expect((control as HTMLElement).style.minWidth).toBe("44px");
    }
    expect(root.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it("compares two explicit readings and preserves UNKNOWN", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model, setInventory, refresh } = createModel();
    mounted.push(mountOfflineSessionComparison(root, manifest, model, "en"));
    button(root, "Save starting reading").click();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("Starting reading captured");
    setInventory(inventory("present"));
    button(root, "Compare with current copies").click();
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain("Newly saved: 1");
    expect(root.textContent).toContain("Saved in both readings");
  });

  it("reports the state as UNKNOWN when storage cannot be read", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model, setInventory } = createModel();
    mounted.push(mountOfflineSessionComparison(root, manifest, model, "en"));
    button(root, "Save starting reading").click();
    await flush();
    setInventory(null);
    button(root, "Compare with current copies").click();
    await flush();
    expect(root.textContent).toContain("Status remains UNKNOWN");
    expect(root.textContent).toContain("Cannot compare: 2");
    expect(root.textContent).not.toContain("Newly saved: 2");
  });

  it("supports French labels and source details", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model } = createModel();
    mounted.push(mountOfflineSessionComparison(root, manifest, model, "fr"));
    button(root, "Enregistrer la lecture initiale").click();
    await flush();
    button(root, "Comparer avec les copies actuelles").click();
    await flush();
    expect(root.textContent).toContain("Nouvelles copies enregistrées\u00a0: 0");
    expect(root.textContent).toContain("Local open dataset");
    expect(root.textContent).toContain("CC BY 4.0");
  });

  it("clears the comparison without deleting stored cells", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model, refresh } = createModel();
    mounted.push(mountOfflineSessionComparison(root, manifest, model, "en"));
    button(root, "Save starting reading").click();
    await flush();
    button(root, "Compare with current copies").click();
    await flush();
    button(root, "Clear comparison").click();
    expect(root.textContent).toContain("Save a starting reading");
    expect(button(root, "Compare with current copies").disabled).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("disposes its event handlers without triggering another reading", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const { model, refresh } = createModel();
    const dispose = mountOfflineSessionComparison(root, manifest, model, "en");
    const start = button(root, "Save starting reading");
    dispose();
    start.click();
    await flush();
    expect(refresh).not.toHaveBeenCalled();
    expect(root.childElementCount).toBe(0);
  });
});
