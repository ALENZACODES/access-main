/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as downloads from "../../states/downloadFile";
import type { PackingList } from "./model";
import { PackingTransfer } from "./PackingTransfer";
import { BACKUP_BYTE_LIMIT } from "./transfer";

const openList: PackingList = {
  schema: "offline-packing-list-v1",
  title: "Friday list",
  bags: [{
    id: "bag-1",
    name: "Everyday bag",
    items: [{ id: "cable", name: "Cable", quantity: 3, packed: 2, returned: null, note: "Side pocket" }],
  }],
};

const backup: PackingList = {
  ...openList,
  title: "Train trip",
  bags: [...openList.bags, { id: "bag-2", name: "Spare bag", items: [] }],
};

function bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function fileWithRead(read: () => Promise<ArrayBuffer>) {
  const file = new File([], "packing-list.json", { type: "application/json" });
  Object.defineProperty(file, "arrayBuffer", { value: read });
  return file;
}

function jsonFile(list: PackingList = backup) {
  return fileWithRead(async () => bytes(JSON.stringify(list)));
}

function choose(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

function deferredFile() {
  let finish: (text: string) => void;
  const file = fileWithRead(() => new Promise<ArrayBuffer>(resolve => {
    finish = (text: string) => { resolve(bytes(text)); };
  }));
  return { file, finish: (text: string) => finish(text) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("reviewing a packing backup", () => {
  it("shows the title and separate counts before replacing the list", async () => {
    const restore = vi.fn();
    render(<PackingTransfer list={openList} language="en" onRestore={restore} />);
    const input = screen.getByLabelText("Choose a packing backup");
    expect(screen.queryByRole("button", { name: "Replace current list" })).toBeNull();
    choose(input, jsonFile());

    const apply = await screen.findByRole("button", { name: "Replace current list" });
    for (const [label, value] of [
      ["List name", "Train trip"],
      ["Bags", "2"],
      ["Item entries", "1"],
      ["Units planned", "3"],
    ] as const) {
      expect(screen.getByText(label).nextElementSibling?.textContent).toBe(value);
    }
    expect(screen.getByRole("status").textContent).toBe("Review the backup");
    expect(screen.getByText(/replaces the list currently open/)).toBeTruthy();
    expect(restore).not.toHaveBeenCalled();

    fireEvent.click(apply);
    expect(restore.mock.calls).toEqual([[backup]]);
    expect(screen.getByRole("status").textContent).toBe("Packing list restored.");
    expect(screen.queryByText("Train trip")).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("can cancel in French and select the same file again", async () => {
    const restore = vi.fn();
    render(<PackingTransfer list={openList} language="fr" onRestore={restore} />);
    const input = screen.getByLabelText("Choisir une copie de la liste");
    const file = jsonFile();
    choose(input, file);
    fireEvent.click(await screen.findByRole("button", { name: "Annuler la restauration" }));
    expect(restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("status").textContent).toBe("La restauration a été annulée.");

    choose(input, file);
    const apply = await screen.findByRole("button", { name: "Remplacer la liste actuelle" });
    expect(screen.getByText("Unités prévues").nextElementSibling?.textContent).toBe("3");
    fireEvent.click(apply);
    expect(restore).toHaveBeenCalledWith(backup);
    expect(screen.getByRole("status").textContent).toBe("La liste a été restaurée.");
  });

  it("removes a previous preview when a new file is invalid and can recover", async () => {
    const restore = vi.fn();
    render(<PackingTransfer list={openList} language="en" onRestore={restore} />);
    const input = screen.getByLabelText("Choose a packing backup");
    choose(input, jsonFile());
    await screen.findByText("Train trip");
    choose(input, fileWithRead(async () => bytes('{"bags":[]}')));
    await screen.findByText("Choose a complete packing list backup in the supported JSON format.");
    expect(screen.queryByText("Train trip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Replace current list" })).toBeNull();
    expect(restore).not.toHaveBeenCalled();

    choose(input, jsonFile({ ...backup, title: "New trip" }));
    await screen.findByText("New trip");
    fireEvent.click(screen.getByRole("button", { name: "Replace current list" }));
    expect(restore).toHaveBeenCalledWith({ ...backup, title: "New trip" });
  });

  it("gives a size message in French before reading a large file", async () => {
    const read = vi.fn(async () => bytes("{}"));
    const file = fileWithRead(read);
    Object.defineProperty(file, "size", { value: BACKUP_BYTE_LIMIT + 1 });
    render(<PackingTransfer list={openList} language="fr" onRestore={vi.fn()} />);
    choose(screen.getByLabelText("Choisir une copie de la liste"), file);
    await screen.findByText("La taille maximale du fichier est de 2 Mio.");
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Remplacer la liste actuelle" })).toBeNull();
  });

  it("shows the most recent selection even if an earlier read finishes last", async () => {
    const first = deferredFile();
    const restore = vi.fn();
    render(<PackingTransfer list={openList} language="en" onRestore={restore} />);
    const input = screen.getByLabelText("Choose a packing backup");
    choose(input, first.file);
    expect(screen.getByRole("status").textContent).toBe("Reading the backup…");
    choose(input, jsonFile());
    await screen.findByText("Train trip");
    await act(async () => { first.finish("invalid"); });
    expect(screen.getByRole("status").textContent).toBe("Review the backup");
    fireEvent.click(screen.getByRole("button", { name: "Replace current list" }));
    expect(restore.mock.calls).toEqual([[backup]]);
  });

  it.each(["during the read", "after opening the preview"])(
    "protects list edits made %s and allows a fresh review",
    async (when) => {
      const pending = deferredFile();
      const restore = vi.fn();
      const { rerender } = render(<PackingTransfer list={openList} language="en" onRestore={restore} />);
      const input = screen.getByLabelText("Choose a packing backup");
      choose(input, pending.file);
      if (when === "after opening the preview") {
        await act(async () => { pending.finish(JSON.stringify(backup)); });
        await screen.findByText("Train trip");
      }
      rerender(<PackingTransfer list={{ ...openList, title: "Edited list" }} language="en" onRestore={restore} />);
      if (when === "during the read") {
        await act(async () => { pending.finish(JSON.stringify(backup)); });
      }
      expect(screen.getByRole("status").textContent).toContain("Your list changed");
      expect(screen.queryByRole("button", { name: "Replace current list" })).toBeNull();
      expect(restore).not.toHaveBeenCalled();

      choose(input, jsonFile());
      fireEvent.click(await screen.findByRole("button", { name: "Replace current list" }));
      expect(restore).toHaveBeenCalledWith(backup);
    },
  );

  it("updates the review controls when the language changes", async () => {
    const restore = vi.fn();
    const { rerender } = render(<PackingTransfer list={openList} language="en" onRestore={restore} />);
    choose(screen.getByLabelText("Choose a packing backup"), jsonFile());
    await screen.findByText("Train trip");
    rerender(<PackingTransfer list={openList} language="fr" onRestore={restore} />);
    expect(screen.getByRole("status").textContent).toBe("Examiner la copie");
    expect(screen.getByText("Nom de la liste").nextElementSibling?.textContent).toBe("Train trip");
    fireEvent.click(screen.getByRole("button", { name: "Remplacer la liste actuelle" }));
    expect(restore).toHaveBeenCalledWith(backup);
  });
});

describe("saving a packing list", () => {
  it("gives the browser a complete backup and an independent, notes-optional text copy", () => {
    const save = vi.spyOn(downloads, "saveTextFile").mockReturnValue(true);
    render(<PackingTransfer list={openList} language="en" onRestore={vi.fn()} />);
    const text = screen.getByRole("button", { name: "Save checklist (text)" });
    const include = screen.getByRole("checkbox", { name: "Include my notes in the text checklist" });
    fireEvent.click(text);
    expect(save.mock.calls[0]?.[0].name).toBe("packing-list.txt");
    expect(save.mock.calls[0]?.[0].content).not.toContain("Side pocket");
    fireEvent.click(screen.getByRole("button", { name: "Save backup (JSON)" }));
    const json = save.mock.calls[1]?.[0];
    expect(json?.name).toBe("packing-list.json");
    expect(JSON.parse(json?.content ?? "null")).toEqual(openList);

    fireEvent.click(include);
    fireEvent.click(text);
    expect(save.mock.calls[2]?.[0].content).toContain("Note: Side pocket");
    fireEvent.click(include);
    fireEvent.click(text);
    expect(save.mock.calls[3]?.[0].content).not.toContain("Side pocket");
    expect(screen.getByRole("status").textContent).toBe("File prepared for download.");
  });

  it("requires a new opt-in for notes after applying a backup", async () => {
    const save = vi.spyOn(downloads, "saveTextFile").mockReturnValue(true);
    render(<PackingTransfer list={openList} language="fr" onRestore={vi.fn()} />);
    const include = screen.getByRole("checkbox", { name: "Inclure mes notes dans la liste en texte" });
    fireEvent.click(include);
    choose(screen.getByLabelText("Choisir une copie de la liste"), jsonFile());
    fireEvent.click(await screen.findByRole("button", { name: "Remplacer la liste actuelle" }));
    expect((include as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la liste (texte)" }));
    expect(save.mock.calls[0]?.[0].content).not.toContain("Side pocket");
    expect(save.mock.calls[0]?.[0].content).toContain("Liste de préparation et de retour");
  });

  it("allows retrying a failed download while a backup is open for review", async () => {
    const save = vi.spyOn(downloads, "saveTextFile")
      .mockReturnValueOnce(false)
      .mockImplementationOnce(() => { throw new Error("download interrupted"); })
      .mockReturnValue(true);
    render(<PackingTransfer list={openList} language="en" onRestore={vi.fn()} />);
    choose(screen.getByLabelText("Choose a packing backup"), jsonFile());
    await screen.findByText("Train trip");
    const button = screen.getByRole("button", { name: "Save backup (JSON)" });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(button);
      expect(screen.getByRole("status").textContent).toContain("The file could not be created.");
      expect(screen.getByText("Train trip")).toBeTruthy();
    }
    fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("status").textContent).toContain("File prepared for download.");
    expect(screen.getByRole("button", { name: "Replace current list" })).toBeTruthy();
  });
});
