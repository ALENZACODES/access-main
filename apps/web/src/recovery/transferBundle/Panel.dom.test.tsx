/** @vitest-environment jsdom */
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as downloads from "../../states/downloadFile";
import { emptyReceiptDocument } from "../recoveryReceiptLedger";
import { RecoveryTransferBundlePanel } from "./Panel";
import { packetWith, wireEntry } from "./bundleTestSupport";
import { bundleCopy } from "./copy";
import * as model from "./model";

const first = JSON.stringify(packetWith("Test A"));
const second = JSON.stringify(packetWith("Test B"));
const receipt = JSON.stringify(emptyReceiptDocument());

function jsonFile(text: string, name = "example.json"): File {
  const file = new File([text], name, { type: "application/json" });
  // jsdom's file picker supplies a Blob with the older FileReader interface.
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: vi.fn(async () => new TextEncoder().encode(text).buffer),
  });
  return file;
}

function delayedFile(text: string) {
  let finish!: () => void;
  const pending = new Promise<ArrayBuffer>(resolve => {
    finish = () => resolve(new TextEncoder().encode(text).buffer);
  });
  const file = jsonFile(text);
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn(() => pending) });
  return { finish, file };
}

function bundleText(...contents: string[]) {
  const entries = contents.map(content => wireEntry(content, content === receipt ? "receipt" : "packet"));
  return JSON.stringify({ schema: model.BUNDLE_SCHEMA, entries });
}

function pick(label: string, ...files: File[]) {
  const input = screen.getByLabelText<HTMLInputElement>(label, { exact: true });
  fireEvent.change(input, { target: { files } });
  return input;
}

function button(label: string) {
  return screen.getByRole<HTMLButtonElement>("button", { name: label });
}

function list(label: string) {
  return screen.getByRole("list", { name: label });
}

const { en, fr } = bundleCopy;

function add(...files: File[]) {
  return pick(en.chooseExports, ...files);
}

function open(...files: File[]) {
  return pick(en.chooseBundle, ...files);
}

function draftRows() {
  return within(list(en.draftList)).getAllByRole("listitem");
}

