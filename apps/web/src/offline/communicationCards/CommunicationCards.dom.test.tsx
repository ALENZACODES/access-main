/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CommunicationCards from "./CommunicationCards";
import { cardCopy, examples } from "./copy";
import { MAX_CARD_LENGTH } from "./model";

afterEach(cleanup);

const en = cardCopy.en;
const fr = cardCopy.fr;

function write(label: string, value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
}

function button(label: string) {
  return screen.getByRole("button", { name: label }) as HTMLButtonElement;
}

function press(label: string) { fireEvent.click(button(label)); }

function add(english: string, french = "") {
  write(en.english, english);
  write(en.french, french);
  press(en.add);
}

function card(index: number, language: "en" | "fr" = "en") {
  return within(screen.getByRole("group", { name: cardCopy[language].card + " " + index }));
}

describe("writing personal communication cards", () => {
  it("starts empty, with labelled bilingual fields and an explicit character limit", () => {
    render(<CommunicationCards language="en" />);
    const region = screen.getByRole("region", { name: en.title });
    expect(within(region).getByText(en.empty)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.show })).toBeNull();
    for (const [label, lang] of [[en.english, "en"], [en.french, "fr"]]) {
      const field = screen.getByRole("textbox", { name: label });
      expect(field.getAttribute("lang")).toBe(lang);
      expect(field.getAttribute("maxlength")).toBe(String(MAX_CARD_LENGTH));
      const helpId = field.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(helpId)?.textContent).toContain(String(MAX_CARD_LENGTH));
    }
  });

  it("keeps an invalid draft available for correction", () => {
    render(<CommunicationCards language="en" />);
    write(en.english, "  ");
    press(en.add);
    expect(screen.getByText(en.blank)).toBeTruthy();
    expect(screen.getByText(en.empty)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(en.english));
    write(en.english, "A side entrance");
    press(en.add);
    expect(card(1).getByText("A side entrance")).toBeTruthy();
    expect(card(1).getByText("UNKNOWN").getAttribute("lang")).toBe("und");
  });

  it("uses bilingual examples as editable drafts and never adds them automatically", () => {
    render(<CommunicationCards language="en" />);
    const select = screen.getByRole("combobox", { name: en.templates });
    fireEvent.change(select, { target: { value: "1" } });
    expect(screen.getByText(en.empty)).toBeTruthy();
    expect((screen.getByLabelText(en.english) as HTMLTextAreaElement).value).toBe(examples[1]?.en);
    expect((screen.getByLabelText(en.french) as HTMLTextAreaElement).value).toBe(examples[1]?.fr);
    expect((select as HTMLSelectElement).disabled).toBe(true);
    write(en.english, "Which side entrance can I use?");
    press(en.add);
    expect(card(1).getByText("Which side entrance can I use?")).toBeTruthy();
    expect(card(1).getAllByRole("definition")[1]?.textContent).toBe(examples[1]?.fr);
    expect((select as HTMLSelectElement).disabled).toBe(false);
  });

  it("can display two cards with identical wording and edit just one", () => {
    render(<CommunicationCards language="en" />);
    add("Please wait", "Un instant");
    fireEvent.click(card(1).getByRole("button", { name: en.duplicate }));
    expect(card(2).getByText("Please wait")).toBeTruthy();
    expect(document.activeElement).toBe(card(2).getByRole("button", { name: en.edit }));
    fireEvent.click(card(2).getByRole("button", { name: en.edit }));
    expect(document.activeElement).toBe(screen.getByLabelText(en.english));
    write(en.english, "Please wait here");
    press(en.save);
    expect(card(1).getByText("Please wait")).toBeTruthy();
    expect(card(2).getByText("Please wait here")).toBeTruthy();
    expect(card(2).getByText("Un instant")).toBeTruthy();
    expect(document.activeElement).toBe(card(2).getByRole("button", { name: en.edit }));
  });

  it("protects partially typed messages and cancels an edit without modifying the saved card", () => {
    render(<CommunicationCards language="en" />);
    add("First card");
    write(en.french, "Brouillon");
    fireEvent.click(card(1).getByRole("button", { name: en.edit }));
    expect(screen.getByText(en.finishDraft)).toBeTruthy();
    expect((screen.getByLabelText(en.french) as HTMLTextAreaElement).value).toBe("Brouillon");
    press(en.clear);
    fireEvent.click(card(1).getByRole("button", { name: en.edit }));
    write(en.english, "Temporary changes");
    press(en.cancelEdit);
    expect(card(1).getByText("First card")).toBeTruthy();
    expect(card(1).queryByText("Temporary changes")).toBeNull();
  });

  it("keeps focus on a moved card and disables only the end directions", () => {
    render(<CommunicationCards language="en" />);
    add("First");
    add("Second");
    expect((card(1).getByRole("button", { name: en.up }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card(2).getByRole("button", { name: en.up }));
    expect(card(1).getByText("Second")).toBeTruthy();
    expect(document.activeElement).toBe(card(1).getByRole("button", { name: en.edit }));
    expect((card(2).getByRole("button", { name: en.down }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(card(1).getByRole("button", { name: en.down }));
    expect(card(1).getByText("First")).toBeTruthy();
  });

  it("requires confirmation to remove, with a non-destructive first focus", () => {
    render(<CommunicationCards language="en" />);
    add("Keep this");
    fireEvent.click(card(1).getByRole("button", { name: en.delete }));
    expect(document.activeElement).toBe(button(en.keep));
    press(en.keep);
    expect(card(1).getByText("Keep this")).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.removeCard })).toBeNull();
    fireEvent.click(card(1).getByRole("button", { name: en.delete }));
    press(en.removeCard);
    expect(screen.getByText(en.empty)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(en.english));
  });

  it("sends focus to the next surviving card on confirmed removal", () => {
    render(<CommunicationCards language="en" />);
    add("First"); add("Second"); add("Third");
    fireEvent.click(card(2).getByRole("button", { name: en.delete }));
    press(en.removeCard);
    expect(card(2).getByText("Third")).toBeTruthy();
    expect(document.activeElement).toBe(card(2).getByRole("button", { name: en.edit }));
  });
});

