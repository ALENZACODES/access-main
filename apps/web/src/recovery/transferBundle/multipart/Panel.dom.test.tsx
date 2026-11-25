/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as downloads from "../../../states/downloadFile";
import { packetWith } from "../bundleTestSupport";
import { inspectMember } from "../model";
import { createTransferSet } from "./model";
import { MultipartTransferPanel } from "./Panel";

// jsdom's Blob has only the older FileReader interface; the panel reads files
// with arrayBuffer() and text(), as browsers do.
function readWithFileReader(blob: Blob, mode: "buffer" | "text"): Promise<ArrayBuffer | string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer | string);
    reader.onerror = () => reject(reader.error);
    if (mode === "buffer") reader.readAsArrayBuffer(blob); else reader.readAsText(blob);
  });
}
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value(this: Blob) { return readWithFileReader(this, "buffer"); },
  });
}
if (typeof Blob.prototype.text !== "function") {
  Object.defineProperty(Blob.prototype, "text", {
    configurable: true,
    value(this: Blob) { return readWithFileReader(this, "text"); },
  });
}

async function exportFile(note: string, name = "export.json"): Promise<File> {
  return new File([JSON.stringify(packetWith(note))], name, { type: "application/json" });
}

async function noAxeViolations(container: HTMLElement): Promise<void> {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  expect(result.violations).toEqual([]);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-part transfer panel in English and French", () => {
  it.each(["en", "fr"] as const)("announces a plan and creates a checked transfer set (%s)", async locale => {
    vi.stubGlobal("crypto", webcrypto);
    const download = vi.spyOn(downloads, "saveBlobFile").mockReturnValue(true);
    const { container } = render(<main><h1>Recovery</h1><MultipartTransferPanel locale={locale} /></main>);
    const input = screen.getByLabelText(locale === "en"
      ? "Choose two or more recovery JSON exports"
      : "Choisir au moins deux fichiers JSON de récupération");
    const files = await Promise.all(Array.from({ length: 13 }, (_, index) => exportFile(`private note ${index}`, `export-${index}.json`)));
    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(screen.getByText(/12 exports|12 fichiers exportés/u)).toBeTruthy());
    await noAxeViolations(container);
    const create = screen.getByRole("button", { name: locale === "en" ? "Create multi-part transfer" : "Créer un transfert en plusieurs parties" });
    expect(create.style.minHeight).toBe("44px");
    expect(create.style.minWidth).toBe("44px");
    fireEvent.click(create);
    await screen.findByText(locale === "en"
      ? "Multi-part transfer file is ready to save."
      : "Le fichier de transfert en plusieurs parties est prêt à enregistrer.");
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[1]).toBe("recovery-transfer-set.rxs");
    expect(screen.getByText(/Transfer set fingerprint|Empreinte de l’ensemble de transfert/u)).toBeTruthy();
    await noAxeViolations(container);
  });

  it("opens a complete set and exposes individual originals only after all parts pass", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const members = [];
    for (let index = 0; index < 13; index++) {
      members.push(await inspectMember(new Blob([JSON.stringify(packetWith(`original-${index}`))])));
    }
    const goodMembers = members.map(result => {
      if (!result.ok) throw new Error(result.problem.code);
      return result.value;
    });
    const set = await createTransferSet(goodMembers);
    if (!set.ok) throw new Error(set.problem.code);
    const save = vi.spyOn(downloads, "saveBlobFile").mockReturnValue(true);
    render(<main><h1>Recovery</h1><MultipartTransferPanel locale="en" /></main>);
    const picker = screen.getByLabelText("Choose a multi-part transfer file.");
    const file = new File([await set.value.arrayBuffer()], "case.rxs", { type: "application/json" });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(await screen.findByText("All parts passed their checks. Individual exports are available below.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Save original export/u })).toHaveLength(13);
    fireEvent.click(screen.getByRole("button", { name: "Save original export 1" }));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^recovery-export-1-/u));
    fireEvent.click(screen.getByRole("button", { name: "Save ordinary bundle part 2" }));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^recovery-part-2-/u));
  });

  it("reports an invalid transfer set and allows a subsequent valid selection", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<main><h1>Recovery</h1><MultipartTransferPanel locale="fr" /></main>);
    const picker = screen.getByLabelText("Choisissez un fichier de transfert en plusieurs parties.");
    fireEvent.change(picker, { target: { files: [new File(["{}"], "bad.rxs")] } });
    expect(await screen.findByText("La structure du fichier de transfert est invalide.")).toBeTruthy();
    const members = [];
    for (let index = 0; index < 13; index++) {
      const result = await inspectMember(new Blob([JSON.stringify(packetWith(`retry-${index}`))]));
      if (!result.ok) throw new Error(result.problem.code);
      members.push(result.value);
    }
    const set = await createTransferSet(members);
    if (!set.ok) throw new Error(set.problem.code);
    fireEvent.change(picker, { target: { files: [new File([await set.value.arrayBuffer()], "good.rxs")] } });
    expect(await screen.findByText("Toutes les parties ont passé les contrôles. Les fichiers exportés individuels sont disponibles ci-dessous.")).toBeTruthy();
  });

  it("clears the selected plan and returns focus to the first picker", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<main><h1>Recovery</h1><MultipartTransferPanel locale="en" /></main>);
    const input = screen.getByLabelText("Choose two or more recovery JSON exports");
    const files = await Promise.all([exportFile("one"), exportFile("two"), ...Array.from({ length: 11 }, (_, index) => exportFile(`more-${index}`))]);
    fireEvent.change(input, { target: { files } });
    await screen.findByText(/12 exports/u);
    fireEvent.click(screen.getByRole("button", { name: "Clear multi-part selection" }));
    expect(screen.getByRole("status").textContent).toBe("Selection cleared.");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByText(/Transfer plan/u)).toBeNull();
  });

  it("cancels a delayed file read without allowing it to repopulate the draft", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<main><h1>Recovery</h1><MultipartTransferPanel locale="en" /></main>);
    const picker = screen.getByLabelText("Choose two or more recovery JSON exports");
    const slow = await exportFile("slow");
    const originalRead = slow.arrayBuffer.bind(slow);
    let release!: (buffer: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>(resolve => { release = resolve; });
    Object.defineProperty(slow, "arrayBuffer", { value: () => pending });
    fireEvent.change(picker, { target: { files: [slow, await exportFile("second")] } });
    expect(await screen.findByText("Checking selected exports…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { release(await originalRead()); await pending; });
    expect(screen.getByRole("status").textContent).toBe("Selection cleared.");
    expect(screen.queryByText(/Transfer plan/u)).toBeNull();
  });

  it("ignores a delayed earlier selection after a newer selection completes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    render(<main><h1>Recovery</h1><MultipartTransferPanel locale="en" /></main>);
    const picker = screen.getByLabelText("Choose two or more recovery JSON exports");
    const slow = await exportFile("old-selection");
    const originalRead = slow.arrayBuffer.bind(slow);
    let release!: (buffer: ArrayBuffer) => void;
    const pending = new Promise<ArrayBuffer>(resolve => { release = resolve; });
    Object.defineProperty(slow, "arrayBuffer", { value: () => pending });
    fireEvent.change(picker, { target: { files: [slow, await exportFile("old-second")] } });
    fireEvent.change(picker, { target: { files: await Promise.all(Array.from({ length: 13 }, (_, index) => exportFile(`new-${index}`))) } });
    await screen.findByText(/12 exports/u);
    await act(async () => { release(await originalRead()); await pending; });
    expect(screen.getByText(/13 exports/u)).toBeTruthy();
    expect(screen.getByText(/Transfer plan/u)).toBeTruthy();
  });

  it("compares a separate receipt and distinguishes a mismatch", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const members = [];
    for (let index = 0; index < 13; index++) {
      const result = await inspectMember(new Blob([JSON.stringify(packetWith(`receipt-${index}`))]));
      if (!result.ok) throw new Error(result.problem.code);
      members.push(result.value);
    }
    const set = await createTransferSet(members);
    if (!set.ok) throw new Error(set.problem.code);
    const opened = new File([await set.value.arrayBuffer()], "open.rxs");
    const download = vi.spyOn(downloads, "saveBlobFile").mockReturnValue(true);
    const { container } = render(<main><h1>Recovery</h1><MultipartTransferPanel locale="en" /></main>);
    fireEvent.change(screen.getByLabelText("Choose a multi-part transfer file."), { target: { files: [opened] } });
    await screen.findByText("All parts passed their checks. Individual exports are available below.");
    const receiptInput = screen.getByLabelText("Choose a separate counts-only receipt");
    const mismatched = JSON.stringify({
      schema: "the-app.recovery-transfer-set-receipt.v1", setId: "0".repeat(64),
      partCount: 2, memberCount: 13, byteLength: 1,
      parts: [],
    });
    fireEvent.change(receiptInput, { target: { files: [new File([mismatched], "receipt.json")] } });
    expect(await screen.findByText("The receipt format is invalid.")).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
    await noAxeViolations(container);
  });
});