function openedRows() {
  return within(list(en.openedList)).getAllByRole("listitem");
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

function statusFor(label: string) {
  const region = screen.getByRole("region", { name: label });
  return within(region).getAllByRole("status")[0]!;
}

beforeEach(() => {
  // Use Node's real SHA-256 implementation with a view from its realm.
  vi.stubGlobal("crypto", {
    subtle: {
      digest: (algorithm: string, bytes: ArrayBuffer) =>
        webcrypto.subtle.digest(algorithm, Buffer.from(new Uint8Array(bytes))),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recovery transfer bundle file selection", () => {
  it.each(["en", "fr"] as const)("labels both pickers and their instructions in %s", locale => {
    const copy = bundleCopy[locale];
    render(<RecoveryTransferBundlePanel locale={locale} />);
    const panel = screen.getByRole("region", { name: copy.title });
    expect(panel.lang).toBe(locale);
    expect(within(panel).getByRole("heading", { name: copy.compose }).tagName).toBe("H3");
    expect(within(panel).getByRole("heading", { name: copy.inspect }).tagName).toBe("H3");
    const addPicker = screen.getByLabelText<HTMLInputElement>(copy.chooseExports);
    const openPicker = screen.getByLabelText<HTMLInputElement>(copy.chooseBundle);
    expect(addPicker.multiple).toBe(true);
    expect(openPicker.multiple).toBe(false);
    expect(addPicker.type).toBe("file");
    expect(openPicker.accept).toContain(".json");
    for (const picker of [addPicker, openPicker]) {
      const [help, status] = picker.getAttribute("aria-describedby")!.split(" ");
      expect(document.getElementById(help!)?.textContent?.length).toBeGreaterThan(20);
      expect(document.getElementById(status!)?.getAttribute("role")).toBe("status");
    }
    expect(button(copy.saveBundle).disabled).toBe(true);
    expect(button(copy.clearDraft).disabled).toBe(true);
    expect(screen.getByText(copy.privacy)).toBeTruthy();
    expect(screen.getByText(copy.openHelp)).toBeTruthy();
    fireEvent.click(screen.getByText(copy.allowed));
    for (const kind of Object.values(copy.kindLabels)) expect(screen.getByText(kind)).toBeTruthy();
  });

  it("stages a batch in selection order and shows only its kind, counts and fingerprint", async () => {
    const view = render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first, "private-file-name.json"), jsonFile(receipt));
    await screen.findByText("Selection: 2 files.");
    const [packet, receipts] = draftRows();
    expect(packet?.textContent).toContain("File 1 — Recovery evidence packet");
    expect(packet?.textContent).toContain("2 records");
    expect(packet?.textContent).toContain(new TextEncoder().encode(first).length + " bytes");
    expect(receipts?.textContent).toContain("File 2 — Handoff receipts");
    expect(receipts?.textContent).toContain("0 records");
    expect(view.container.textContent).not.toContain("private-file-name");
    expect(view.container.textContent).not.toContain("Test A");
    const details = packet!.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(within(packet!).getByLabelText("SHA-256 fingerprint — File 1"));
    expect(details.open).toBe(true);
    expect(details.querySelector("code")?.textContent).toBe(wireEntry(first).digest);
    expect(button(en.saveBundle).disabled).toBe(false);
  });

  it("commits no part of a failing batch and associates its problem with the native picker", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first));
    await screen.findByText("Selection: 1 file.");
    const input = add(jsonFile(second), jsonFile('{"schema":"example"}'));
    await screen.findByText("File 3. " + en.problems["native-format"]);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(statusFor(en.compose).id);
    expect(draftRows()).toHaveLength(1);
    expect(draftRows()[0]?.querySelector("code")?.textContent).toBe(wireEntry(first).digest);
    add(jsonFile(receipt));
    await screen.findByText("Selection: 2 files.");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(draftRows()[1]?.textContent).toContain("Handoff receipts");
  });

  it("keeps one copy when different filenames contain identical bytes", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first, "a.json"));
    await screen.findByText("Selection: 1 file.");
    add(jsonFile(first, "b.json"));
    await screen.findByText("File 2. " + en.problems.duplicate);
    expect(draftRows()).toHaveLength(1);
    fireEvent.click(button(en.clearDraft));
    expect(screen.queryByRole("list", { name: en.draftList })).toBeNull();
    add(jsonFile(first, "b.json"));
    await screen.findByText("Selection: 1 file.");
  });

  it("checks the total file count and byte limit before reading any of the batch", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first));
    await screen.findByText("Selection: 1 file.");
    const files = Array.from({ length: model.BUNDLE_LIMITS.members }, () => jsonFile(second));
    add(...files);
    expect(statusFor(en.compose).textContent).toBe(en.problems["member-count"]);
    files.forEach(file => expect(file.arrayBuffer).not.toHaveBeenCalled());
    const tooLarge = jsonFile("");
    Object.defineProperty(tooLarge, "size", { value: model.BUNDLE_LIMITS.totalBytes });
    add(tooLarge);
    expect(statusFor(en.compose).textContent).toBe(en.problems["total-size"]);
    expect(tooLarge.arrayBuffer).not.toHaveBeenCalled();
    expect(draftRows()).toHaveLength(1);
  });

  it("does not expose a partly processed batch and cancels back to the prior draft", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(receipt));
    await screen.findByText("Selection: 1 file.");
    const slow = delayedFile(second);
    const spy = vi.spyOn(model, "inspectMember");
    const picker = add(jsonFile(first), slow.file, jsonFile("unread"));
    await screen.findByText("Checking file 2 of 3…");
    expect(draftRows()).toHaveLength(1);
    expect(button("Remove file 1").disabled).toBe(true);
    expect(button(en.saveBundle).disabled).toBe(true);
    fireEvent.click(button(en.cancelAdd));
    expect(document.activeElement).toBe(picker);
    expect(statusFor(en.compose).textContent).toBe(en.cancelled);
    await act(async () => {
      slow.finish();
      await spy.mock.results[1]?.value;
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(draftRows()).toHaveLength(1);
    expect(button(en.saveBundle).disabled).toBe(false);
  });

  it("supersedes a slow selection even when the next selection fails preflight", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const spy = vi.spyOn(model, "inspectMember");
    const slow = delayedFile(first);
    add(slow.file, jsonFile(second));
    add(...Array.from({ length: model.BUNDLE_LIMITS.members + 1 }, () => jsonFile(receipt)));
    expect(statusFor(en.compose).textContent).toBe(en.problems["member-count"]);
    await act(async () => {
      slow.finish();
      await spy.mock.results[0]?.value;
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("list", { name: en.draftList })).toBeNull();
    expect(statusFor(en.compose).textContent).toBe(en.problems["member-count"]);
  });

  it("returns focus to the file picker when a focused Cancel control disappears", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const slow = delayedFile(first);
    const picker = add(slow.file);
    button(en.cancelAdd).focus();
    slow.finish();
    await screen.findByText("Selection: 1 file.");
    expect(document.activeElement).toBe(picker);
    const bad = delayedFile("bad");
    const openPicker = open(bad.file);
    button(en.cancelOpen).focus();
    bad.finish();
    await screen.findByText(en.problems.envelope);
    expect(document.activeElement).toBe(openPicker);
  });

  it("finishes a file check without stealing focus from another control", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const slow = delayedFile(second);
    add(slow.file);
    const other = screen.getByLabelText<HTMLInputElement>(en.chooseBundle);
    other.focus();
    slow.finish();
    await screen.findByText("Selection: 1 file.");
    expect(document.activeElement).toBe(other);
  });

  it("clears committed and pending additions together", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(receipt));
    await screen.findByText("Selection: 1 file.");
    const spy = vi.spyOn(model, "inspectMember");
    const slow = delayedFile(second);
    const picker = add(slow.file);
    fireEvent.click(button(en.clearDraft));
    expect(document.activeElement).toBe(picker);
    await act(async () => {
      slow.finish();
      await spy.mock.results[0]?.value;
    });
    expect(statusFor(en.compose).textContent).toBe(en.cleared);
    expect(button(en.saveBundle).disabled).toBe(true);
  });

  it("moves focus to the surviving neighbour and finally back to the picker after removal", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const picker = add(jsonFile(first), jsonFile(second), jsonFile(receipt));
    await screen.findByText("Selection: 3 files.");
    const last = button("Remove file 3");
    const firstButton = button("Remove file 1");
    const middle = button("Remove file 2");
    middle.focus();
    fireEvent.click(middle);
    expect(document.activeElement).toBe(last);
    expect(last.textContent).toBe("Remove file 2");
    expect(draftRows()[1]?.textContent).toContain("File 2 — Handoff receipts");
    fireEvent.click(last);
    expect(document.activeElement).toBe(firstButton);
    fireEvent.click(firstButton);
    expect(document.activeElement).toBe(picker);
    expect(screen.queryByRole("list", { name: en.draftList })).toBeNull();
    expect(button(en.clearDraft).disabled).toBe(true);
  });
});

