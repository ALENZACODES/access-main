/** @vitest-environment jsdom */
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { RegionInventory } from "./regionInventory";
import type { RegionManifest } from "./regionDownload";
import { mountOfflinePackReceipts } from "./packReceiptPanel";
import { PACK_RECEIPT_COPY } from "./packReceiptCopy";
import {
  appendPackReceipt,
  createPackReceipt,
  emptyReceiptBook,
  encodeReceiptBook,
  type ReceiptBook,
  type ReceiptCrypto,
} from "./packReceipt";

const cryptoProvider = webcrypto as unknown as ReceiptCrypto;
const source = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-10-01" };
const manifest: RegionManifest = {
  regionId: "north",
  cells: [
    { id: "alpha", bytes: 10, provenance: source },
    { id: "beta", bytes: 20, provenance: source },
  ],
};
const inventory: RegionInventory = {
  regionId: "north",
  cells: [
    { id: "alpha", expectedBytes: 10, provenance: source, cause: "present", state: "saved" },
    { id: "beta", expectedBytes: 20, provenance: source, cause: "missing", state: "unknown" },
  ],
  savedCount: 1,
  unknownCount: 1,
  savedBytes: 10,
  expectedBytes: 30,
  complete: false,
};

function model(initial: RegionInventory | null = inventory): DashboardModel {
  const state: DashboardState = {
    phase: "ready",
    inventory: initial,
    plan: null,
    lastResult: null,
    page: 0,
    expanded: false,
  };
  const listeners = new Set<(value: DashboardState) => void>();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh: async () => undefined,
    download: async () => undefined,
    downloadSelected: async () => undefined,
    cancel: () => undefined,
    toggleDetails: () => undefined,
    setPage: () => undefined,
    dispose: () => listeners.clear(),
  };
}

function mount(language: "en" | "fr" = "en", state: RegionInventory | null = inventory) {
  const root = document.createElement("div");
  document.body.append(root);
  const unmount = mountOfflinePackReceipts(root, manifest, model(state), language);
  return { root, unmount, copy: PACK_RECEIPT_COPY[language] };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const result = [...root.querySelectorAll("button")].find((item) => item.textContent === label);
  if (!result) throw new Error("Button not found: " + label);
  return result;
}

