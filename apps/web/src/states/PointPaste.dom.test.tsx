/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PointPaste } from "./PointPaste.tsx";
import { pointPasteHelp, pointProblemText } from "./pointCopy.ts";
import type { Point } from "./packGeo.ts";
import type { Locale } from "./stateCopy.ts";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

function show(locale: Locale = "en", current: Point | null = null) {
  document.documentElement.lang = locale;
  const onUse = vi.fn();
  const view = render(<PointPaste locale={locale} current={current} onUse={onUse} />);
  const label = locale === "fr" ? "Coller un point (facultatif)" : "Paste a point (optional)";
  const field = () => screen.getByLabelText(label) as HTMLInputElement;
  const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
  return { onUse, view, field, type };
}
const readLine = () => document.querySelector("[data-point-read]") as HTMLElement;
const useButton = () => screen.queryByRole("button", { name: /Use this point|Utiliser ce point/ });

describe("PointPaste before typing", () => {
  it("has a labelled field with the help text and nothing else", () => {
    const { field } = show();
    expect(field().value).toBe("");
    expect(document.body.textContent).toContain(pointPasteHelp("en"));
    expect(useButton()).toBeNull();
    expect(readLine().textContent).toBe("");
    expect(document.querySelector("[data-point-forms]")).toBeNull();
  });
  it("declares its language", () => {
    show("fr");
    expect(document.querySelector("[data-point-paste]")?.getAttribute("lang")).toBe("fr");
  });
  it("has no heading, so it fits under any heading level", () => {
    show();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });
});

