/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { Blob as RuntimeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPackSource, type PackSource } from "../../../../packages/data-client/src/index.ts";
import { regionDownloadQueueFixture } from "../../e2e/support/regionDownloadQueueFixture";
import { initI18n } from "../i18n/index.ts";
import { OfflineRegionPage } from "./RegionPackPage";

vi.mock("../recovery/RecoveryCenter.tsx", () => ({ RecoveryCenter: () => null }));
// Other independently launched dashboard tools are exercised in their own suites.
// Keep the route, pack client, per-cell ledger, download runner and queue intact.
vi.mock("./robust/storagePressure", async (load) => ({
  ...await load<typeof import("./robust/storagePressure")>(),
  mountStoragePressurePanel: () => () => undefined,
}));

const i18n = initI18n();
const labels = {
  en: {
    open: "Open region download queue", close: "Close region download queue",
    panel: "Region download queue", region: "Region to add", add: "Add to queue",
    start: "Start downloads", pause: "Pause queue", resume: "Continue downloads",
    status: "Download queue status", done: "The region queue finished.",
    saved: "Downloaded, integrity checked", download: "Download", recheck: "Check again", remove: "Delete",
  },
  fr: {
    open: "Ouvrir la file de téléchargement des régions", close: "Fermer la file de téléchargement des régions",
    panel: "File de téléchargement des régions", region: "Région à ajouter", add: "Ajouter à la file",
    start: "Lancer les téléchargements", pause: "Suspendre la file", resume: "Reprendre les téléchargements",
    status: "État de la file de téléchargement", done: "Le téléchargement des régions de la file est terminé.",
    saved: "Téléchargée, intégrité contrôlée", download: "Télécharger", recheck: "Contrôler de nouveau", remove: "Supprimer",
  },
} as const;

function deferred() {
  let done!: () => void;
  const promise = new Promise<void>((resolve) => { done = resolve; });
  return { done, promise };
}

const releaseAfterTest = new Set<() => void>();

function packs() {
  const fixture = regionDownloadQueueFixture();
  const requested: string[] = [];
  const badDigests = new Set<string>();
  const blocked = new Map<string, { entered: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> }>();

  const fetcher: typeof fetch = async (input) => {
    const path = String(input).replace(/^\/data\//, "");
    if (path === "pack/v1/manifest.json") return Response.json(fixture.manifest);
    requested.push(path);
    const gate = blocked.get(path);
    if (gate) {
      gate.entered.done();
      await gate.released.promise;
      blocked.delete(path);
    }
    const stored = fixture.parts.get(path);
    if (!stored) return new Response(null, { status: 503 });
    const bytes = Uint8Array.from(stored);
    if (badDigests.has(path)) bytes[0] = (bytes[0] ?? 0) ^ 1;
    return new Response(bytes);
  };
  const source = createPackSource({ baseUrl: "/data/", fetch: fetcher, db: "memory" });
  const wholeDownload = vi.spyOn(source, "downloadRegion");

  function hold(path: string) {
    const gate = { entered: deferred(), released: deferred() };
    blocked.set(path, gate);
    releaseAfterTest.add(gate.released.done);
    return { started: gate.entered.promise, finish: gate.released.done };
  }
  return { ...fixture, requested, source, wholeDownload, hold, badDigests };
}

const previousStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
function setStorage(estimate: () => Promise<StorageEstimate>) {
  Object.defineProperty(navigator, "storage", { configurable: true, value: { estimate } });
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", RuntimeBlob);
  setStorage(async () => ({ quota: 100 * 1024 * 1024, usage: 0 }));
});

afterEach(() => {
  cleanup();
  for (const release of releaseAfterTest) release();
  releaseAfterTest.clear();
  if (previousStorage) Object.defineProperty(navigator, "storage", previousStorage);
  else Reflect.deleteProperty(navigator, "storage");
  vi.unstubAllGlobals();
});

async function page(source: PackSource, language: "en" | "fr" = "en") {
  const c = labels[language];
  await i18n.changeLanguage(language);
  render(<I18nextProvider i18n={i18n}><OfflineRegionPage packSource={source} /></I18nextProvider>);
  await screen.findByTestId("failsafe-sample-south");
  async function open() {
    const button = screen.getByRole("button", { name: c.open });
    await act(async () => {
      fireEvent.click(button);
      await vi.dynamicImportSettled();
    });
    return screen.findByRole("region", { name: c.panel });
  }
  function queue() { return within(screen.getByRole("region", { name: c.panel })); }
  function add(id: string) {
    fireEvent.change(queue().getByRole("combobox", { name: c.region }), { target: { value: id } });
    fireEvent.click(queue().getByRole("button", { name: c.add }));
  }
  function press(name: string) { fireEvent.click(queue().getByRole("button", { name })); }
  function row(id: string) {
    const el = screen.getByTestId("failsafe-" + id).closest("li");
    if (!el) throw new Error("Missing region row");
    return within(el);
  }
  async function whenEnabled(name: string) {
    await waitFor(() => expect(queue().getByRole("button", { name }).hasAttribute("disabled")).toBe(false));
  }
  async function finished() {
    await waitFor(() => expect(queue().getByRole("status", { name: c.status }).textContent).toContain(c.done));
  }
  return { open, queue, add, press, row, finished, whenEnabled, c };
}

