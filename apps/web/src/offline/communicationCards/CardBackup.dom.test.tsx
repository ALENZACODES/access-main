/** @vitest-environment jsdom */
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as download from "../../states/downloadFile";
import { CardBackup } from "./CardBackup";
import { cardCopy } from "./copy";
import { addCard, emptyDeck, type CardDeck, type CardLanguage } from "./model";
import { encodeDeck, MAX_BACKUP_BYTES } from "./transfer";

const current = addCard(emptyDeck(), "one", { en: "Current wording", fr: "" });
const incoming = addCard(emptyDeck(), "two", { en: "<b>Next card</b>", fr: "Autre carte" });
const c = cardCopy.en;

function Harness({ language = "en", initial = current, draft = false }:
  { language?: CardLanguage; initial?: CardDeck; draft?: boolean }) {
  const [deck, setDeck] = useState(initial);
  return <>
    <CardBackup deck={deck} language={language} draftPending={draft} onReplace={setDeck} />
    <div data-testid="deck">{encodeDeck(deck)}</div>
    <button onClick={() => setDeck(addCard(deck, "other", { en: "Concurrent edit", fr: "" }))}>Add another card</button>
  </>;
}

function button(label: string): HTMLButtonElement {
  return screen.getByRole("button", { name: label }) as HTMLButtonElement;
}

function field() { return screen.getByRole("textbox", { name: c.input }) as HTMLTextAreaElement; }

function fill(json: string) { fireEvent.change(field(), { target: { value: json } }); }

function review(deck = incoming) {
  fill(encodeDeck(deck));
  fireEvent.click(button(c.preview));
  return screen.getByRole("region", { name: c.review });
}

function pick(file: File) {
  fireEvent.change(screen.getByLabelText(c.file), { target: { files: [file] } });
}