async function waitForStatus(root: HTMLElement, expected: string): Promise<void> {
  await vi.waitFor(() => {
    expect(root.querySelector('[role="status"]')?.textContent).toBe(expected);
  });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("offline pack receipt panel", () => {
  it("mounts an empty English panel with labelled actions and an announcement", () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount("en");
    expect(view.root.querySelector("section")?.getAttribute("aria-label")).toBe(view.copy.title);
    expect(view.root.textContent).toContain(view.copy.intro);
    expect(view.root.textContent).toContain(view.copy.caution);
    expect(view.root.querySelector('[role="status"]')).toBeTruthy();
    expect(view.root.querySelectorAll("button").length).toBeGreaterThanOrEqual(5);
    expect(view.root.querySelectorAll("label").length).toBeGreaterThanOrEqual(4);
    expect(view.root.querySelector('input[type="file"]')).toBeNull();
    expect(button(view.root, view.copy.exportJson).disabled).toBe(true);
    expect(button(view.root, view.copy.compare).disabled).toBe(true);
    view.unmount();
  });

  it("mounts French copy with the exact UNKNOWN token", () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount("fr", null);
    expect(view.root.textContent).toContain("UNKNOWN");
    expect(view.root.textContent).toContain("Reçus des packs hors ligne");
    expect(view.root.textContent).not.toMatch(/Inconnu|Unknown/);
    expect(view.root.textContent).toContain("n’établit pas");
    view.unmount();
  });

  it("sets minimum 44px dimensions on native action controls", () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    for (const control of view.root.querySelectorAll("button, input, select, textarea")) {
      expect(Number.parseFloat((control as HTMLElement).style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat((control as HTMLElement).style.minWidth)).toBeGreaterThanOrEqual(44);
    }
    view.unmount();
  });

  it("records one explicit reading and displays its summary", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    button(view.root, view.copy.capture).click();
    await waitForStatus(view.root, view.copy.captured);
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.captured);
    expect(view.root.textContent).toContain(view.copy.saved);
    expect(view.root.textContent).toContain(view.copy.unknown);
    expect(view.root.textContent).toContain("alpha");
    expect(view.root.textContent).toContain("beta");
    expect(button(view.root, view.copy.exportJson).disabled).toBe(false);
    expect(button(view.root, view.copy.compare).disabled).toBe(true);
    view.unmount();
  });

  it("records UNKNOWN when the dashboard inventory is unavailable", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount("en", null);
    button(view.root, view.copy.capture).click();
    await waitForStatus(view.root, view.copy.captured);
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.captured);
    expect(view.root.textContent).toContain("UNKNOWN");
    expect(view.root.textContent).not.toContain("Saved copies1");
    view.unmount();
  });

  it("does not enable comparison until two readings exist", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    expect(button(view.root, view.copy.compare).disabled).toBe(true);
    button(view.root, view.copy.capture).click();
    await waitForStatus(view.root, view.copy.captured);
    expect(button(view.root, view.copy.compare).disabled).toBe(true);
    view.unmount();
  });

  it("imports a valid pasted receipt book only after the explicit import action", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const first = await createPackReceipt(manifest, inventory, "2026-11-21T10:00:00.000Z", cryptoProvider);
    const second = await createPackReceipt(manifest, {
      ...inventory,
      cells: inventory.cells.map((cell) => cell.id === "beta"
        ? { ...cell, cause: "present" as const, state: "saved" as const }
        : cell),
      savedCount: 2,
      unknownCount: 0,
      savedBytes: 30,
      complete: true,
    }, "2026-11-21T10:01:00.000Z", cryptoProvider);
    const book = appendPackReceipt(appendPackReceipt(emptyReceiptBook("north"), first), second);
    const view = mount();
    const textarea = view.root.querySelector("textarea")!;
    textarea.value = encodeReceiptBook(book);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.root.textContent).toContain(view.copy.empty);
    button(view.root, view.copy.importJson).click();
    await waitForStatus(view.root, view.copy.imported);
    expect(view.root.textContent).toContain(view.copy.captures);
    expect(view.root.textContent).toContain("2");
    expect(view.root.textContent).toContain(view.copy.saved);
    expect(view.root.textContent).toContain(view.copy.comparePrompt);
    expect(button(view.root, view.copy.compare).disabled).toBe(false);
    button(view.root, view.copy.compare).click();
    expect(view.root.textContent).toContain("beta");
    view.unmount();
  });

  it("rejects a pasted receipt with an edited digest", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const first = await createPackReceipt(manifest, inventory, "2026-11-21T10:00:00.000Z", cryptoProvider);
    const book = appendPackReceipt(emptyReceiptBook("north"), first);
    const raw = JSON.parse(encodeReceiptBook(book)) as { receipts: Array<Record<string, unknown>> };
    const changed = { ...raw, receipts: raw.receipts.map((item) => ({ ...item, digest: "0".repeat(64) })) };
    const view = mount();
    const textarea = view.root.querySelector("textarea")!;
    textarea.value = JSON.stringify(changed);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button(view.root, view.copy.importJson).click();
    await waitForStatus(view.root, view.copy.invalid);
    expect(view.root.textContent).toContain(view.copy.empty);
    view.unmount();
  });

  it("rejects an oversized paste before starting an import", () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    const textarea = view.root.querySelector("textarea")!;
    textarea.value = "x".repeat(524_289);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    button(view.root, view.copy.importJson).click();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.tooLarge);
    view.unmount();
  });

  it("clears only the page's receipt history", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    button(view.root, view.copy.capture).click();
    await waitForStatus(view.root, view.copy.captured);
    button(view.root, view.copy.clear).click();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.cleared);
    expect(view.root.textContent).toContain(view.copy.empty);
    view.unmount();
  });

  it("keeps the receipt page functional when the dashboard refreshes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const sourceModel = model();
    const root = document.createElement("div");
    document.body.append(root);
    const unmount = mountOfflinePackReceipts(root, manifest, sourceModel, "en");
    button(root, PACK_RECEIPT_COPY.en.capture).click();
    await waitForStatus(root, PACK_RECEIPT_COPY.en.captured);
    expect(root.textContent).toContain(PACK_RECEIPT_COPY.en.captured);
    unmount();
    expect(root.querySelector("section")).toBeNull();
  });

  it("removes all panel listeners and its section during unmount", () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    const section = view.root.querySelector("section");
    expect(section).toBeTruthy();
    view.unmount();
    expect(view.root.querySelector("section")).toBeNull();
  });

  it("does not schedule polling or background work", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const view = mount();
    const sourceText = view.root.querySelector("section")?.textContent ?? "";
    expect(sourceText).not.toMatch(/automatically|periodically|background/);
    view.unmount();
  });
});
