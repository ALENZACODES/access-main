/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CallScript } from "./CallScript";
import type { SavedFile } from "./downloadFile";
import { bare, place } from "./placeFixtures";
import type { SpeechLike, UtteranceLike } from "./speak";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const TODAY = "2026-11-21";
afterEach(cleanup);

const set = () => [place("a", { name: "Café Étoile", address: "2650 Quesnel Road" }), place("b", { name: "Library One", address: "10 Main Street" }), bare("c")];

function fakeSpeech() {
  const spoken: UtteranceLike[] = [];
  const speech: SpeechLike = { speak: (u) => void spoken.push(u), cancel: vi.fn(), getVoices: () => [] };
  return { speech, spoken };
}
const mkU = (text: string): UtteranceLike => ({ text, lang: "", rate: 1, voice: null, onend: null, onerror: null });

function show(over: { places?: ReturnType<typeof set>; locale?: Locale; onSave?: (f: SavedFile) => boolean; speech?: SpeechLike | null } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<CallScript places={over.places ?? set()} locale={locale} today={TODAY} onSave={over.onSave} speech={over.speech === undefined ? null : over.speech} makeUtterance={mkU} />);
}
const toggle = (locale: Locale = "en") => screen.getByRole("button", { name: locale === "en" ? /^(Write a call script for a place|Hide the call script)$/ : /^(Préparer un script d’appel pour un lieu|Masquer le script d’appel)$/ });
const open = (locale: Locale = "en") => fireEvent.click(toggle(locale));
const pick = (name: RegExp | string) => fireEvent.click(screen.getByRole("radio", { name }));

