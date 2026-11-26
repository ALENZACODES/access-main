/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DownloadQueuePanel, { type QueuePanelProps } from "./DownloadQueuePanel";
import type { QueueOutcome } from "./queue";

const north = { id: "n", label: "North", downloaded: false };
const south = { id: "s", label: "South", downloaded: false };
const east = { id: "e", label: "East", downloaded: false };
type Download = QueuePanelProps["download"];

function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function show(overrides: Partial<QueuePanelProps> = {}) {
  const download = vi.fn<Download>(async () => "complete");
  const runBatch = vi.fn<QueuePanelProps["runBatch"]>(async (task) => {
    await task();
    return true;
  });
  let props: QueuePanelProps = {
    language: "en",
    regions: [north, south, east],
    online: true,
    busy: false,
    download,
    runBatch,
    ...overrides,
  };
  const view = render(<DownloadQueuePanel {...props} />);
  return {
    download,
    runBatch,
    unmount: view.unmount,
    update: (next: Partial<QueuePanelProps>) => {
      props = { ...props, ...next };
      view.rerender(<DownloadQueuePanel {...props} />);
    },
  };
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });
const click = (name: string) => fireEvent.click(button(name));
async function startDownloads() {
  await act(async () => { click("Start downloads"); });
}
const picker = () => screen.getByRole<HTMLSelectElement>("combobox");
const status = () => screen.getByRole("status").textContent;
const list = () => screen.getByRole("list");
const rows = () => within(list()).getAllByRole("listitem");
const rowLabels = () => rows().map((row) => row.querySelector("strong")?.textContent);
function add(id: string, label = "Add to queue") {
  fireEvent.change(picker(), { target: { value: id } });
  click(label);
}
async function settle(gate: ReturnType<typeof deferred<QueueOutcome>>, value: QueueOutcome) {
  await act(async () => { gate.resolve(value); });
}

afterEach(cleanup);

