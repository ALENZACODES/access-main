/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";
import { VisitPlan } from "./VisitPlan";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const raw = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over });
const found: PackPlaceRecord[] = [...parsePackPlaces([raw("a"), raw("b", { name: "Beta Court", wheelchair: "limited" }), raw("c", { name: "", wheelchair: undefined })]).places];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

interface Over {
  found?: PackPlaceRecord[];
  missing?: number;
  locale?: "en" | "fr";
  copy?: (text: string) => Promise<boolean>;
  save?: (file: { name: string; mime: string; content: string }) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<VisitPlan found={over.found ?? found} missing={over.missing ?? 0} locale={locale} today={TODAY} copy={over.copy} save={over.save} />);
}
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) the questions$|^(Afficher|Masquer) les questions$/ });
const open = () => fireEvent.click(toggle());

describe("closed by default", () => {
  it("shows a heading and a button, and none of the questions", () => {
    show();
    expect(screen.getByRole("heading", { level: 3, name: "Questions to ask before you go" })).toBeTruthy();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("points the button at the panel it opens", () => {
    show();
    const id = toggle().getAttribute("aria-controls")!;
    expect(document.getElementById(id)).not.toBeNull();
    expect(document.getElementById(id)!.hidden).toBe(true);
  });
  it("renders nothing when no listed place is in the pack", () => {
    const { container } = show({ found: [], missing: 3 });
    expect(container.innerHTML).toBe("");
  });
});

describe("opened", () => {
  it("lists a group per place, named for the place", () => {
    show();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const groups = screen.getAllByRole("group").filter((g) => g.tagName === "FIELDSET");
    expect(groups.map((g) => within(g).getByText(/Place a|Beta Court|Place with no name/, { selector: "legend" }).textContent)).toEqual(["Place a", "Beta Court", "Place with no name (UNKNOWN)"]);
  });
  it("gives each question a checkbox labelled with the question", () => {
    show();
    open();
    expect(screen.getAllByRole("checkbox").length).toBe(2 + 3 + 4);
    expect(screen.getByRole("checkbox", { name: /The pack says Limited\. What does that mean here/ })).toBeTruthy();
  });
  it("shows the reason for each question next to it", () => {
    show();
    open();
    expect(screen.getAllByText("The pack reports the wheelchair tag Limited.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The pack records no wheelchair tag for this place: UNKNOWN.").length).toBeGreaterThan(0);
  });
  it("says how many questions there are and that none are asked yet", () => {
    show();
    open();
    expect(screen.getByText(/^9 questions for 3 places/)).toBeTruthy();
    expect(screen.getByText("0 of 9 asked.")).toBeTruthy();
  });
  it("counts a question as asked when it is ticked, and as not asked when it is unticked", () => {
    show();
    open();
    const box = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
    fireEvent.click(box);
    expect(screen.getByText("1 of 9 asked.")).toBeTruthy();
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("0 of 9 asked.")).toBeTruthy();
  });
  it("keeps the ticks when the panel is closed and opened again", () => {
    show();
    open();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(toggle());
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    open();
    expect(screen.getByText("1 of 9 asked.")).toBeTruthy();
  });
  it("drops a tick for a place that leaves the list", () => {
    const { rerender } = show();
    open();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText("1 of 9 asked.")).toBeTruthy();
    rerender(<VisitPlan found={found.slice(1)} missing={0} locale="en" today={TODAY} />);
    expect(screen.getByText("0 of 7 asked.")).toBeTruthy();
  });
});

