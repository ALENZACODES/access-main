/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";

const saved = vi.hoisted(() => ({ calls: [] as { name: string; mime: string; content: string }[], ok: true }));
vi.mock("./downloadFile.ts", () => ({
  saveTextFile: (f: { name: string; mime: string; content: string }) => {
    saved.calls.push(f);
    return saved.ok;
  },
}));
const { HelpNumbers } = await import("./HelpNumbers.tsx");

const pack = (JSON.parse(contentText) as { help_numbers: unknown[] }).help_numbers;
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const TODAY = "2026-11-21";
beforeEach(() => {
  saved.calls = [];
  saved.ok = true;
});
afterEach(cleanup);

const items = () => screen.getAllByRole("listitem");

describe("HelpNumbers, English", () => {
  it("shows the heading, the lead and every entry in the pack's order", async () => {
    const { container } = render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2, name: "Saved help numbers" })).toBeTruthy();
    expect(screen.getByText(/Check a number with its source before you rely on it/)).toBeTruthy();
    expect(items().map((li) => li.getAttribute("data-help-id"))).toEqual(["emergency-911", "suicide-crisis-988", "health811", "connexontario", "poison-centre", "two-one-one"]);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("shows each number as the pack writes it, in strong text, with it said aloud", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    const nine = within(items()[1]!);
    expect(nine.getByText("9-8-8").tagName).toBe("STRONG");
    expect(nine.getByText("Said aloud: nine eight eight.")).toBeTruthy();
    expect(within(items()[3]!).getByText("1-866-531-2600")).toBeTruthy();
    expect(within(items()[3]!).getByText("A toll-free number.")).toBeTruthy();
  });
  it("makes no link and no tel address", () => {
    const { container } = render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("tel:");
    expect(within(items()[2]!).getByText("Page: https://health811.ontario.ca/static/guest/help-centre/calling-health811-help-centre")).toBeTruthy();
  });
  it("gives the source line of each entry", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    expect(within(items()[0]!).getByText("Source: Ontario emergency number, desk check. Licence: UNKNOWN. Retrieved 13 November 2026. Tier E, saved copy.")).toBeTruthy();
  });
  it("keeps the tools closed and adds no heading when it opens them", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    const before = screen.getAllByRole("heading").length;
    const btn = screen.getByRole("button", { name: "Search and save the numbers" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Search the help numbers")).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText(/Search the help numbers/)).toBeTruthy();
    expect(screen.getAllByRole("heading")).toHaveLength(before);
  });
  it("controls a region that exists", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    const btn = screen.getByRole("button", { name: /Search and save the numbers/ });
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
  });
  it("searches, says how many match and keeps the pack's order", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    fireEvent.change(screen.getByLabelText(/Search the help numbers/), { target: { value: "911" } });
    expect(items()).toHaveLength(1);
    expect(document.querySelector("[data-help-count]")?.textContent).toBe("1 of 6 help numbers shown.");
    fireEvent.change(screen.getByLabelText(/Search the help numbers/), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(document.querySelector("[data-help-count]")?.textContent).toBe("No help numbers match. 6 saved.");
  });
  it("sorts by name when asked and back to the pack's order", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    fireEvent.click(screen.getByRole("radio", { name: /name/i }));
    expect(items()[0]?.getAttribute("data-help-id")).toBe("suicide-crisis-988");
    fireEvent.click(screen.getByRole("radio", { name: /as saved/i }));
    expect(items()[0]?.getAttribute("data-help-id")).toBe("emergency-911");
  });
  it("saves the shown entries as text and as CSV, and says so", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    fireEvent.change(screen.getByLabelText(/Search the help numbers/), { target: { value: "811" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(saved.calls.map((c) => c.name)).toEqual(["help-numbers-2026-11-21.txt", "help-numbers-2026-11-21.csv"]);
    expect(saved.calls[0]!.mime).toBe("text/plain;charset=utf-8");
    expect(saved.calls[0]!.content).toContain("Health811");
    expect(saved.calls[0]!.content).not.toContain("ConnexOntario");
    expect(saved.calls[1]!.content.charCodeAt(0)).toBe(0xfeff);
    expect(saved.calls[1]!.content).toContain("health811");
    expect(saved.calls[1]!.content).not.toContain("connexontario");
    expect(document.querySelector("[data-help-saved]")?.textContent).toContain("help-numbers-2026-11-21.csv");
  });
  it("saves a check for gaps of every saved entry, whatever the search", () => {
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    fireEvent.change(screen.getByLabelText(/Search the help numbers/), { target: { value: "811" } });
    fireEvent.click(screen.getByRole("button", { name: "Save a check for gaps" }));
    expect(saved.calls).toHaveLength(1);
    expect(saved.calls[0]!.name).toBe("help-numbers-check-2026-11-21.txt");
    expect(saved.calls[0]!.content).toContain("6 entries, 1 with findings.");
    expect(saved.calls[0]!.content).toContain("emergency-911");
  });
  it("says when saving failed", () => {
    saved.ok = false;
    render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save as a CSV file" }));
    expect(document.querySelector("[data-help-saved]")?.textContent).toMatch(/could not/i);
  });
  it("has no violation with the tools open", async () => {
    const { container } = render(<HelpNumbers numbers={pack} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: /Search and save the numbers/ }));
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

describe("HelpNumbers, French", () => {
  it("is in French, with the number said aloud in French and French colons", async () => {
    const { container } = render(<HelpNumbers numbers={pack} locale="fr" today={TODAY} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Numéros d’aide enregistrés");
    expect(items()[0]!.textContent).toContain("\u00c0 dire \u00e0 voix haute\u00a0: neuf un un.");
    expect(within(items()[0]!).getByRole("heading", { level: 3 }).textContent).toBe("Services d'urgence");
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("fr");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("marks a description shown in the other language with its own lang and a note", () => {
    render(<HelpNumbers numbers={[{ id: "a", name: { en: "Only English" }, how: { en: "English text" }, contact: "211" }]} locale="fr" today={TODAY} />);
    const li = items()[0]!;
    expect(li.querySelector('p[lang="en"]')?.textContent).toBe("English text");
    expect(within(li).getByText(/Affiché en anglais/)).toBeTruthy();
  });
});

describe("HelpNumbers with little or damaged data", () => {
  it("shows nothing for nothing", () => {
    for (const n of [undefined, null, [], {}, "x"]) {
      const { container } = render(<HelpNumbers numbers={n} locale="en" today={TODAY} />);
      expect(container.innerHTML, String(n)).toBe("");
      cleanup();
    }
  });
  it("says how many records could not be read, and shows no tools when none were", () => {
    render(<HelpNumbers numbers={[null, 4]} locale="en" today={TODAY} />);
    expect(screen.getByText("2 saved records could not be read and are not shown.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
  it("shows an entry with only an id, without inventing a name or a number", () => {
    render(<HelpNumbers numbers={[{ id: "bare" }]} locale="en" today={TODAY} />);
    const li = within(items()[0]!);
    expect(li.getByRole("heading", { level: 3 }).textContent).toBe("Unnamed entry bare");
    expect(li.getByText("No number is saved for this entry.")).toBeTruthy();
    expect(li.getByText("No description is saved for this entry.")).toBeTruthy();
    expect(li.getByText("Source: UNKNOWN. Licence: UNKNOWN. Retrieved UNKNOWN. Tier UNKNOWN, saved copy.")).toBeTruthy();
  });
  it("shows markup in a name as plain text", () => {
    const { container } = render(<HelpNumbers numbers={[{ id: "x", name: { en: "<img src=x onerror=alert(1)>" }, contact: "211" }]} locale="en" today={TODAY} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("<img src=x onerror=alert(1)>");
  });
  it("does not turn a text that is not a number into one", () => {
    render(<HelpNumbers numbers={[{ id: "x", name: { en: "X" }, contact: "call 911 now" }]} locale="en" today={TODAY} />);
    expect(screen.queryByText("call 911 now")).toBeNull();
    expect(screen.getByText("No number is saved for this entry.")).toBeTruthy();
  });
});