describe("selecting and arranging regions", () => {
  it("associates its heading, live result, and native chooser with this panel", () => {
    show();
    const panel = screen.getByRole("region", { name: "Region download queue" });
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Region download queue");
    expect(within(panel).getByRole("combobox", { name: "Region to add" })).toBe(picker());
    expect(within(panel).getByRole("status", { name: "Download queue status" }).getAttribute("aria-atomic")).toBe("true");
    expect(status()).toBe("The queue is empty.");
    expect(picker().value).toBe("");
    expect(button("Start downloads").disabled).toBe(true);
    expect(button("Add to queue").disabled).toBe(true);
  });

  it("responds to a listing becoming available without picking a region on the reader’s behalf", () => {
    const view = show({ regions: [] });
    expect(picker().disabled).toBe(true);
    expect(screen.getByText("There are no regions to choose from in the current listing.")).toBeTruthy();
    view.update({ regions: [south] });
    expect(picker().disabled).toBe(false);
    expect(button("Add to queue").disabled).toBe(true);
    expect(screen.queryByRole("list")).toBeNull();
    expect(view.download).not.toHaveBeenCalled();
    expect(view.runBatch).not.toHaveBeenCalled();
  });

  it("offers each usable ID once and makes same-name regions distinguishable", () => {
    show({ regions: [
      north,
      { ...north, label: "Another label", downloaded: true },
      { ...south, label: "North" },
      { ...east, downloaded: true },
      { id: "w", label: " ", downloaded: false },
      { id: "", label: "Unusable entry", downloaded: false },
    ] });
    expect(within(picker()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose a region", "North (n)", "North (s)", "w",
    ]);
    add("s");
    add("n");
    expect(rowLabels()).toEqual(["North (s)", "North (n)"]);
    expect(button("Remove North (s) from the queue")).toBeTruthy();
    expect(button("Remove North (n) from the queue")).toBeTruthy();
  });

  it("requires a new choice when the chosen option disappears before addition", () => {
    const view = show();
    fireEvent.change(picker(), { target: { value: "s" } });
    expect(button("Add to queue").disabled).toBe(false);
    view.update({ regions: [north, east] });
    expect(picker().value).toBe("");
    expect(button("Add to queue").disabled).toBe(true);
    add("e");
    expect(rowLabels()).toEqual(["East"]);
    expect(view.download).not.toHaveBeenCalled();
  });

  it("maintains insertion order and places focus at the next useful control after each add", () => {
    const view = show({ regions: [north, south] });
    add("s");
    expect(document.activeElement).toBe(picker());
    expect(picker().value).toBe("");
    add("n");
    expect(document.activeElement).toBe(within(rows()[1]!).getByText("North"));
    expect(picker().disabled).toBe(true);
    expect(rowLabels()).toEqual(["South", "North"]);
    expect(screen.getByText("Each listed region is already saved or in the queue.")).toBeTruthy();
    expect(view.runBatch).not.toHaveBeenCalled();
  });

  it("keeps the moved region focused at either end of the queue", () => {
    show();
    for (const region of [north, south, east]) add(region.id);
    expect(button("Move North up").disabled).toBe(true);
    expect(button("Move East down").disabled).toBe(true);
    click("Move South up");
    expect(rowLabels()).toEqual(["South", "North", "East"]);
    expect(button("Move South up").disabled).toBe(true);
    expect(document.activeElement?.textContent).toBe("South");
    click("Move North down");
    expect(rowLabels()).toEqual(["South", "East", "North"]);
    expect(button("Move North down").disabled).toBe(true);
    expect(document.activeElement?.textContent).toBe("North");
  });

  it("moves focus to the following row, previous row, or picker when removing in different positions", () => {
    show();
    for (const region of [north, south, east]) add(region.id);
    click("Remove South from the queue");
    expect(rowLabels()).toEqual(["North", "East"]);
    expect(document.activeElement?.textContent).toBe("East");
    click("Remove East from the queue");
    expect(document.activeElement?.textContent).toBe("North");
    click("Remove North from the queue");
    expect(screen.queryByRole("list")).toBeNull();
    expect(document.activeElement).toBe(picker());
    expect(within(picker()).getAllByRole("option")).toHaveLength(4);
  });

  it("falls back to the panel title when its last region disappears from the catalogue", () => {
    const view = show({ regions: [north] });
    add("n");
    view.update({ regions: [] });
    expect(within(rows()[0]!).getByText("No longer in the current region listing.")).toBeTruthy();
    click("Remove n from the queue");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Region download queue" }));
  });

  it("gives every interactive target room for pointer and touch selection", () => {
    show();
    add("n");
    for (const element of [picker(), ...screen.getAllByRole("button")]) {
      expect(element.style.minHeight).toBe("44px");
      expect(element.style.minWidth).toBe("44px");
    }
  });
});

