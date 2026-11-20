/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewCode } from "./ViewCode";
import { EMPTY_VIEW_PARTS, type ViewParts } from "./viewCode";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const OPEN = { en: "Share or load a view", fr: "Partager ou charger une vue" };

function show(over: { view?: ViewParts; locale?: "en" | "fr"; onApply?: (v: ViewParts) => void } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const onApply = over.onApply ?? vi.fn();
  const view = render(<ViewCode view={over.view ?? EMPTY_VIEW_PARTS} locale={locale} onApply={onApply} />);
  fireEvent.click(screen.getByRole("button", { name: OPEN[locale] }));
  return { ...view, onApply };
}
const pasteBox = (locale: "en" | "fr" = "en") => screen.getByLabelText(locale === "en" ? "Paste a view code here" : "Collez un code de vue ici");
const paste = (text: string, locale: "en" | "fr" = "en") => fireEvent.change(pasteBox(locale), { target: { value: text } });
const status = () => document.querySelector("[data-view-code-status]")!.textContent;

describe("opening", () => {
  it("starts closed and shows nothing inside", () => {
    render(<ViewCode view={EMPTY_VIEW_PARTS} locale="en" onApply={() => {}} />);
    expect(screen.getByRole("button", { name: OPEN.en }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Paste a view code here")).toBeNull();
  });
  it("opens and closes with the same button", () => {
    show();
    const b = screen.getByRole("button", { name: OPEN.en });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Paste a view code here")).toBeNull();
  });
});

describe("the code for the current view", () => {
  it("says no search or filter is set instead of showing a code", () => {
    show();
    expect(screen.getByText("No search or filter is set.")).toBeTruthy();
    expect(screen.queryByLabelText("View code (select to copy)")).toBeNull();
  });
  it("shows the code to select, read only", () => {
    show({ view: { ...EMPTY_VIEW_PARTS, text: "ramp", tag: "yes" } });
    const box = screen.getByLabelText("View code (select to copy)") as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toBe("VIEW v1\nsearch: ramp\ntag: yes\n");
  });
  it("keeps typed words raw in the code, even in French", () => {
    show({ locale: "fr", view: { ...EMPTY_VIEW_PARTS, text: "l'été ; a : b ! ?" } });
    expect((screen.getByLabelText("Code de vue (à sélectionner pour copier)") as HTMLTextAreaElement).value).toBe("VIEW v1\nsearch: l'été ; a : b ! ?\n");
  });
});

describe("pasting", () => {
  it("shows nothing until something is pasted", () => {
    show();
    expect(document.querySelector("[data-view-code-plan]")).toBeNull();
  });
  it("shows how many settings the code has and applies nothing until the button is pressed", () => {
    const { onApply } = show();
    paste("VIEW v1\nsearch: ramp\ntag: yes\nkind: cafe");
    expect(screen.getByText("Settings found: 3.")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use this view" }));
    expect(onApply).toHaveBeenCalledWith({ text: "ramp", tag: "yes", kind: "cafe", facets: { source: null, licence: null, tier: null, age: null } });
    expect(status()).toBe("View applied.");
    expect((pasteBox() as HTMLTextAreaElement).value).toBe("");
  });
  it("lists the lines that were left out, as written", () => {
    show();
    paste("VIEW v1\ntag: yes\ncolour: red\ntier: 99");
    expect(screen.getByText("Left out: colour; tier")).toBeTruthy();
  });
  it("explains a paste with nothing usable, and the button stays off", () => {
    const { onApply } = show();
    paste("hello");
    expect(screen.getByText("Nothing in this code can be used here.")).toBeTruthy();
    const b = screen.getByRole("button", { name: "Use this view" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("in French", () => {
  it("uses French words with French spacing and passes the French lint", () => {
    show({ locale: "fr", view: { ...EMPTY_VIEW_PARTS, tag: "yes" } });
    paste("VIEW v1\ntag: yes\nkind: musée\nzzz: 1\nyyy: 2", "fr");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Réglages trouvés\u00a0: 2.");
    expect(text).toContain("Laissé de côté\u00a0: zzz\u202f; yyy");
    expect(text).not.toMatch(/inconnu/i);
    for (const line of [...document.querySelectorAll("p, label, button")].map((e) => e.textContent ?? "").filter((x) => !x.includes("zzz"))) expect(lintFrench(line), line).toEqual([]);
  });
  it("says nothing usable in French", () => {
    show({ locale: "fr" });
    paste("bonjour", "fr");
    expect(screen.getByText("Rien dans ce code ne peut être utilisé ici.")).toBeTruthy();
    paste("VIEW v1\ntag: yes", "fr");
    fireEvent.click(screen.getByRole("button", { name: "Utiliser cette vue" }));
    expect(status()).toBe("Vue appliquée.");
  });
});

describe("accessibility", () => {
  it.each(["en", "fr"] as const)("has no axe violations open, with a pasted code, in %s", async (locale) => {
    const { container } = show({ locale, view: { ...EMPTY_VIEW_PARTS, tag: "yes" } });
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
    paste("VIEW v1\ntag: yes\nzzz: 1", locale);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("uses real buttons and labelled boxes, and announces the result politely", () => {
    show({ view: { ...EMPTY_VIEW_PARTS, tag: "yes" } });
    paste("tag: no");
    for (const name of ["Use this view", OPEN.en]) {
      const b = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(b.tagName).toBe("BUTTON");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
    expect(pasteBox().tagName).toBe("TEXTAREA");
    expect(document.querySelector("[data-view-code-status]")!.getAttribute("aria-live")).toBe("polite");
  });
});