describe("copy and save", () => {
  it("copies the text with ticked questions marked, and says so", async () => {
    const copy = vi.fn<(text: string) => Promise<boolean>>(async () => true);
    show({ copy });
    open();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Copy the questions" }));
    await waitFor(() => expect(screen.getByText("Copied the questions.")).toBeTruthy());
    const text = copy.mock.calls[0]![0];
    expect(text.startsWith("Questions to ask before you go\n")).toBe(true);
    expect(text.match(/\[x\]/g)).toHaveLength(1);
    expect(text.trimEnd().endsWith("© OpenStreetMap contributors")).toBe(true);
  });
  it("says the browser could not copy, and points to saving a file", async () => {
    show({ copy: async () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy the questions" }));
    await waitFor(() => expect(screen.getByText(/could not copy\. Save the questions as a file/)).toBeTruthy());
  });
  it("treats a copy that throws as a copy that failed", async () => {
    const copy = vi.fn(async () => {
      throw new Error("blocked");
    });
    show({ copy: copy as unknown as (t: string) => Promise<boolean> });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Copy the questions" }));
    await waitFor(() => expect(screen.getByText(/could not copy/)).toBeTruthy());
  });
  it("saves a text file with a plain name and the same text", () => {
    const save = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ save });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as text" }));
    const file = save.mock.calls[0]![0];
    expect(file.name).toBe("questions-before-you-go.txt");
    expect(file.mime).toBe("text/plain;charset=utf-8");
    expect(file.content).toContain("Beta Court");
    expect(screen.getByText("Saved questions-before-you-go.txt.")).toBeTruthy();
  });
  it("saves a CSV with a byte order mark, the header and an empty answer column", () => {
    const save = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ save });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as CSV" }));
    const file = save.mock.calls[0]![0];
    expect(file.name).toBe("questions-before-you-go.csv");
    expect(file.content.startsWith("﻿place_id,place_name,topic,question,basis,answer\r\n")).toBe(true);
    expect(file.content.split("\r\n")[1]!.endsWith(",")).toBe(true);
  });
  it("treats a save that throws as a save that failed", () => {
    show({
      save: () => {
        throw new Error("blocked");
      },
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as text" }));
    expect(screen.getByText(/could not make a file/)).toBeTruthy();
  });
  it("says so when the browser cannot make a file", () => {
    show({ save: () => false });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save as CSV" }));
    expect(screen.getByText(/could not make a file\. Copy the questions instead/)).toBeTruthy();
  });
  it("writes the ticks into the saved text", () => {
    const save = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ save });
    open();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    fireEvent.click(screen.getByRole("button", { name: "Save as text" }));
    expect(save.mock.calls[0]![0].content.match(/\[x\]/g)).toHaveLength(1);
  });
});

describe("French", () => {
  it("reads in French, with the right typography on every visible string", () => {
    const { container } = show({ locale: "fr" });
    open();
    expect(screen.getByRole("heading", { level: 3, name: "Questions à poser avant d’y aller" })).toBeTruthy();
    expect(screen.getByText(/^9 questions pour 3 lieux, établies d’après/)).toBeTruthy();
    expect(screen.getByText("0 sur 9 posées.")).toBeTruthy();
    for (const node of container.querySelectorAll("p, legend, button, label, span")) {
      if (node.children.length > 0) continue;
      const text = node.textContent ?? "";
      if (/Place [abc]|Beta Court/.test(text)) continue; // names are the pack's own words
      expect(lintFrench(text), text).toEqual([]);
    }
  });
  it("names the saved files in French", () => {
    const save = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ locale: "fr", save });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer en CSV" }));
    expect(save.mock.calls[0]![0].name).toBe("questions-avant-de-partir.csv");
    expect(screen.getByText("Fichier questions-avant-de-partir.csv enregistré.")).toBeTruthy();
  });
  it("uses the language on the section so a screen reader switches voice", () => {
    const { container } = show({ locale: "fr" });
    expect(container.querySelector("section")!.getAttribute("lang")).toBe("fr");
  });
});

describe("accessibility", () => {
  it("has no axe violations closed or open, in English and in French", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, `${locale} closed`).toEqual([]);
      open();
      expect((await axe.run(container, axeRules)).violations, `${locale} open`).toEqual([]);
      cleanup();
    }
  });
  it("can be opened and ticked from the keyboard alone: every control is a button or a checkbox", () => {
    show();
    open();
    for (const el of screen.getAllByRole("checkbox")) expect((el as HTMLInputElement).tabIndex).toBeGreaterThanOrEqual(0);
    for (const el of screen.getAllByRole("button")) expect(el.tagName).toBe("BUTTON");
  });
});

describe("which questions to show", () => {
  const legends = () => screen.queryAllByText(/./, { selector: "legend" }).map((l) => l.textContent);
  it("offers the four choices with how many questions are behind each", () => {
    show();
    open();
    const group = screen.getByRole("radiogroup", { name: "Which questions to show" });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["All questions (9)", "Getting in (5)", "Gaps in the record (1)", "Not asked yet (9)"]);
  });
  it("starts on all questions", () => {
    show();
    open();
    expect((screen.getByRole("radio", { name: /^All questions/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });
  it("narrows to getting in, and says how many are hidden", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: /^Getting in/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByText("4 questions are hidden by this choice.")).toBeTruthy();
  });
  it("drops a place with no question left in the choice", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: /^Gaps in the record/ }));
    expect(legends()).toEqual(["Place with no name (UNKNOWN)"]);
  });
  it("hides a question once it is ticked when only the not-asked ones are shown", () => {
    show();
    open();
    fireEvent.click(screen.getByRole("radio", { name: /^Not asked yet/ }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getAllByRole("checkbox")).toHaveLength(8);
    expect(screen.getByText("1 of 9 asked.")).toBeTruthy();
  });
  it("shows no note when all questions are shown", () => {
    show();
    open();
    expect(screen.queryByText(/hidden by this choice/)).toBeNull();
  });
  it("reads in French", () => {
    show({ locale: "fr" });
    open();
    expect(screen.getByRole("radiogroup", { name: "Questions à afficher" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Accès à l’entrée/ }));
    expect(screen.getByText("4 questions sont masquées par ce choix.")).toBeTruthy();
  });
});