describe("running the ordered queue", () => {
  it("downloads in the edited order, keeps controls locked during work, and announces the result", async () => {
    const first = deferred<QueueOutcome>();
    const second = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = show({ download });
    add("n");
    add("e");
    click("Move East up");
    await startDownloads();
    expect(download.mock.calls.map(([id]) => id)).toEqual(["e"]);
    expect(status()).toContain("Downloading East.");
    expect(picker().disabled).toBe(true);
    expect(button("Remove North from the queue").disabled).toBe(true);
    expect(button("Move North up").disabled).toBe(true);
    expect(button("Pause queue").disabled).toBe(false);
    await settle(first, "complete");
    expect(status()).toContain("Downloading North. 1 of 2 saved.");
    expect(download.mock.calls.map(([id]) => id)).toEqual(["e", "n"]);
    expect(button("Remove saved entries from the list").disabled).toBe(true);
    await settle(second, "complete");
    expect(status()).toBe("The region queue finished. 2 of 2 saved.");
    expect(button("Start downloads").disabled).toBe(true);
    expect(button("Remove North from the queue").disabled).toBe(false);
    expect(view.runBatch).toHaveBeenCalledTimes(1);
  });

  it("allows arranging a queue offline and never starts on reconnection", async () => {
    const view = show({ online: false });
    add("e");
    add("n");
    click("Move North up");
    expect(rowLabels()).toEqual(["North", "East"]);
    expect(button("Start downloads").disabled).toBe(true);
    expect(screen.getByText(/arrange the list offline/)).toBeTruthy();
    view.update({ online: true });
    expect(button("Start downloads").disabled).toBe(false);
    expect(view.download).not.toHaveBeenCalled();
    await startDownloads();
    await waitFor(() => expect(status()).toContain("2 of 2 saved."));
    expect(view.download.mock.calls.map(([id]) => id)).toEqual(["n", "e"]);
  });

  it("keeps an explicitly paused region in its position and waits for another start", async () => {
    const first = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValueOnce(first.promise).mockResolvedValue("complete");
    show({ download });
    add("n");
    add("s");
    await startDownloads();
    const signal = download.mock.calls[0]![1];
    click("Pause queue");
    expect(signal.aborted).toBe(true);
    expect(button("Pausing downloads…").disabled).toBe(true);
    expect(button("Remove North from the queue").disabled).toBe(true);
    await settle(first, "interrupted");
    expect(status()).toContain("Queue stopped at North.");
    expect(download).toHaveBeenCalledTimes(1);
    click("Continue downloads");
    await waitFor(() => expect(status()).toBe("The region queue finished. 2 of 2 saved."));
    expect(download.mock.calls.map(([id]) => id)).toEqual(["n", "n", "s"]);
    expect(download.mock.calls[1]![1]).not.toBe(signal);
  });

  it("pauses on network loss and lets a transfer that finished at the boundary keep its result", async () => {
    const first = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValueOnce(first.promise).mockResolvedValue("complete");
    const view = show({ download });
    add("n");
    add("s");
    await startDownloads();
    const signal = download.mock.calls[0]![1];
    view.update({ online: false });
    expect(signal.aborted).toBe(true);
    view.update({ online: true });
    await settle(first, "complete");
    expect(rows()[0]!.textContent).toContain("Saved");
    expect(rows()[1]!.textContent).toContain("Waiting");
    expect(download).toHaveBeenCalledTimes(1);
    click("Continue downloads");
    await waitFor(() => expect(status()).toContain("2 of 2 saved."));
    expect(download.mock.calls.map(([id]) => id)).toEqual(["n", "s"]);
  });

  it("aborts pending work on unmount and starts with an empty list on a fresh visit", async () => {
    const first = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValue(first.promise);
    const view = show({ download });
    add("s");
    add("n");
    await startDownloads();
    const signal = download.mock.calls[0]![1];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await settle(first, "interrupted");
    show({ download });
    expect(status()).toBe("The queue is empty.");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["quota", "Insufficient storage."],
    ["error", "Download stopped."],
    ["unavailable", "Region unavailable."],
  ] as const)("stops on %s and supports removing the affected region before proceeding", async (outcome, guidance) => {
    const download = vi.fn<Download>().mockResolvedValueOnce(outcome).mockResolvedValue("complete");
    show({ download });
    add("n");
    add("e");
    await startDownloads();
    await waitFor(() => expect(status()).toContain("Queue stopped at North."));
    expect(status()).toContain(guidance);
    expect(rows()[0]!.textContent).toContain(guidance);
    click("Remove North from the queue");
    expect(download).toHaveBeenCalledTimes(1);
    const restart = screen.queryByRole("button", { name: "Continue downloads" }) ?? button("Start downloads");
    fireEvent.click(restart);
    await waitFor(() => expect(status()).toContain("1 of 1 saved."));
    expect(download.mock.calls.map(([id]) => id)).toEqual(["n", "e"]);
  });

  it("reports a queued region that disappears during an earlier transfer without downloading it", async () => {
    const first = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValueOnce(first.promise);
    const view = show({ download });
    add("n");
    add("s");
    await startDownloads();
    view.update({ regions: [north] });
    await settle(first, "complete");
    expect(status()).toContain("Queue stopped at s.");
    expect(rows()[1]!.textContent).toContain("No longer in the current region listing.");
    expect(rows()[1]!.textContent).toContain("Region unavailable.");
    expect(download.mock.calls.map(([id]) => id)).toEqual(["n"]);
    click("Remove saved entries from the list");
    expect(rowLabels()).toEqual(["s"]);
    expect(document.activeElement?.textContent).toBe("s");
  });

  it("still claims each queued region when the listing shows its shared bytes have arrived", async () => {
    const first = deferred<QueueOutcome>();
    const original = vi.fn<Download>().mockReturnValueOnce(first.promise);
    const replacement = vi.fn<Download>().mockResolvedValue("complete");
    const view = show({ download: original });
    for (const region of [north, south, east]) add(region.id);
    await startDownloads();
    view.update({ download: replacement, regions: [north, { ...south, downloaded: true }, east] });
    await settle(first, "complete");
    expect(original.mock.calls.map(([id]) => id)).toEqual(["n"]);
    expect(replacement.mock.calls.map(([id]) => id)).toEqual(["s", "e"]);
    expect(status()).toBe("The region queue finished. 3 of 3 saved.");
  });

  it("reports a failed claim even if the catalogue already lists all the bytes as downloaded", async () => {
    const download = vi.fn<Download>().mockResolvedValue("quota");
    const view = show({ download, regions: [south] });
    add("s");
    view.update({ regions: [{ ...south, downloaded: true }] });
    await startDownloads();
    expect(download.mock.calls.map(([id]) => id)).toEqual(["s"]);
    expect(status()).toContain("Insufficient storage.");
    expect(screen.queryByRole("button", { name: "Remove saved entries from the list" })).toBeNull();
    expect(button("Continue downloads").disabled).toBe(false);
  });

  it("can remove a result and queue a new transfer after a previously saved region is removed on the device", async () => {
    const view = show({ regions: [north] });
    add("n");
    await startDownloads();
    await waitFor(() => expect(status()).toContain("1 of 1 saved."));
    view.update({ regions: [{ ...north, downloaded: true }] });
    click("Remove saved entries from the list");
    expect(picker().disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Region download queue" }));
    view.update({ regions: [north] });
    add("n");
    await startDownloads();
    await waitFor(() => expect(view.download).toHaveBeenCalledTimes(2));
  });
});

describe("coordinating with other page operations", () => {
  it("allows preparing regions while the page is busy and waits for a start after release", () => {
    const view = show({ busy: true });
    add("e");
    expect(button("Start downloads").disabled).toBe(true);
    expect(screen.getByText(/Another operation is using the region packs/)).toBeTruthy();
    view.update({ busy: false });
    expect(screen.queryByText(/Another operation is using the region packs/)).toBeNull();
    expect(button("Start downloads").disabled).toBe(false);
    expect(view.runBatch).not.toHaveBeenCalled();
  });

  it("preserves the list after the parent declines a reservation, then allows a manual start", async () => {
    const runBatch = vi.fn<QueuePanelProps["runBatch"]>()
      .mockResolvedValueOnce(false)
      .mockImplementation(async (task) => { await task(); return true; });
    const view = show({ runBatch });
    add("n");
    await startDownloads();
    await waitFor(() => expect(status()).toContain("Another operation"));
    expect(view.download).not.toHaveBeenCalled();
    expect(rowLabels()).toEqual(["North"]);
    await startDownloads();
    await waitFor(() => expect(status()).toContain("1 of 1 saved."));
    expect(runBatch).toHaveBeenCalledTimes(2);
  });

  it("keeps a rejected reservation error out of the public announcement", async () => {
    const runBatch = vi.fn<QueuePanelProps["runBatch"]>().mockRejectedValue(new Error("internal device detail"));
    const view = show({ runBatch });
    add("n");
    await startDownloads();
    await waitFor(() => expect(status()).toContain("The queue could not start."));
    expect(document.body.textContent).not.toContain("internal device detail");
    expect(button("Start downloads").disabled).toBe(false);
    expect(view.download).not.toHaveBeenCalled();
  });

  it("rejects late admission after disconnected and reconnected while waiting", async () => {
    const permit = deferred<boolean>();
    const runBatch = vi.fn<QueuePanelProps["runBatch"]>(async (task) => {
      const accepted = await permit.promise;
      if (accepted) await task();
      return accepted;
    });
    const view = show({ runBatch });
    add("s");
    await startDownloads();
    expect(status()).toContain("Waiting to start");
    expect(button("Start downloads").disabled).toBe(true);
    view.update({ online: false });
    view.update({ online: true });
    await act(async () => { permit.resolve(true); });
    expect(view.download).not.toHaveBeenCalled();
    expect(button("Start downloads").disabled).toBe(false);
    expect(rowLabels()).toEqual(["South"]);
  });

  it("does not execute a reservation that arrives after the reader has closed the queue", async () => {
    const permit = deferred<boolean>();
    const runBatch: QueuePanelProps["runBatch"] = async (task) => {
      if (!await permit.promise) return false;
      await task();
      return true;
    };
    const view = show({ runBatch });
    add("e");
    await startDownloads();
    view.unmount();
    await act(async () => { permit.resolve(true); });
    expect(view.download).not.toHaveBeenCalled();
  });
});

describe("language and accessible status during a batch", () => {
  it("keeps region order, active work, and control identity while the language changes", async () => {
    const gate = deferred<QueueOutcome>();
    const download = vi.fn<Download>().mockReturnValueOnce(gate.promise).mockResolvedValue("complete");
    const view = show({ download });
    add("s");
    add("n");
    await startDownloads();
    const primary = button("Pause queue");
    primary.focus();
    view.update({ language: "fr", regions: [
      { ...north, label: "Nord" }, { ...south, label: "Sud" }, { ...east, label: "Est" },
    ] });
    expect(screen.getByRole("region", { name: "File de téléchargement des régions" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Régions dans la file" })).toBe(list());
    expect(screen.getByRole("combobox", { name: "Région à ajouter" })).toBe(picker());
    expect(button("Suspendre la file")).toBe(document.activeElement);
    expect(rowLabels()).toEqual(["Sud", "Nord"]);
    expect(status()).toContain("Téléchargement en cours\u00a0: Sud.");
    expect(button("Déplacer Nord vers le haut").disabled).toBe(true);
    await settle(gate, "quota");
    expect(status()).toContain("La file s’est arrêtée à la région Sud.");
    expect(status()).toContain("Espace de stockage insuffisant.");
    click("Reprendre les téléchargements");
    await waitFor(() => expect(status()).toContain("Régions enregistrées\u00a0: 2 sur 2."));
    expect(rows()[1]!.textContent).toContain("Enregistrée");
    expect(download.mock.calls.map(([id]) => id)).toEqual(["s", "s", "n"]);
  });

  it("supports preparing, reordering and removing entries entirely in French", () => {
    const view = show({ language: "fr", online: false, regions: [
      { ...north, label: "Nord" }, { ...east, label: "Est" },
    ] });
    expect(screen.getByRole("status", { name: "État de la file de téléchargement" }).textContent).toBe("La file est vide.");
    add("n", "Ajouter à la file");
    add("e", "Ajouter à la file");
    click("Déplacer Est vers le haut");
    expect(document.activeElement?.textContent).toBe("Est");
    click("Retirer Est de la file");
    expect(rowLabels()).toEqual(["Nord"]);
    expect(button("Lancer les téléchargements").disabled).toBe(true);
    expect(view.runBatch).not.toHaveBeenCalled();
  });
});