describe("manual region downloads through the Offline page", () => {
  it.each(["en", "fr"] as const)("persists both selected regions in the chosen order (%s)", async (language) => {
    const f = packs();
    const ui = await page(f.source, language);
    await ui.open();
    ui.add("sample-south");
    ui.add("sample-north");
    expect(f.requested).toEqual([]);
    expect((await f.source.regions()).every((r) => !r.downloaded)).toBe(true);
    ui.press(ui.c.start);
    await ui.finished();
    expect(f.requested).toEqual([...f.south, ...f.north]);
    expect(f.wholeDownload).not.toHaveBeenCalled();
    for (const id of ["sample-north", "sample-south"]) {
      expect(ui.row(id).getByTestId("region-state").textContent).toBe(ui.c.saved);
      const snapshot = await f.source.storedRegionIntegrity(id);
      expect(snapshot?.parts.every((part) =>
        part.structurallyValid && part.actualCount === 1 && part.data?.byteLength === part.expectedBytes,
      )).toBe(true);
    }
    expect((await f.source.get("example:" + f.southCells[0]))?.fields.name?.value).toBe("UNKNOWN");
  });

  it("a same-size digest mismatch retains the earlier cell and stops before the next region", async () => {
    const f = packs();
    f.badDigests.add(f.north[1]!);
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-north");
    ui.add("sample-south");
    ui.press(ui.c.start);
    await ui.whenEnabled(ui.c.resume);
    expect(f.requested).toEqual([...f.north, f.north[1]]);
    let [north, south] = await f.source.regions();
    expect(north?.missingCells).toEqual([f.northCells[1]]);
    expect(north?.downloaded).toBe(false);
    expect(south?.missingCells).toEqual(f.southCells);
    expect(await f.source.get("example:" + f.northCells[0])).toBeTruthy();
    expect(await f.source.get("example:" + f.northCells[1])).toBeNull();

    f.badDigests.clear();
    ui.press(ui.c.resume);
    await ui.finished();
    [north, south] = await f.source.regions();
    expect(north?.downloaded && south?.downloaded).toBe(true);
    expect(f.requested).toEqual([...f.north, f.north[1], f.north[1], ...f.south]);
  });

  it("stops before requesting the next cell when the device runs out of space", async () => {
    const f = packs();
    let constrained = true;
    setStorage(async () => ({ usage: 0, quota: constrained && f.requested.length ? 1024 : 100 * 1024 * 1024 }));
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-north");
    ui.add("sample-south");
    ui.press(ui.c.start);
    await ui.whenEnabled(ui.c.resume);
    expect(f.requested).toEqual([f.north[0]]);
    expect((await f.source.regions())[0]?.missingCells).toEqual([f.northCells[1]]);
    constrained = false;
    ui.press(ui.c.resume);
    await ui.finished();
    expect(f.requested).toEqual([...f.north, ...f.south]);
  });

  it("locks manual download, delete and integrity checks while the queue owns the transfer", async () => {
    const f = packs();
    await f.source.downloadRegion("sample-south");
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-north");
    const current = f.hold(f.north[0]!);
    ui.press(ui.c.start);
    await current.started;
    const installed = ui.row("sample-south");
    const del = installed.getByRole("button", { name: ui.c.remove });
    const recheck = installed.getByRole("button", { name: ui.c.recheck });
    expect(del.hasAttribute("disabled")).toBe(true);
    expect(recheck.hasAttribute("disabled")).toBe(true);
    fireEvent.click(del);
    fireEvent.click(recheck);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(f.requested).toEqual([...f.south, f.north[0]]);
    current.finish();
    await ui.finished();
    expect(del.hasAttribute("disabled")).toBe(false);
    expect(recheck.hasAttribute("disabled")).toBe(false);
  });

  it("does not allocate a queue transfer during a separately requested row download", async () => {
    const f = packs();
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-south");
    const first = f.hold(f.north[0]!);
    fireEvent.click(ui.row("sample-north").getByRole("button", { name: ui.c.download }));
    await first.started;
    const start = ui.queue().getByRole("button", { name: ui.c.start });
    expect(start.hasAttribute("disabled")).toBe(true);
    fireEvent.click(start);
    expect(f.requested).toEqual([f.north[0]]);
    first.finish();
    await waitFor(() => expect(ui.row("sample-north").getByTestId("region-state").textContent).toBe(ui.c.saved));
    expect(f.requested).toEqual(f.north);
    ui.press(ui.c.start);
    await ui.finished();
    expect(f.requested).toEqual([...f.north, ...f.south]);
  });

  it("goes offline during a cell transfer and waits for an explicit continuation after reconnection", async () => {
    const f = packs();
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-north");
    ui.add("sample-south");
    const first = f.hold(f.north[0]!);
    ui.press(ui.c.start);
    await first.started;
    act(() => { window.dispatchEvent(new Event("offline")); });
    first.finish();
    const resume = await ui.queue().findByRole("button", { name: ui.c.resume });
    expect(resume.hasAttribute("disabled")).toBe(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(resume.hasAttribute("disabled")).toBe(false);
    expect(f.requested).toEqual([f.north[0]]);
    ui.press(ui.c.resume);
    await ui.finished();
    expect(f.requested).toEqual([...f.north, ...f.south]);
  });

  it("closing the queue abandons further regions even if an earlier request finishes afterwards", async () => {
    const f = packs();
    const ui = await page(f.source);
    await ui.open();
    ui.add("sample-north");
    ui.add("sample-south");
    const first = f.hold(f.north[0]!);
    ui.press(ui.c.start);
    await first.started;
    fireEvent.click(screen.getByRole("button", { name: ui.c.close }));
    first.finish();
    await waitFor(() => expect(ui.row("sample-south").getByRole("button", { name: ui.c.download }).hasAttribute("disabled")).toBe(false));
    expect(f.requested).toEqual([f.north[0]]);
    expect((await f.source.regions())[1]?.downloaded).toBe(false);
    await ui.open();
    const start = ui.queue().getByRole("button", { name: ui.c.start });
    expect(start.hasAttribute("disabled")).toBe(true);
  });
});