describe("CallScript closed", () => {
  it("shows nothing when no place has a name", () => {
    expect(show({ places: [bare("x")] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [] }).container.innerHTML).toBe("");
  });
  it("starts closed with the body hidden and no heading element", () => {
    const { container } = show();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(container.querySelector("[data-call-script-body]")!.id);
    expect((container.querySelector("[data-call-script-body]") as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
  it("is labelled by its own heading text", () => {
    const { container } = show();
    const section = container.querySelector("section")!;
    expect(section.getAttribute("lang")).toBe("en");
    expect(document.getElementById(section.getAttribute("aria-labelledby")!)!.textContent).toBe("Call script");
  });
});

describe("CallScript choosing a place", () => {
  it("lists the named places and not the unnamed one", () => {
    show();
    open();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Café Étoile", "Library One"]);
    expect(screen.queryByText(/Script/)).toBeNull();
  });
  it("opens with no place chosen and no script", () => {
    const { container } = show();
    open();
    expect(container.querySelector("[data-call-script-text]")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("shows the script for the place chosen", () => {
    const { container } = show();
    open();
    pick("Library One");
    const text = container.querySelector("[data-call-script-text]")!.textContent!;
    expect(text).toContain("Call script: Library One");
    expect(text).toContain("The address I have is ten Main Street.");
  });
  it("narrows the list as the name is typed", () => {
    show();
    open();
    fireEvent.change(screen.getByRole("textbox", { name: /Find a place by name/ }), { target: { value: "etoile" } });
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });
  it("says so when nothing matches, and drops the script", () => {
    const { container } = show();
    open();
    pick("Library One");
    fireEvent.change(screen.getByRole("textbox", { name: /Find a place by name/ }), { target: { value: "zzz" } });
    expect(screen.getByText("No place in this list has that in its name.")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(container.querySelector("[data-call-script-text]")).not.toBeNull();
  });
  it("says how many more matches are not listed", () => {
    const many = Array.from({ length: 11 }, (_, i) => place(`m${i}`, { name: `Shop ${i}` }));
    show({ places: many as ReturnType<typeof set> });
    open();
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    expect(screen.getByText("3 more matches are not listed. Type more of the name.")).toBeTruthy();
  });
});

describe("CallScript options", () => {
  it("spells the name by default and stops when unchecked", () => {
    const { container } = show();
    open();
    pick("Café Étoile");
    expect(container.querySelector("[data-call-script-text]")!.textContent).toContain("as in Echo");
    fireEvent.click(screen.getByRole("checkbox", { name: "Spell out the name letter by letter" }));
    expect(container.querySelector("[data-call-script-text]")!.textContent).not.toContain("as in Echo");
  });
  it("reads the address in words and shows it as written when unchecked", () => {
    const { container } = show();
    open();
    pick("Café Étoile");
    expect(container.querySelector("[data-call-script-text]")!.textContent).toContain("two thousand six hundred fifty");
    fireEvent.click(screen.getByRole("checkbox", { name: "Read the address out loud" }));
    expect(container.querySelector("[data-call-script-text]")!.textContent).toContain("2650 Quesnel Road");
  });
  it("leaves the questions out when unchecked", () => {
    const { container } = show();
    open();
    pick("Café Étoile");
    expect(container.querySelectorAll("[data-call-script-text] ol li").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "Include the questions" }));
    expect(container.querySelector("[data-call-script-text] ol")).toBeNull();
  });
  it("keeps the choice of place and the options when closed and opened again", () => {
    const { container } = show();
    open();
    pick("Café Étoile");
    open();
    expect((container.querySelector("[data-call-script-body]") as HTMLElement).hidden).toBe(true);
    open();
    expect(container.querySelector("[data-call-script-text]")).not.toBeNull();
  });
});

describe("CallScript saving", () => {
  it("saves the text file and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(onSave.mock.calls[0]![0].name).toBe("call-script.txt");
    expect(onSave.mock.calls[0]![0].content).toContain("Call script: Library One");
    expect(screen.getByText("Saved call-script.txt.")).toBeTruthy();
  });
  it("saves the printable page", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Save as a printable page" }));
    expect(onSave.mock.calls[0]![0].mime).toContain("text/html");
  });
  it("says the browser cannot save when saving fails or throws", () => {
    show({ onSave: () => false });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Save as a text file" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("no");
      },
    });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Save as a printable page" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("puts the status in a polite live paragraph", () => {
    const { container } = show();
    open();
    const live = container.querySelector("[aria-live]")!;
    expect(live.tagName).toBe("P");
    expect(live.getAttribute("aria-live")).toBe("polite");
  });
});

describe("CallScript reading aloud", () => {
  it("says the browser has no voice when there is none", () => {
    show({ speech: null });
    open();
    pick("Library One");
    expect(screen.getByText("This browser has no voice to read with.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read it out loud" })).toBeNull();
  });
  it("reads, then stops, and the button follows", () => {
    const { speech, spoken } = fakeSpeech();
    show({ speech });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    expect(spoken.length).toBeGreaterThan(0);
    expect(spoken[0]!.text).toContain("Hello");
    const stop = screen.getByRole("button", { name: "Stop reading" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(stop);
    expect(screen.getByRole("button", { name: "Read it out loud" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("goes back to the read button when the voice finishes", () => {
    const { speech, spoken } = fakeSpeech();
    show({ speech });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    let i = 0;
    while (i < spoken.length) {
      const u = spoken[i]!;
      act(() => u.onend!());
      i += 1;
    }
    expect(screen.getByRole("button", { name: "Read it out loud" })).toBeTruthy();
  });
  it("uses the speed chosen", () => {
    const { speech, spoken } = fakeSpeech();
    show({ speech });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("radio", { name: "Slow" }));
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    expect(spoken[0]!.rate).toBe(0.8);
  });
  it("stops reading when the place or an option changes", () => {
    const { speech } = fakeSpeech();
    show({ speech });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include the questions" }));
    expect(screen.getByRole("button", { name: "Read it out loud" })).toBeTruthy();
    expect(speech.cancel).toHaveBeenCalled();
  });
  it("stops reading when it is closed or taken off the page", () => {
    const { speech } = fakeSpeech();
    const view = show({ speech });
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    const before = (speech.cancel as ReturnType<typeof vi.fn>).mock.calls.length;
    open();
    expect((speech.cancel as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
    open();
    pick("Library One");
    fireEvent.click(screen.getByRole("button", { name: "Read it out loud" }));
    const mid = (speech.cancel as ReturnType<typeof vi.fn>).mock.calls.length;
    view.unmount();
    expect((speech.cancel as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(mid);
  });
});

describe("CallScript by keyboard", () => {
  it("opens with Enter and Space on the toggle and keeps focus there", () => {
    show();
    const b = toggle();
    b.focus();
    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(b, { key });
      fireEvent.keyUp(b, { key });
    }
    expect(document.activeElement).toBe(b);
  });
  it("has only real controls in its tab order", () => {
    show();
    open();
    pick("Library One");
    const stops = [...document.querySelectorAll<HTMLElement>("[tabindex]")].filter((e) => e.getAttribute("tabindex") !== "-1");
    for (const e of stops) expect(["INPUT", "BUTTON", "LABEL", "DIV"]).toContain(e.tagName);
  });
});

for (const locale of ["en", "fr"] as const) {
  describe(`CallScript in ${locale}`, () => {
    it("has no axe violations closed, open and with a place chosen", async () => {
      const { container } = show({ locale, speech: fakeSpeech().speech });
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
      pick(/Library One/);
      expect((await axe.run(container, axeRules)).violations, "chosen").toEqual([]);
    });
    it("writes its own words with French typography in French and plain spacing in English", () => {
      const { container } = show({ locale });
      open(locale);
      pick(/Library One/);
      for (const el of container.querySelectorAll<HTMLElement>("section > p, button, label, [data-call-script-text] p, [data-call-script-text] li")) {
        if (el.closest("[data-call-script-text]") && /Library One/.test(el.textContent ?? "")) continue;
        if (locale === "fr") expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
        else expect(el.textContent ?? "").not.toMatch(/\u00a0/);
      }
      expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
    });
  });
}

it("lists only the filter, picker and options in the body before a place is chosen", () => {
  const { container } = show();
  open();
  const body = within(container.querySelector("[data-call-script-body]") as HTMLElement);
  expect(body.getByRole("textbox")).toBeTruthy();
  expect(body.getAllByRole("radio")).toHaveLength(2);
  expect(body.queryAllByRole("button")).toHaveLength(0);
});