function jsonFile(read: () => Promise<string>, bytes = 64): File {
  const file = new File([" ".repeat(bytes)], "saved.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: read });
  return file;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("communication card backup and restore", () => {
  it("exports the actual author wording and uses the regular local file helper", () => {
    const writer = vi.spyOn(download, "saveTextFile").mockReturnValue(true);
    render(<Harness />);
    fireEvent.click(button(c.backup));
    const backup = writer.mock.calls[0]?.[0];
    expect(backup).toEqual({
      name: "communication-cards.json", mime: "application/json", content: encodeDeck(current),
    });
    fireEvent.click(button(c.text));
    const handout = writer.mock.calls[1]?.[0];
    expect(handout?.name).toBe("communication-cards.txt");
    expect(handout?.content).toContain("Current wording");
    expect(handout?.content).toContain("UNKNOWN");
    expect(screen.getByRole("status").textContent).toBe(c.downloaded);
  });

  it("reports a cancelled or unavailable local download without touching the deck", () => {
    const writer = vi.spyOn(download, "saveTextFile").mockReturnValue(false);
    render(<Harness />);
    fireEvent.click(button(c.backup));
    expect(screen.getByRole("status").textContent).toBe(c.downloadError);
    writer.mockImplementationOnce(() => { throw new Error("unavailable"); });
    fireEvent.click(button(c.text));
    expect(screen.getByRole("status").textContent).toBe(c.downloadError);
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
  });

  it("shows a readable preview, including raw message markup as text, before restoring", () => {
    render(<Harness />);
    const region = review();
    expect(document.activeElement).toBe(within(region).getByRole("heading", { name: c.review }));
    expect(within(region).getByText("<b>Next card</b>").tagName).toBe("SPAN");
    expect(region.querySelector("b")).toBeNull();
    expect(within(region).getByText("Autre carte").getAttribute("lang")).toBe("fr");
    const counts = within(region).getAllByRole("definition").map((d) => d.textContent);
    expect(counts).toEqual(["1", "0", "1", c.no]);
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
    fireEvent.click(button(c.replace));
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(incoming));
    expect(screen.getByRole("status").textContent).toBe(c.restored);
    expect(document.activeElement).toBe(field());
    expect(field().value).toBe("");
  });

  it("can cancel an imported empty deck and undo an explicit replacement", () => {
    render(<Harness />);
    review(emptyDeck());
    expect(screen.getByText(c.incomingEmpty)).toBeTruthy();
    fireEvent.click(button(c.cancelImport));
    expect(document.activeElement).toBe(field());
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
    fireEvent.click(button(c.preview));
    fireEvent.click(button(c.replace));
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(emptyDeck()));
    fireEvent.click(button(c.undo));
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
    expect(screen.getByRole("status").textContent).toBe(c.undone);
    expect(screen.queryByRole("button", { name: c.undo })).toBeNull();
  });

  it("invalidates the preview when the pasted source changes", () => {
    render(<Harness />);
    review();
    fill("{invalid}");
    expect(screen.queryByRole("region", { name: c.review })).toBeNull();
    fireEvent.click(button(c.preview));
    expect(screen.getByRole("status").textContent).toBe(c.invalid);
    expect(screen.queryByRole("button", { name: c.replace })).toBeNull();
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
  });

  it("requires a new review after an intervening edit and keeps that edit", () => {
    render(<Harness />);
    review();
    fireEvent.click(button("Add another card"));
    fireEvent.click(button(c.replace));
    expect(screen.getByRole("status").textContent).toBe(c.stale);
    expect(screen.getByTestId("deck").textContent).toContain("Concurrent edit");
    expect(screen.queryByRole("region", { name: c.review })).toBeNull();
    fireEvent.click(button(c.preview));
    fireEvent.click(button(c.replace));
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(incoming));
  });

  it("disables restore during a draft and removes undo after later committed changes", () => {
    const ui = render(<Harness draft />);
    review();
    expect(button(c.replace).disabled).toBe(true);
    expect(screen.getByText(c.saveDraft)).toBeTruthy();
    ui.rerender(<Harness />);
    expect(button(c.replace).disabled).toBe(false);
    fireEvent.click(button(c.replace));
    expect(button(c.undo)).toBeTruthy();
    fireEvent.click(button("Add another card"));
    expect(screen.queryByRole("button", { name: c.undo })).toBeNull();
    expect(screen.getByTestId("deck").textContent).toContain("Concurrent edit");
  });

  it("lets a French reader preview and restore an authored one-language card", () => {
    const fr = cardCopy.fr;
    render(<Harness language="fr" initial={emptyDeck()} />);
    fireEvent.change(screen.getByLabelText(fr.input), { target: { value: encodeDeck(current) } });
    fireEvent.click(button(fr.preview));
    const region = screen.getByRole("region", { name: fr.review });
    expect(within(region).getByText("UNKNOWN").getAttribute("lang")).toBe("und");
    fireEvent.click(button(fr.replace));
    expect(screen.getByRole("status").textContent).toBe(fr.restored);
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
  });
});

describe("choosing a local communication-card file", () => {
  it("loads a chosen file for review before any replacement", async () => {
    render(<Harness />);
    await act(async () => { pick(jsonFile(async () => encodeDeck(incoming))); });
    expect(field().value).toBe(encodeDeck(incoming));
    expect(screen.queryByRole("region", { name: c.review })).toBeNull();
    expect(screen.getByTestId("deck").textContent).toBe(encodeDeck(current));
    fireEvent.click(button(c.preview));
    expect(screen.getByRole("region", { name: c.review })).toBeTruthy();
  });

  it("refuses an oversized file before reading any bytes", () => {
    render(<Harness />);
    const read = vi.fn(async () => "ignored");
    pick(jsonFile(read, MAX_BACKUP_BYTES + 1));
    expect(read).not.toHaveBeenCalled();
    expect(button(c.preview).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(c.tooBig);
  });

  it("supports paste after a read failure", async () => {
    render(<Harness />);
    await act(async () => { pick(jsonFile(async () => { throw new Error("file unavailable"); })); });
    expect(screen.getByRole("status").textContent).toBe(c.readError);
    review();
    expect(button(c.replace).disabled).toBe(false);
  });

  it("discards a delayed file read if the user has pasted newer JSON", async () => {
    render(<Harness />);
    let finish!: (json: string) => void;
    pick(jsonFile(() => new Promise(resolve => { finish = resolve; })));
    expect(screen.getByRole("status").textContent).toBe(c.fileBusy);
    const pasted = encodeDeck(incoming);
    fill(pasted);
    await act(async () => { finish(encodeDeck(current)); });
    expect(field().value).toBe(pasted);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(button(c.preview).disabled).toBe(false);
  });
});
