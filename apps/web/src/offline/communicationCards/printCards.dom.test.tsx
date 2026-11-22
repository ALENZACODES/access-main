/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveTextFile } from "../../states/downloadFile";
import { addCard, editCard, emptyDeck, moveCard, removeCard, type CardDeck, type CardLanguage } from "./model";
import { PrintableCards } from "./PrintableCards";
import { cardPosition, printableCardsFile, printLanguages, type CardPrintOptions } from "./printCards";
import { applyDeckImport, encodeDeck, previewDeckImport } from "./transfer";

vi.mock("../../states/downloadFile", () => ({ saveTextFile: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const first = { en: "Please write it down.", fr: "Pouvez-vous l’écrire\u202f?" };
const second = { en: "Which entrance?", fr: "" };
const sizeOptions: CardPrintOptions = { language: "en", faces: "both", size: "large" };

function example(): CardDeck {
  const deck = addCard(emptyDeck(), "first", first);
  return addCard(deck, "second", second);
}

function readFile(options = sizeOptions, deck = example()): Document {
  const { content } = printableCardsFile(deck.cards, options, document);
  return new DOMParser().parseFromString(content, "text/html");
}

describe("print files of authored communication cards", () => {
  it("makes a self-contained UTF-8 file in authored order", () => {
    const file = printableCardsFile(example().cards, sizeOptions, document);
    expect(file.name).toBe("communication-cards.html");
    expect(file.mime).toBe("text/html;charset=utf-8");
    expect(file.content.startsWith("<!doctype html>")).toBe(true);
    const doc = readFile();
    expect(doc.documentElement.lang).toBe("en");
    expect(doc.querySelector("meta[charset]")?.getAttribute("charset")).toBe("utf-8");
    expect(doc.querySelector("meta[name=viewport]")).toBeTruthy();
    expect(doc.querySelector("h1")?.textContent).toBe("Printable communication cards");
    expect([...doc.querySelectorAll("h2")].map(el => el.textContent)).toEqual(["Card 1 of 2", "Card 2 of 2"]);
    expect([...doc.querySelectorAll("article p")].map(el => el.textContent)).toEqual([first.en, first.fr, second.en, "UNKNOWN"]);
    expect(doc.querySelector("script, iframe, img, link, form, [src], [href]")).toBeNull();
  });

  it("uses the selected interface language for headings, including a French-only handout", () => {
    const options = { language: "fr", faces: "fr", size: "extra-large" } as const;
    const doc = readFile(options);
    expect(doc.documentElement.lang).toBe("fr");
    expect(doc.title).toBe("Cartes de communication à imprimer");
    expect(doc.querySelector("h2")?.textContent).toBe("Carte 1 sur 2");
    expect(doc.querySelector("h3")?.textContent).toBe("Français");
    expect([...doc.querySelectorAll("p")].map(el => el.textContent)).toEqual([first.fr, "UNKNOWN"]);
    expect(doc.querySelector("article:last-child p")?.getAttribute("lang")).toBe("und");
    expect(doc.body.textContent).not.toContain(second.en);
    expect(printableCardsFile(example().cards, options, document).name).toBe("cartes-de-communication.html");
    expect(doc.querySelector("style")?.textContent).toContain("32pt");
  });

  it("marks each supplied language and honors text direction in the browser", () => {
    const doc = readFile({ ...sizeOptions, language: "fr" });
    const contents = [...doc.querySelectorAll("article:first-of-type p")];
    expect(contents.map(el => [el.getAttribute("lang"), el.getAttribute("dir"), el.textContent]))
      .toEqual([["fr", "auto", first.fr], ["en", "auto", first.en]]);
  });

  it("preserves a literal label, symbols, line breaks and French punctuation", () => {
    const text = 'A & B <desk>\n«\u202fL’entrée\u202f»\u00a0: 2\u202f?';
    const deck = addCard(emptyDeck(), "desk", { en: "", fr: text });
    const doc = readFile({ ...sizeOptions, faces: "fr" }, deck);
    const message = doc.querySelector("article p");
    expect(message?.textContent).toBe(text);
    expect(message?.childElementCount).toBe(0);
    expect(doc.querySelector("desk")).toBeNull();
  });

  it("renumbers the selected subset without exposing IDs or omitted messages", () => {
    const deck = example();
    const file = printableCardsFile(deck.cards.slice(1), sizeOptions, document);
    const doc = new DOMParser().parseFromString(file.content, "text/html");
    expect(doc.querySelectorAll("article")).toHaveLength(1);
    expect(doc.querySelector("h2")?.textContent).toBe("Card 1 of 1");
    expect(doc.body.textContent).not.toContain(first.en);
    expect(doc.querySelectorAll("[data-id], [id]")).toHaveLength(0);
  });

  it("starts successive print cards on new pages and wraps unbroken messages", () => {
    const css = readFile().querySelector("style")?.textContent;
    expect(css).toContain("article + article { break-before: page;");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).toContain("24pt");
    expect(() => printableCardsFile([], sizeOptions, document)).toThrow(RangeError);
  });

  it("honours a single language even when it differs from the interface", () => {
    expect(printLanguages("both", "fr")).toEqual(["fr", "en"]);
    expect(printLanguages("en", "fr")).toEqual(["en"]);
    expect(printLanguages("fr", "en")).toEqual(["fr"]);
    expect(cardPosition(1, 4, "fr")).toBe("Carte 2 sur 4");
  });
});

function showOptions(deck = example(), language: CardLanguage = "en") {
  const view = render(<PrintableCards deck={deck} language={language} />);
  const disclosure = view.container.querySelector("details");
  if (!disclosure) throw new Error("Missing print choices");
  disclosure.open = true;
  return view;
}

describe("choosing communication cards for paper", () => {
  it("requires an explicit selection and keeps unrelated cards out of the downloaded file", () => {
    showOptions();
    const save = screen.getByRole("button", { name: "Download printable cards" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Card 2/ }));
    expect(save.disabled).toBe(false);
    expect(screen.getByRole("region", { name: "Preview of the first selected card" }).textContent).toContain(second.en);
    vi.mocked(saveTextFile).mockReturnValue(true);
    fireEvent.click(save);
    const file = vi.mocked(saveTextFile).mock.calls[0]?.[0];
    expect(file?.content).toContain(second.en);
    expect(file?.content).not.toContain(first.en);
    expect(screen.getByRole("status").textContent).toContain("Open the downloaded HTML file");
  });

  it("preserves the author’s ordering regardless of selection order", () => {
    const deck = example();
    const view = showOptions(deck);
    fireEvent.click(screen.getByRole("checkbox", { name: /Card 2/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Card 1/ }));
    const preview = screen.getByRole("region", { name: "Preview of the first selected card" });
    expect(preview.textContent).toContain(first.en);
    view.rerender(<PrintableCards deck={moveCard(deck, "second", "up")} language="en" />);
    expect(preview.textContent).toContain(second.en);
    expect(preview.textContent).not.toContain(first.en);
  });

  it("drops a selection when the message is edited or the same ID is restored", () => {
    const deck = example();
    const view = showOptions(deck);
    fireEvent.click(screen.getByRole("button", { name: "Select all cards" }));
    const edited = editCard(deck, "first", { en: "Please wait here.", fr: "" });
    view.rerender(<PrintableCards deck={edited} language="en" />);
    expect((screen.getByRole("checkbox", { name: /Please wait/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: /Which entrance/ }) as HTMLInputElement).checked).toBe(true);
    const restored = applyDeckImport(previewDeckImport(encodeDeck(deck), edited), edited);
    view.rerender(<PrintableCards deck={restored} language="en" />);
    expect(screen.queryByRole("region")).toBeNull();
    expect((screen.getByRole("button", { name: "Download printable cards" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not print a new message that reuses a removed card’s ID", () => {
    const deck = example();
    const view = showOptions(deck);
    fireEvent.click(screen.getByRole("checkbox", { name: /Card 1/ }));
    const replaced = addCard(removeCard(deck, "first"), "first", { en: "New message", fr: "" });
    view.rerender(<PrintableCards deck={replaced} language="en" />);
    expect(screen.queryByRole("region")).toBeNull();
    expect((screen.getByRole("checkbox", { name: /New message/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("previews only the chosen language, including a missing translation", () => {
    showOptions(example(), "fr");
    fireEvent.click(screen.getByRole("checkbox", { name: "Carte 2 — Anglais — Which entrance?" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Messages à imprimer" }), { target: { value: "fr" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Taille du texte imprimé" }), { target: { value: "extra-large" } });
    const preview = screen.getByRole("region", { name: "Aperçu de la première carte sélectionnée" });
    const message = within(preview).getByText("UNKNOWN");
    expect(message.lang).toBe("und");
    expect(message.style.fontSize).toBe("32pt");
    expect(preview.textContent).not.toContain(second.en);
    expect(screen.getByText("Cartes sélectionnées\u00a0: 1", { normalizer: value => value })).toBeTruthy();
  });

  it("clears selection and announces a failed save without losing choices", () => {
    showOptions();
    fireEvent.click(screen.getByRole("button", { name: "Select all cards" }));
    vi.mocked(saveTextFile).mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Download printable cards" }));
    expect(screen.getByRole("status").textContent).toBe("The file could not be downloaded.");
    expect((screen.getByRole("checkbox", { name: /Card 1/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("region")).toBeNull();
  });
});
