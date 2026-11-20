/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackSearchEcho, PackSearchHelp } from "./PackSearchHelp";
import { searchPlaces } from "./packSearchFixtures";
import { searchExamples } from "./packSearchHelp";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const plain = (s: string) => s.split("\u00a0").join(" ").split("\u202f").join(" ");
const places = searchPlaces();

afterEach(cleanup);

describe("PackSearchEcho", () => {
  const echo = (text: string, locale: Locale = "en") => {
    document.documentElement.lang = locale;
    return render(<PackSearchEcho text={text} locale={locale} />);
  };
  it("shows nothing for an empty search or plain words", () => {
    for (const q of ["", "   ", "cafe", "cafe main street"]) {
      expect(echo(q).container.innerHTML, q).toBe("");
      cleanup();
    }
  });
  it("says how an operator search is read, one line for each part", () => {
    const { container } = echo("kind:cafe -bar tag:yes");
    expect(container.querySelector("[data-pack-search-echo]")).not.toBeNull();
    expect(screen.getByText("How your search is read")).toBeTruthy();
    const items = within(screen.getByRole("list")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Kind contains “cafe”", "Name, address or kind does not contain “bar”", "Wheelchair tag is Yes"]);
  });
  it("lists what was left out or changed, apart from what the search asks for", () => {
    echo("cafe tag:yess colour:red");
    expect(screen.getByText("Left out or changed")).toBeTruthy();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(within(lists[1]!).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lists[1]!).getAllByRole("listitem")[0]!.textContent).toContain("“tag:yess” was left out");
  });
  it("is only the mistakes when nothing could be read", () => {
    echo("tag:yess");
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.getByText("Left out or changed")).toBeTruthy();
  });
  it("tells a screen reader politely when it changes", () => {
    const { container } = echo("tag:yes");
    expect(container.querySelector("[aria-live]")!.getAttribute("aria-live")).toBe("polite");
  });
  it("updates as the search changes, and goes away again", () => {
    const { container, rerender } = echo("tag:yes");
    expect(container.textContent).toContain("Wheelchair tag is Yes");
    rerender(<PackSearchEcho text="tag:no" locale="en" />);
    expect(container.textContent).toContain("Wheelchair tag is No");
    rerender(<PackSearchEcho text="tag" locale="en" />);
    expect(container.innerHTML).toBe("");
  });
  it("is French in French, with UNKNOWN and no INCONNU", () => {
    const { container } = echo("indication:unknown genre:cafe", "fr");
    expect(plain(container.textContent!)).toContain("Comment votre recherche est comprise");
    expect(plain(container.textContent!)).toContain("L’indication pour fauteuil roulant est UNKNOWN");
    expect(container.textContent).not.toMatch(/inconnu/i);
  });
  it("has no axe violations, in both languages", async () => {
    for (const l of LOCALES) {
      const { container } = echo("cafe tag:yess -bar", l);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      cleanup();
    }
  });
});
const LOCALES: readonly Locale[] = ["en", "fr"];

describe("PackSearchHelp", () => {
  const help = (onTry: (t: string) => void = () => undefined, locale: Locale = "en", list = places) => {
    document.documentElement.lang = locale;
    return render(<PackSearchHelp places={list} locale={locale} onTry={onTry} />);
  };
  const toggle = (locale: Locale = "en") => screen.getByRole("button", { name: locale === "en" ? /^(Show|Hide) the search tips$/ : /^(Afficher|Masquer) les conseils de recherche$/ });
  it("is closed to begin with", () => {
    help();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Examples" })).toBeNull();
  });
  it("opens and closes with the same button", () => {
    help();
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Hide the search tips" })).toBeTruthy();
    fireEvent.click(toggle());
    expect(screen.queryByRole("list", { name: "Examples" })).toBeNull();
  });
  it("says that plain words work as before", () => {
    help();
    fireEvent.click(toggle());
    expect(screen.getByText(/Words work as before/)).toBeTruthy();
  });
  it("lists each example with what it means and how many places in the pack it finds", () => {
    help();
    fireEvent.click(toggle());
    const items = within(screen.getByRole("list", { name: "Examples" })).getAllByRole("listitem");
    expect(items).toHaveLength(searchExamples("en").length);
    expect(items[0]!.querySelector("code")!.textContent).toBe("cafe OR bar");
    expect(items[0]!.textContent).toContain("3 places in the pack.");
    expect(items[3]!.textContent).toContain("1 place in the pack.");
    expect(items[6]!.textContent).toContain("1 place in the pack.");
  });
  it("gives each Try button a name that says which search it tries", () => {
    help();
    fireEvent.click(toggle());
    for (const e of searchExamples("en")) expect(screen.getByRole("button", { name: `Try this search: ${e.text}` })).toBeTruthy();
  });
  it("puts the example in the search box when tried, and does nothing else", () => {
    const onTry = vi.fn();
    help(onTry);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: 'Try this search: "main street"' }));
    expect(onTry).toHaveBeenCalledTimes(1);
    expect(onTry).toHaveBeenCalledWith('"main street"');
  });
  it("counts against the places it is given, so the numbers follow the pack", () => {
    help(undefined, "en", places.slice(0, 2));
    fireEvent.click(toggle());
    const first = within(screen.getByRole("list", { name: "Examples" })).getAllByRole("listitem")[0]!;
    expect(first.textContent).toContain("2 places in the pack.");
  });
  it("is French in French, the French examples and the French colon in the button names", () => {
    help(undefined, "fr");
    fireEvent.click(toggle("fr"));
    expect(screen.getByRole("button", { name: "Essayer cette recherche\u00a0: genre:restaurant -fast" })).toBeTruthy();
    expect(plain(document.body.textContent!)).toContain("fonctionnent comme avant");
    expect(document.body.textContent).not.toMatch(/inconnu/i);
  });
  it("makes no network request and stores nothing", () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    localStorage.clear();
    help();
    fireEvent.click(toggle());
    fireEvent.click(screen.getAllByRole("button", { name: /Try this search/ })[0]!);
    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    vi.unstubAllGlobals();
  });
  for (const l of LOCALES) {
    it(`has no axe violations closed and open, in ${l === "en" ? "English" : "French"}`, async () => {
      const { container } = help(undefined, l);
      expect((await axe.run(container, axeRules)).violations, "closed").toEqual([]);
      fireEvent.click(toggle(l));
      expect((await axe.run(container, axeRules)).violations, "open").toEqual([]);
    });
  }
});