describe("presenting messages offline", () => {
  it("opens the first card, navigates in order and preserves a draft on return", () => {
    render(<CommunicationCards language="en" />);
    add("Entry", "Entrée");
    add("Exit", "Sortie");
    write(en.english, "Not ready yet");
    const opener = button(en.show);
    fireEvent.click(opener);
    const display = screen.getByRole("region", { name: en.present });
    expect(document.activeElement).toBe(within(display).getByRole("heading", { name: en.present }));
    expect(button(en.previous).disabled).toBe(true);
    expect(within(display).getByText("Entry").getAttribute("lang")).toBe("en");
    expect(screen.queryByRole("textbox", { name: en.english })).toBeNull();
    press(en.next);
    expect(button(en.next).disabled).toBe(true);
    expect(within(display).getByText("Exit")).toBeTruthy();
    press(en.showFr);
    expect(within(display).getByText("Sortie").getAttribute("lang")).toBe("fr");
    press(en.previous);
    expect(within(display).getByText("Entrée")).toBeTruthy();
    press(en.back);
    expect(document.activeElement).toBe(opener);
    expect((screen.getByRole("textbox", { name: en.english }) as HTMLTextAreaElement).value).toBe("Not ready yet");
  });

  it("opens a chosen card and returns focus to that specific launcher", () => {
    render(<CommunicationCards language="en" />);
    add("One"); add("Two"); add("Three");
    const fromRow = card(2).getByRole("button", { name: en.showThis });
    fireEvent.click(fromRow);
    const display = screen.getByRole("region", { name: en.present });
    expect(within(display).getByText("Two")).toBeTruthy();
    expect(within(display).queryByText("One")).toBeNull();
    expect(button(en.next).disabled).toBe(false);
    press(en.back);
    expect(document.activeElement).toBe(fromRow);
  });

  it("announces missing wording explicitly and supports larger text without changing the card", () => {
    render(<CommunicationCards language="en" />);
    add("Please write the address");
    press(en.show);
    press(en.showFr);
    const display = screen.getByRole("region", { name: en.present });
    expect(within(display).getByText("UNKNOWN").getAttribute("lang")).toBe("und");
    expect(within(display).getByText(en.missing)).toBeTruthy();
    expect(within(display).queryByText("Please write the address")).toBeNull();
    press(en.extra);
    expect(button(en.extra).getAttribute("aria-pressed")).toBe("true");
    expect(within(display).getByText("UNKNOWN").classList.contains("extra-large")).toBe(true);
    press(en.large);
    press(en.showEn);
    expect(within(display).getByText("Please write the address").getAttribute("lang")).toBe("en");
    expect(within(display).queryByText(en.missing)).toBeNull();
  });

  it("honours the French interface and preserves punctuation in authored messages", () => {
    render(<CommunicationCards language="fr" />);
    const question = "L’entrée est-elle ouverte\u202f?";
    write(fr.french, question);
    press(fr.add);
    const displayButton = card(1, "fr").getByRole("button", { name: fr.showThis });
    fireEvent.click(displayButton);
    expect(button(fr.showFr).getAttribute("aria-pressed")).toBe("true");
    const display = screen.getByRole("region", { name: fr.present });
    expect(display.querySelector(".communication-reading")?.textContent).toBe(question);
    press(fr.showEn);
    expect(within(display).getByText("UNKNOWN")).toBeTruthy();
    press(fr.back);
    expect(document.activeElement).toBe(displayButton);
  });
});