describe("recovery transfer bundle inspection and downloads", () => {
  it("saves a complete bundle, opens it and extracts the byte-identical originals", async () => {
    const save = vi.spyOn(downloads, "saveBlobFile").mockReturnValue(true);
    render(<RecoveryTransferBundlePanel locale="en" />);
    const content = "\uFEFF" + JSON.stringify(packetWith("Été"), null, 2).replaceAll("\n", "\r\n") + "\r\n";
    add(jsonFile(content, "source-private-name.json"), jsonFile(receipt));
    await screen.findByText("Selection: 2 files.");
    fireEvent.click(button(en.saveBundle));
    expect(statusFor(en.compose).textContent).toBe(en.savedBundle);
    const [bundle, name] = save.mock.calls[0]!;
    expect(name).toBe("recovery-transfer-bundle.json");
    const text = new TextDecoder().decode(await readBytes(bundle));
    expect(text).not.toContain("source-private-name");
    open(jsonFile(text));
    await screen.findByText("Bundle opened: 2 files.");
    expect(openedRows()[1]?.textContent).toContain("File 2 — Handoff receipts");
    fireEvent.click(button("Save file 2"));
    fireEvent.click(button("Save file 1"));
    const [receiptFile, receiptName] = save.mock.calls[1]!;
    const [packetFile, packetName] = save.mock.calls[2]!;
    expect(receiptName).toBe("recovery-02-receipt.json");
    expect(packetName).toBe("recovery-01-packet.json");
    expect(Array.from(await readBytes(packetFile))).toEqual(Array.from(new TextEncoder().encode(content)));
    expect(Array.from(await readBytes(receiptFile))).toEqual(Array.from(new TextEncoder().encode(receipt)));
    expect(statusFor(en.inspect).textContent).toBe("File 1 ready to download.");
  });

  it("invalidates the old results immediately and exposes nothing from a damaged replacement", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    open(jsonFile(bundleText(first)));
    await screen.findByText("Bundle opened: 1 file.");
    const bad = { ...wireEntry(second), digest: "0".repeat(64) };
    const damaged = delayedFile(JSON.stringify({ schema: model.BUNDLE_SCHEMA, entries: [wireEntry(first), bad] }));
    const picker = open(damaged.file);
    expect(screen.queryByRole("list", { name: en.openedList })).toBeNull();
    expect(statusFor(en.inspect).textContent).toBe(en.checking);
    expect(screen.queryByRole("button", { name: "Save file 1" })).toBeNull();
    damaged.finish();
    await screen.findByText("File 2. " + en.problems.integrity);
    expect(picker.getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("list", { name: en.openedList })).toBeNull();
  });

  it("keeps the newer opened bundle when an earlier read succeeds later", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const spy = vi.spyOn(model, "openBundle");
    const slow = delayedFile(bundleText(first));
    open(slow.file);
    open(jsonFile(bundleText(receipt)));
    await screen.findByText("Bundle opened: 1 file.");
    await act(async () => {
      slow.finish();
      await spy.mock.results[0]?.value;
    });
    expect(openedRows()[0]?.textContent).toContain("Handoff receipts");
    expect(openedRows()[0]?.querySelector("code")?.textContent).toBe(wireEntry(receipt).digest);
  });

  it("can cancel opening a bundle and retry the same file", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    const slow = delayedFile(bundleText(second));
    const spy = vi.spyOn(model, "openBundle");
    const picker = open(slow.file);
    fireEvent.click(button(en.cancelOpen));
    expect(document.activeElement).toBe(picker);
    expect(statusFor(en.inspect).textContent).toBe(en.cancelled);
    await act(async () => {
      slow.finish();
      await spy.mock.results[0]?.value;
    });
    expect(screen.queryByRole("list", { name: en.openedList })).toBeNull();
    open(slow.file);
    await screen.findByText("Bundle opened: 1 file.");
    fireEvent.click(button(en.closeBundle));
    expect(statusFor(en.inspect).textContent).toBe(en.closed);
    expect(document.activeElement).toBe(picker);
  });

  it("handles a rejected file read and a cancelled native picker without losing the draft", async () => {
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first));
    await screen.findByText("Selection: 1 file.");
    add();
    expect(draftRows()).toHaveLength(1);
    const unreadable = jsonFile(second);
    Object.defineProperty(unreadable, "arrayBuffer", {
      value: () => Promise.reject(new Error("disk read failed")),
    });
    open(unreadable);
    await screen.findByText(en.problems.read);
    expect(draftRows()).toHaveLength(1);
    open(jsonFile(bundleText(receipt)));
    await screen.findByText("Bundle opened: 1 file.");
    open();
    expect(openedRows()).toHaveLength(1);
    fireEvent.click(button(en.clearDraft));
    expect(openedRows()).toHaveLength(1);
  });

  it("reports failed bundle and member downloads without discarding the selection", async () => {
    const save = vi.spyOn(downloads, "saveBlobFile").mockReturnValue(false);
    render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(second));
    open(jsonFile(bundleText(receipt)));
    await screen.findByText("Bundle opened: 1 file.");
    await screen.findByText("Selection: 1 file.");
    fireEvent.click(button(en.saveBundle));
    expect(statusFor(en.compose).textContent).toBe(en.saveFailed);
    save.mockImplementationOnce(() => { throw new Error("download blocked"); });
    fireEvent.click(button("Save file 1"));
    expect(statusFor(en.inspect).textContent).toBe(en.saveFailed);
    expect(draftRows()).toHaveLength(1);
    expect(openedRows()).toHaveLength(1);
    save.mockReturnValue(true);
    fireEvent.click(button("Save file 1"));
    expect(statusFor(en.inspect).textContent).toBe("File 1 ready to download.");
  });

  it("translates the existing statuses, controls and counts when the language changes", async () => {
    const view = render(<RecoveryTransferBundlePanel locale="en" />);
    add(jsonFile(first), jsonFile(second));
    open(jsonFile("wrong format"));
    await screen.findByText("Selection: 2 files.");
    await screen.findByText(en.problems.envelope);
    view.rerender(<RecoveryTransferBundlePanel locale="fr" />);
    expect(statusFor(fr.compose).textContent).toBe("Sélection\u00a0: 2 fichiers.");
    expect(statusFor(fr.inspect).textContent).toBe(fr.problems.envelope);
    expect(list(fr.draftList).textContent).toContain("2 enregistrements");
    expect(button("Retirer le fichier 1").textContent).toBe("Retirer le fichier 1");
    pick(fr.chooseBundle, jsonFile(bundleText(receipt)));
    await screen.findByRole("button", { name: "Enregistrer le fichier 1" });
    expect(statusFor(fr.inspect).textContent).toBe("Lot ouvert\u00a0: 1 fichier.");
    expect(button("Enregistrer le fichier 1").disabled).toBe(false);
    expect(screen.queryByText(en.problems.envelope)).toBeNull();
  });

  it("abandons remaining batch reads after the panel is unmounted", async () => {
    const view = render(<RecoveryTransferBundlePanel locale="en" />);
    const spy = vi.spyOn(model, "inspectMember");
    const slow = delayedFile(first);
    const untouched = jsonFile(second);
    add(slow.file, untouched);
    view.unmount();
    await act(async () => {
      slow.finish();
      await spy.mock.results[0]?.value;
    });
    expect(untouched.arrayBuffer).not.toHaveBeenCalled();
    render(<RecoveryTransferBundlePanel locale="en" />);
    expect(button(en.saveBundle).disabled).toBe(true);
    expect(screen.queryByRole("list", { name: en.draftList })).toBeNull();
  });
});