describe("a message to the place", () => {
  const draftButton = (name: string) => screen.getByRole("button", { name: `Draft a message for ${name}` });
  it("has a button for each place, closed at first", () => {
    show();
    open();
    expect(screen.getAllByRole("button", { name: /^Draft a message for / })).toHaveLength(3);
    expect(draftButton("Beta Court").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("shows the message for that place only", () => {
    show();
    open();
    fireEvent.click(draftButton("Beta Court"));
    const box = screen.getByRole("textbox", { name: "Message for Beta Court" }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain("I am planning to visit Beta Court");
    expect(box.value.startsWith("Subject: Questions before a visit")).toBe(true);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
  it("moves to another place's message when another button is pressed", () => {
    show();
    open();
    fireEvent.click(draftButton("Beta Court"));
    fireEvent.click(draftButton("Place a"));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Message for Place a" })).toBeTruthy();
  });
  it("hides the message when the same button is pressed again", () => {
    show();
    open();
    fireEvent.click(draftButton("Beta Court"));
    fireEvent.click(screen.getByRole("button", { name: "Hide the message for Beta Court" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("leaves out a question once it is ticked", () => {
    show();
    open();
    const boxes = screen.getAllByRole("checkbox");
    // The first question of the second place is the Limited-meaning question.
    fireEvent.click(boxes[2]!);
    fireEvent.click(draftButton("Beta Court"));
    const text = (screen.getByRole("textbox") as HTMLTextAreaElement).value;
    expect(text).not.toContain("What does that mean here");
    expect(text).toContain("1. Is there another way in");
  });
  it("says there is nothing left to put in a message when every question for the place is ticked", () => {
    show({ found: [found[0]!] });
    open();
    fireEvent.click(draftButton("Place a"));
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByText(/Every question for this place is ticked/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("copies the message and says so", async () => {
    const copy = vi.fn<(text: string) => Promise<boolean>>(async () => true);
    show({ copy });
    open();
    fireEvent.click(draftButton("Beta Court"));
    fireEvent.click(screen.getByRole("button", { name: "Copy the message" }));
    await waitFor(() => expect(screen.getByText("Copied the message.")).toBeTruthy());
    expect(copy.mock.calls[0]![0]).toContain("I am planning to visit Beta Court");
  });
  it("says so when the message cannot be copied, including when the copy throws", async () => {
    show({
      copy: async () => {
        throw new Error("blocked");
      },
    });
    open();
    fireEvent.click(draftButton("Beta Court"));
    fireEvent.click(screen.getByRole("button", { name: "Copy the message" }));
    await waitFor(() => expect(screen.getByText(/could not copy\. Select the text above/)).toBeTruthy());
  });
  it("offers a mail link with no address and the same subject", () => {
    show();
    open();
    fireEvent.click(draftButton("Beta Court"));
    const link = screen.getByRole("link", { name: "Open in your email app" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")!.startsWith("mailto:?subject=Questions%20before%20a%20visit&body=")).toBe(true);
  });
  it("offers copying only when the message is too long for a mail link", () => {
    // Accented letters take six characters each once encoded in a link, so a long French note pushes it over the limit.
    const longNote = "é".repeat(300);
    const long = [...parsePackPlaces([raw("n", { name: "Noted", wheelchair: undefined, address: undefined, lat: undefined, provenance: { ...OSM, retrieved_at: "2024-01-01" }, wheelchair_description: longNote })]).places];
    show({ found: long, locale: "fr" });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Rédiger un message pour Noted" }));
    expect(screen.queryByRole("link", { name: "Ouvrir dans votre application de courriel" })).toBeNull();
    expect(screen.getByText("Ce message est trop long pour un lien de courriel. Copiez-le plutôt.")).toBeTruthy();
  });
  it("reads in French and names the place in the button", () => {
    show({ locale: "fr" });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Rédiger un message pour Beta Court" }));
    const box = screen.getByRole("textbox", { name: "Message pour Beta Court" }) as HTMLTextAreaElement;
    expect(box.value.startsWith("Objet : Questions avant une visite")).toBe(true);
    expect(screen.getByRole("link", { name: "Ouvrir dans votre application de courriel" })).toBeTruthy();
  });
  it("has no axe violations with a message open, in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show({ locale });
      open();
      fireEvent.click(screen.getAllByRole("button", { name: /^(Draft a message for|Rédiger un message pour) / })[1]!);
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
    }
  });
});