describe("PointPaste with a good paste", () => {
  it("says what it read and offers the button", () => {
    const { type } = show();
    type("43.65 N, 79.38 W");
    expect(readLine().textContent).toBe("Read as 43.65000, -79.38000, from degrees with north, south, east or west.");
    expect(useButton()).toBeTruthy();
  });
  it("does not call onUse until the button is pressed", () => {
    const { type, onUse } = show();
    type("43.65, -79.38");
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(useButton() as HTMLElement);
    expect(onUse).toHaveBeenCalledTimes(1);
  });
  it("passes five decimals as text", () => {
    const { type, onUse } = show();
    type("43° 39′ 0″ N, 79° 22′ 48″ W");
    fireEvent.click(useButton() as HTMLElement);
    expect(onUse).toHaveBeenCalledWith("43.65000", "-79.38000");
  });
  it("clears the field and confirms after use, and the button goes", () => {
    const { type, onUse, field } = show();
    type("geo:43.1,-79.2");
    fireEvent.click(useButton() as HTMLElement);
    expect(onUse).toHaveBeenCalledWith("43.10000", "-79.20000");
    expect(field().value).toBe("");
    expect(readLine().textContent).toBe("The latitude and longitude are filled in.");
    expect(useButton()).toBeNull();
  });
  it("drops the confirmation as soon as the person types again", () => {
    const { type } = show();
    type("43.1, -79.2");
    fireEvent.click(useButton() as HTMLElement);
    type("4");
    expect(readLine().textContent).toBe("");
  });
  it("reads a map link and flags a swapped pair", () => {
    const { type, onUse } = show();
    type("151.2093, -33.8688");
    expect(readLine().textContent).toContain("read as the longitude");
    fireEvent.click(useButton() as HTMLElement);
    expect(onUse).toHaveBeenCalledWith("-33.86880", "151.20930");
  });
  it("speaks French for fr", () => {
    const { type, onUse } = show("fr");
    type("43,65 N ; 79,38 O");
    expect(readLine().textContent).toContain("Lu comme 43,65000");
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ce point" }));
    expect(onUse).toHaveBeenCalledWith("43.65000", "-79.38000");
    expect(readLine().textContent).toBe("La latitude et la longitude sont remplies.");
  });
  it("leaves the live line as a polite paragraph, not a status role", () => {
    show();
    expect(readLine().tagName).toBe("P");
    expect(readLine().getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("PointPaste with a bad paste", () => {
  it("shows the problem as the field error and gives no button", () => {
    const { type, onUse } = show();
    type("43.65");
    expect(screen.getByText(pointProblemText("one-number", "en"))).toBeTruthy();
    expect(useButton()).toBeNull();
    expect(onUse).not.toHaveBeenCalled();
  });
  it("marks the field invalid and ties the error to it", () => {
    const { type, field } = show();
    type("100, 200");
    expect(field().getAttribute("aria-invalid")).toBe("true");
    const msg = pointProblemText("out-of-range", "en");
    expect(screen.getByText(msg)).toBeTruthy();
  });
  it("shows each problem in French", () => {
    const { type } = show("fr");
    type("bonjour");
    expect(screen.getByText(pointProblemText("stray-text", "fr"))).toBeTruthy();
  });
  it("recovers when the text is fixed", () => {
    const { type, field } = show();
    type("43.65");
    type("43.65, -79.38");
    expect(field().getAttribute("aria-invalid")).not.toBe("true");
    expect(useButton()).toBeTruthy();
  });
  it("never calls onUse from a bad paste even if the button were pressed twice", () => {
    const { type, onUse } = show();
    type("nope");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(onUse).not.toHaveBeenCalled();
  });
  it("says nothing for blank text and for spaces", () => {
    const { type } = show();
    type("   ");
    expect(readLine().textContent).toBe("");
    expect(useButton()).toBeNull();
  });
});

describe("PointPaste other forms of the current point", () => {
  const cur = { lat: 43.65, lon: -79.38 };
  it("lists five forms when there is a current point", () => {
    show("en", cur);
    const items = within(document.querySelector("[data-point-forms]") as HTMLElement).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Decimal degrees\u00a0: 43.65000, -79.38000",
      "Degrees with N, S, E, W\u00a0: 43.65000° N, 79.38000° W",
      "Degrees and minutes\u00a0: 43° 39.0000′ N, 79° 22.8000′ W",
      "Degrees, minutes and seconds\u00a0: 43° 39′ 0.00″ N, 79° 22′ 48.00″ W",
      "Geo link\u00a0: geo:43.65000,-79.38000",
    ]);
  });
  it("lists them in French with the decimal comma", () => {
    show("fr", cur);
    const first = within(document.querySelector("[data-point-forms]") as HTMLElement).getAllByRole("listitem")[0];
    expect(first?.textContent).toContain("43,65000");
  });
  it("shows none for no current point", () => {
    show("en", null);
    expect(document.querySelector("[data-point-forms]")).toBeNull();
  });
  it("follows the current point as it changes", () => {
    function Host() {
      const [p, setP] = useState<Point | null>(null);
      return (
        <>
          <PointPaste locale="en" current={p} onUse={(a, b) => setP({ lat: Number(a), lon: Number(b) })} />
        </>
      );
    }
    render(<Host />);
    expect(document.querySelector("[data-point-forms]")).toBeNull();
    fireEvent.change(screen.getByLabelText("Paste a point (optional)"), { target: { value: "45, -75" } });
    fireEvent.click(useButton() as HTMLElement);
    expect(document.querySelector("[data-point-forms]")?.textContent).toContain("45.00000, -75.00000");
  });
});

describe("PointPaste is operable and accessible", () => {
  it("reaches the button by keyboard order after the field", () => {
    const { type } = show();
    type("43.65, -79.38");
    const ordered = Array.from(document.querySelectorAll("input, button"));
    expect(ordered[0]?.tagName).toBe("INPUT");
    expect(ordered[1]?.tagName).toBe("BUTTON");
  });
  it("makes the button a real focusable button that does not submit a form", () => {
    const { type } = show();
    type("43.65, -79.38");
    const b = useButton() as HTMLButtonElement;
    expect(b.tagName).toBe("BUTTON");
    expect(b.type).toBe("button");
    b.focus();
    expect(document.activeElement).toBe(b);
  });
  it("can be used inside a form without submitting it", () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    document.documentElement.lang = "en";
    render(
      <form onSubmit={onSubmit}>
        <PointPaste locale="en" onUse={() => undefined} />
      </form>,
    );
    fireEvent.change(screen.getByLabelText("Paste a point (optional)"), { target: { value: "43.65, -79.38" } });
    fireEvent.click(useButton() as HTMLElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  for (const locale of ["en", "fr"] as const) {
    for (const [name, text] of [["empty", ""], ["good", "43.65, -79.38"], ["bad", "43.65"]] as const) {
      it(`has no axe violations: ${locale}, ${name}`, async () => {
        const { type } = show(locale, { lat: 43.65, lon: -79.38 });
        if (text) type(text);
        const r = await axe.run(document.body, axeRules);
        expect(r.violations.map((v) => v.id)).toEqual([]);
      });
    }
  }
});
