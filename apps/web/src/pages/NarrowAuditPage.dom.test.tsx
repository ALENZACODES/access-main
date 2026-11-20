/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { NarrowAuditPage } from "./NarrowAuditPage.tsx";

/** The page heading is part of the first render, so it is there before any effect runs. */
const i18n = initI18n();

afterEach(() => {
  cleanup();
});

const page = () => (
  <I18nextProvider i18n={i18n}>
    <NarrowAuditPage />
  </I18nextProvider>
);

describe("NarrowAuditPage", () => {
  it("has an h1 in the first render, before any effect runs", async () => {
    await act(() => i18n.changeLanguage("en"));
    const html = renderToString(page());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain("Narrow-screen audit");
  });
  it("renders the French heading with a lang attribute", async () => {
    await act(() => i18n.changeLanguage("fr"));
    const html = renderToString(page());
    expect(html).toContain("<h1 lang=\"fr\">Audit écran étroit</h1>");
  });
  it("has exactly one h1 once the panel is mounted, and it comes before the panel", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(container.querySelector('[data-action="run"]')).not.toBeNull();
    expect(headings[0]?.compareDocumentPosition(container.querySelector('[data-action="run"]') as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
  it("keeps the heading in step when the language is switched inside the panel", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const toFrench = container.querySelector('[data-action="lang-fr"]') as HTMLElement;
    await act(async () => {
      toFrench.click();
    });
    expect(container.querySelector("h1")?.textContent).toBe("Audit écran étroit");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const back = container.querySelector('[data-action="lang-en"]') as HTMLElement;
    await act(async () => {
      back.click();
    });
    expect(container.querySelector("h1")?.textContent).toBe("Narrow-screen audit");
  });
  it("sets the document title from the heading", async () => {
    await act(() => i18n.changeLanguage("en"));
    render(page());
    expect(document.title).toBe("Narrow-screen audit — the App");
  });
});

/** "This page on your screen" sits under the audit panel, in the same language, with a real DOM under it. */
describe("NarrowAuditPage: this page on your screen", () => {
  const settle = async () => {
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
  };
  const fill = (container: HTMLElement, kind: string, what: string) => {
    (container.querySelector(`#fit-kind-${kind}`) as HTMLInputElement).checked = true;
    (container.querySelector("#fit-what") as HTMLTextAreaElement).value = what;
  };
  const press = async (container: HTMLElement, action: string) => {
    await act(async () => {
      (container.querySelector(`[data-action="${action}"]`) as HTMLElement).click();
    });
    await settle();
  };

  it("is on the page under one h2, after the audit panel, and the page keeps one h1", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const h2 = container.querySelector("#fit-h") as HTMLElement;
    expect(h2.tagName).toBe("H2");
    expect(h2.textContent).toBe("This page on your screen");
    const run = container.querySelector('[data-action="run"]') as Node;
    expect(run.compareDocumentPosition(h2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(container.querySelectorAll(".fit")).toHaveLength(1);
  });

  it("shows UNKNOWN for what this browser does not report, and a width when it has one", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const cells = [...container.querySelectorAll(".fit tbody tr")].map((tr) => [tr.querySelector("th")?.textContent, tr.querySelector("td")?.textContent]);
    expect(cells).toHaveLength(10);
    // jsdom has a window size and no matchMedia.
    expect(cells[0]).toEqual(["Width of the page area", `${window.innerWidth} CSS pixels`]);
    expect(cells.find((c) => c[0] === "Reduced motion")?.[1]).toBe("UNKNOWN");
    expect(cells.find((c) => c[0] === "Pointer")?.[1]).toBe("UNKNOWN");
  });

  it("every field has a label a person can find it by", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    for (const id of ["fit-kind-cut-off", "fit-kind-other", "fit-what", "fit-settings", "fit-findings"]) {
      const field = container.querySelector(`#${id}`) as HTMLInputElement;
      expect(field.labels?.length, id).toBe(1);
      expect(field.labels?.[0]?.textContent?.trim(), id).not.toBe("");
    }
  });

  it("refuses an empty form: errors in text, fields marked, focus on the first one", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, "fit-make");
    const kind = container.querySelector("#fit-kind") as HTMLFieldSetElement;
    expect(kind.getAttribute("role")).toBe("radiogroup");
    expect(container.querySelector(`#${kind.getAttribute("aria-labelledby")}`)?.textContent).toBe("Kind of barrier");
    expect(kind.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(`#${kind.getAttribute("aria-describedby")}`)?.textContent).toBe("Choose the kind of barrier.");
    const what = container.querySelector("#fit-what") as HTMLTextAreaElement;
    expect(what.getAttribute("aria-invalid")).toBe("true");
    for (const id of (what.getAttribute("aria-describedby") ?? "").split(" ")) expect(container.querySelector(`#${id}`), id).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#fit-kind-cut-off"));
    expect(container.querySelector(".fit [role=status]")?.textContent).toContain("The text could not be prepared.");
    expect(container.querySelector("#fit-text")).toBeNull();
  });

  it("prepares a text from the answers, focuses it, and offers it as a file", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    fill(container, "cut-off", "The table runs off the right edge.");
    await press(container, "fit-make");
    const text = container.querySelector("#fit-text") as HTMLTextAreaElement;
    expect(text.readOnly).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(text.value).toContain("Barrier met in the App");
    expect(text.value).toContain("Kind of barrier: Something is cut off or needs sideways scrolling");
    expect(text.value).toContain("The table runs off the right edge.");
    expect(text.value).toContain("Reduced motion: UNKNOWN");
    expect(text.value).toMatch(/^Page: \/[^?#\n]*$/m);
    const save = container.querySelector('[data-action="fit-save"]') as HTMLAnchorElement;
    expect(save.getAttribute("download")).toMatch(/^barrier-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(decodeURIComponent((save.getAttribute("href") ?? "").split(",")[1] ?? "")).toBe(text.value);
    expect(container.querySelector("#fit-kind")?.getAttribute("aria-invalid")).toBeNull();
    // The answers are still in the form after the re-render.
    expect((container.querySelector("#fit-kind-cut-off") as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector("#fit-what") as HTMLTextAreaElement).value).toBe("The table runs off the right edge.");
  });

  it("leaves the settings out of the text when the box is cleared", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    fill(container, "other", "Something else got in my way.");
    (container.querySelector("#fit-settings") as HTMLInputElement).checked = false;
    await press(container, "fit-make");
    const value = (container.querySelector("#fit-text") as HTMLTextAreaElement).value;
    expect(value).not.toContain("Reduced motion");
    expect(value).toContain("Kind of barrier: Something else");
    expect((container.querySelector("#fit-settings") as HTMLInputElement).checked).toBe(false);
  });

  it("erases the answers and the text", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    fill(container, "moves", "The banner slides away too fast.");
    await press(container, "fit-make");
    await press(container, "fit-clear");
    expect(container.querySelector("#fit-text")).toBeNull();
    expect(container.querySelector('input[name="fit-kind"]:checked')).toBeNull();
    expect((container.querySelector("#fit-what") as HTMLTextAreaElement).value).toBe("");
    expect(document.activeElement).toBe(container.querySelector("#fit-kind-cut-off"));
    expect(container.querySelector(".fit [role=status]")?.textContent).toBe("Your answers and the text were erased.");
  });

  it("follows the language of the audit panel and keeps what the person wrote", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    fill(container, "too-small", "The close button is too small.");
    await act(async () => {
      (container.querySelector('[data-action="lang-fr"]') as HTMLElement).click();
    });
    expect(container.querySelectorAll(".fit")).toHaveLength(1);
    expect(container.querySelector("#fit-h")?.textContent).toBe("Cette page sur votre écran");
    expect(container.querySelector(".fit")?.parentElement?.getAttribute("lang")).toBe("fr");
    expect((container.querySelector("#fit-kind-too-small") as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector("#fit-what") as HTMLTextAreaElement).value).toBe("The close button is too small.");
    await press(container, "fit-make");
    expect((container.querySelector("#fit-text") as HTMLTextAreaElement).value).toContain("Obstacle rencontré dans l’App");
    expect(container.querySelector('[data-action="fit-save"]')?.getAttribute("download")).toMatch(/^obstacle-/);
  });

  it("starts in French when the app is in French", async () => {
    await act(() => i18n.changeLanguage("fr"));
    const { container } = render(page());
    expect(container.querySelector("#fit-h")?.textContent).toBe("Cette page sur votre écran");
    expect(container.querySelector('[data-action="fit-make"]')?.textContent).toBe("Préparer le texte");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("clicks in the fit panel do not reach the audit panel, and the other way round", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const auditBefore = container.querySelector('[data-action="run"]')?.parentElement?.innerHTML;
    await press(container, "fit-refresh");
    expect(container.querySelector(".fit [role=status]")?.textContent).toBe("Settings read again.");
    expect(container.querySelector('[data-action="run"]')?.parentElement?.innerHTML).toBe(auditBefore);
  });

  it("leaves nothing behind when the page goes away", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container, unmount } = render(page());
    expect(container.querySelector(".fit")).not.toBeNull();
    unmount();
    expect(document.querySelector(".fit")).toBeNull();
  });
});

/** "Look by hand" sits last on the page, in the same language, with a real DOM under it. */
describe("NarrowAuditPage: look by hand", () => {
  const press = async (container: HTMLElement, action: string) => {
    await act(async () => {
      (container.querySelector(`.hand [data-action="${action}"]`) as HTMLElement).click();
    });
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
  };
  const choose = (container: HTMLElement, result: string, note = "") => {
    (container.querySelector(`#hand-result-${result}`) as HTMLInputElement).checked = true;
    (container.querySelector("#hand-note") as HTMLTextAreaElement).value = note;
  };
  const stepHeading = (container: HTMLElement) => container.querySelector("#hand-step-h") as HTMLElement;

  it("is on the page once, under an h2, after the other two panels, and the page keeps one h1", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll(".hand")).toHaveLength(1);
    const h2 = container.querySelector("#hand-h") as HTMLElement;
    expect(h2.tagName).toBe("H2");
    expect(h2.textContent).toBe("Look by hand");
    expect((container.querySelector("#fit-h") as Node).compareDocumentPosition(h2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("every field has one label, and the choices are a named group", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    for (const id of ["hand-who", "hand-earlier", "hand-note", "hand-need-keyboard", "hand-need-media", "hand-result-problem", "hand-result-not-sure"]) {
      const field = container.querySelector(`#${id}`) as HTMLInputElement;
      expect(field.labels?.length, id).toBe(1);
      expect(field.labels?.[0]?.textContent?.trim(), id).not.toBe("");
    }
    const group = container.querySelector("#hand-result") as HTMLElement;
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(container.querySelector(`#${group.getAttribute("aria-labelledby")}`)?.textContent).toBe("What I found");
    expect(container.querySelectorAll('input[name="hand-result"]')).toHaveLength(3);
  });

  it("does not save without a choice: the group is marked, the message is by it, focus is on the first choice", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const before = stepHeading(container).textContent;
    await press(container, "hand-save-next");
    const group = container.querySelector("#hand-result") as HTMLElement;
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(`#${group.getAttribute("aria-describedby")}`)?.textContent).toBe("Choose what you found.");
    expect(document.activeElement).toBe(container.querySelector("#hand-result-problem"));
    expect(stepHeading(container).textContent).toBe(before);
    expect(container.querySelector(".hand [role=status]")?.textContent).toBe("The answer was not saved. Choose what you found.");
  });

  it("asks what was seen for a problem, and keeps the choice", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    choose(container, "problem");
    await press(container, "hand-save");
    const note = container.querySelector("#hand-note") as HTMLTextAreaElement;
    expect(note.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(note);
    expect(container.querySelector("#hand-note-error")?.textContent).toBe("Say what you saw, and on which page.");
    expect((container.querySelector("#hand-result-problem") as HTMLInputElement).checked).toBe(true);
  });

  it("saves an answer, moves to the next step and puts focus on its heading", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(stepHeading(container).textContent).toMatch(/^Step 1 of \d+: /);
    choose(container, "no-problem-found");
    await press(container, "hand-save-next");
    expect(stepHeading(container).textContent).toMatch(/^Step 2 of \d+: /);
    expect(document.activeElement).toBe(stepHeading(container));
    expect(stepHeading(container).tabIndex).toBe(-1);
    expect(container.querySelector('input[name="hand-result"]:checked')).toBeNull();
    expect((container.querySelector("#hand-note") as HTMLTextAreaElement).value).toBe("");
    expect(container.querySelector('.hand [data-action="hand-list"]')?.textContent).toMatch(/^Show all steps \(1 of \d+ looked at\)$/);
  });

  it("goes back to a saved step and shows the answer in the form and in words", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    choose(container, "problem", "The form says to press the green button.");
    await press(container, "hand-save-next");
    await press(container, "hand-previous");
    expect((container.querySelector("#hand-result-problem") as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector("#hand-note") as HTMLTextAreaElement).value).toBe("The form says to press the green button.");
    expect(container.querySelector(".hand")?.textContent).toContain("Saved answer: I saw a problem. The form says to press the green button.");
    expect(container.querySelector('.hand [data-action="hand-clear"]')).not.toBeNull();
  });

  it("shows the list of all steps from its button, jumps to a step, and the list stays shown", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const toggle = () => container.querySelector('.hand [data-action="hand-list"]') as HTMLButtonElement;
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#hand-all")).toBeNull();
    await press(container, "hand-list");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(`#${toggle().getAttribute("aria-controls")}`)?.tagName).toBe("OL");
    expect(document.activeElement).toBe(toggle());
    await press(container, "hand-go-1-4-10");
    expect(stepHeading(container).textContent).toContain("1.4.10 Reflow (AA)");
    expect(container.querySelector("#hand-all")).not.toBeNull();
    expect(container.querySelector('.hand [aria-current="step"]')?.textContent).toContain("1.4.10 Reflow (AA)");
  });

  it("shows more steps when the person has more at hand", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, "hand-list");
    const count = () => container.querySelectorAll('.hand [data-action^="hand-go-"]').length;
    const before = count();
    (container.querySelector("#hand-need-screen-reader") as HTMLInputElement).checked = true;
    await press(container, "hand-needs");
    expect(count()).toBeGreaterThan(before);
    expect((container.querySelector("#hand-need-screen-reader") as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector(".hand [role=status]")?.textContent).toBe("The steps were updated.");
  });

  it("asks who looked before it prepares the log, then gives a log the tool reads and a file to save", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    choose(container, "not-sure", "Ask the design lead.");
    await press(container, "hand-save");
    await press(container, "hand-export");
    const who = container.querySelector("#hand-who") as HTMLInputElement;
    expect(who.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(who);
    expect(container.querySelector("#hand-log")).toBeNull();
    who.value = "@sam";
    await press(container, "hand-export");
    const log = container.querySelector("#hand-log") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(log);
    expect(log.readOnly).toBe(true);
    const data = JSON.parse(log.value) as { version: number; notes: Array<Record<string, string>> };
    expect(data.version).toBe(1);
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0]).toMatchObject({ result: "not-sure", by: "@sam", note: "Ask the design lead." });
    expect(data.notes[0]?.["on"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const save = container.querySelector('.hand [data-action="hand-save-file"]') as HTMLAnchorElement;
    expect(save.getAttribute("download")).toMatch(/^narrow-audit\.manual-log\.\d{4}-\d{2}-\d{2}\.json$/);
    expect(decodeURIComponent((save.getAttribute("href") ?? "").split(",")[1] ?? "")).toBe(log.value);
    expect((container.querySelector("#hand-summary") as HTMLTextAreaElement).value).toContain("I am not sure. Ask the design lead.");
  });

  it("reads an earlier log that was pasted, and shows the last look at a step", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    (container.querySelector("#hand-earlier") as HTMLTextAreaElement).value = JSON.stringify({
      version: 1,
      notes: [{ sc: "1.4.10", result: "problem", on: "2026-01-15", by: "@lee", note: "The table is cut off." }],
    });
    await press(container, "hand-read");
    expect(container.querySelector(".hand [role=status]")?.textContent).toBe("1 note read from the earlier log.");
    expect((container.querySelector("#hand-earlier") as HTMLTextAreaElement).value).toBe("");
    await press(container, "hand-list");
    await press(container, "hand-go-1-4-10");
    expect(container.querySelector(".hand")?.textContent).toContain("Looked on 2026-01-15 by @lee");
    expect(container.querySelector(".hand")?.textContent).toContain("a problem was seen. The table is cut off.");
  });

  it("says why a pasted log cannot be read, by the field, and keeps what was pasted", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    (container.querySelector("#hand-earlier") as HTMLTextAreaElement).value = "not a log";
    await press(container, "hand-read");
    const field = container.querySelector("#hand-earlier") as HTMLTextAreaElement;
    expect(field.value).toBe("not a log");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("#hand-earlier-error")?.textContent).toBe("The by-hand log is not valid JSON.");
    expect(document.activeElement).toBe(field);
  });

  it("follows the language of the audit panel and keeps the session", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    (container.querySelector("#hand-who") as HTMLInputElement).value = "@sam";
    choose(container, "problem", "The menu cannot be opened.");
    await press(container, "hand-save-next");
    choose(container, "not-sure", "Half written");
    await act(async () => {
      (container.querySelector('[data-action="lang-fr"]') as HTMLElement).click();
    });
    expect(container.querySelectorAll(".hand")).toHaveLength(1);
    expect(container.querySelector("#hand-h")?.textContent).toBe("Regarder à la main");
    expect(container.querySelector(".hand")?.parentElement?.getAttribute("lang")).toBe("fr");
    expect((container.querySelector("#hand-who") as HTMLInputElement).value).toBe("@sam");
    expect(stepHeading(container).textContent).toMatch(/^Étape 2 sur \d+/);
    expect((container.querySelector("#hand-result-not-sure") as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector("#hand-note") as HTMLTextAreaElement).value).toBe("Half written");
    expect(container.querySelector('.hand [data-action="hand-list"]')?.textContent).toMatch(/^Afficher toutes les étapes \(1 sur \d+ regardée\)$/);
    await press(container, "hand-export");
    expect((container.querySelector("#hand-summary") as HTMLTextAreaElement).value).toContain("J’ai vu un problème. The menu cannot be opened.");
  });

  it("erases every answer when asked, and keeps the name", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    (container.querySelector("#hand-who") as HTMLInputElement).value = "@sam";
    choose(container, "no-problem-found");
    await press(container, "hand-save-next");
    await press(container, "hand-reset");
    expect(stepHeading(container).textContent).toMatch(/^Step 1 of /);
    expect(container.querySelector('.hand [data-action="hand-list"]')?.textContent).toMatch(/^Show all steps \(0 of /);
    expect((container.querySelector("#hand-who") as HTMLInputElement).value).toBe("@sam");
    expect(container.querySelector(".hand [role=status]")?.textContent).toBe("All answers were erased.");
  });

  it("leaves the other two panels alone, and leaves nothing behind when the page goes away", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container, unmount } = render(page());
    const fitBefore = container.querySelector(".fit")?.innerHTML;
    const auditBefore = container.querySelector('[data-action="run"]')?.parentElement?.innerHTML;
    choose(container, "no-problem-found");
    await press(container, "hand-save-next");
    expect(container.querySelector(".fit")?.innerHTML).toBe(fitBefore);
    expect(container.querySelector('[data-action="run"]')?.parentElement?.innerHTML).toBe(auditBefore);
    unmount();
    expect(document.querySelector(".hand")).toBeNull();
  });
});

/** "Button size for my taps" sits between the fit panel and "Look by hand", with a real DOM under it. */
describe("NarrowAuditPage: button size for my taps", () => {
  const TOTAL = 16;
  const press = async (container: HTMLElement, selector: string) => {
    await act(async () => {
      (container.querySelector(selector) as HTMLElement).click();
    });
  };
  const area = (container: HTMLElement) => container.querySelector(".tap-area") as HTMLElement;

  it("is on the page once, under an h2, between the fit panel and Look by hand", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(container.querySelectorAll(".tap")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const h2 = container.querySelector("#tap-h") as HTMLElement;
    expect(h2.tagName).toBe("H2");
    expect(h2.textContent).toBe("Button size for my taps");
    expect((container.querySelector("#fit-h") as Node).compareDocumentPosition(h2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(h2.compareDocumentPosition(container.querySelector("#hand-h") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("starts the test with a target named by its visible text, inside a named area, with focus on it", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.tap [data-action="tap-start"]');
    const target = container.querySelector("#tap-target") as HTMLButtonElement;
    expect(document.activeElement).toBe(target);
    expect(target.textContent).toBe("Tap here");
    expect(target.getAttribute("aria-label")).toBe(`Tap here, target 1 of ${TOTAL}`);
    expect(area(container).getAttribute("role")).toBe("group");
    expect(area(container).getAttribute("aria-label")).toBe("Area of the test");
    expect(area(container).contains(target)).toBe(true);
    expect(container.querySelector("#tap-run-h")?.textContent).toBe(`Target 1 of ${TOTAL}, 96 CSS pixels`);
  });

  it("counts a tap on the target as landed and a tap on the area as missed", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.tap [data-action="tap-start"]');
    await press(container, "#tap-target");
    expect(container.querySelector("#tap-run-h")?.textContent).toMatch(/^Target 2 of /);
    await act(async () => {
      area(container).click();
    });
    expect(container.querySelector("#tap-run-h")?.textContent).toMatch(/^Target 3 of /);
    await press(container, '.tap [data-action="tap-stop"]');
    const rows = [...container.querySelectorAll(".tap tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));
    expect(rows[0]).toEqual(["96 CSS pixels", "2 of 4", "1"]);
    expect(rows[3]).toEqual(["44 CSS pixels", "0 of 4", "UNKNOWN"]);
    expect(document.activeElement).toBe(container.querySelector("#tap-result-h"));
    expect(container.querySelector(".tap [role=status]")?.textContent).toBe("The test was stopped.");
  });

  it("gives a size, the zoom for the App and the controls of this page that are smaller", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.tap [data-action="tap-start"]');
    for (let i = 0; i < TOTAL; i += 1) {
      if (i === 9) {
        await act(async () => {
          area(container).click();
        });
      } else await press(container, "#tap-target");
    }
    const tap = container.querySelector(".tap") as HTMLElement;
    expect(tap.textContent).toContain("On this screen, today, every tap landed from 72 CSS pixels up.");
    expect(tap.textContent).toContain("A browser zoom of 175% brings them to 77 CSS pixels or more.");
    expect(container.querySelector("#tap-page-h")?.textContent).toBe("Controls of this page");
    expect(container.querySelector("#tap-target")).toBeNull();
  });

  it("follows the language of the audit panel and keeps a finished result", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.tap [data-action="tap-start"]');
    await press(container, '.tap [data-action="tap-stop"]');
    await act(async () => {
      (container.querySelector('[data-action="lang-fr"]') as HTMLElement).click();
    });
    expect(container.querySelectorAll(".tap")).toHaveLength(1);
    expect(container.querySelector("#tap-h")?.textContent).toBe("Taille de bouton pour mes appuis");
    expect(container.querySelector(".tap")?.parentElement?.getAttribute("lang")).toBe("fr");
    expect(container.querySelector(".tap")?.textContent).toContain("Taille UNKNOWN.");
    expect(container.querySelector('.tap [data-action="tap-again"]')?.textContent).toBe("Refaire le test");
  });

  it("leaves the other panels alone, and leaves nothing behind when the page goes away", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container, unmount } = render(page());
    const handBefore = container.querySelector(".hand")?.innerHTML;
    await press(container, '.tap [data-action="tap-start"]');
    await press(container, "#tap-target");
    expect(container.querySelector(".hand")?.innerHTML).toBe(handBefore);
    unmount();
    expect(document.querySelector(".tap")).toBeNull();
  });
});

/** The tap size goes into the barrier text of the fit panel once the test is over. */
describe("NarrowAuditPage: the tap size in the barrier text", () => {
  const prepare = async (container: HTMLElement) => {
    (container.querySelector("#fit-kind-too-small") as HTMLInputElement).checked = true;
    (container.querySelector("#fit-what") as HTMLTextAreaElement).value = "The close button is too small to press.";
    await act(async () => {
      (container.querySelector('[data-action="fit-make"]') as HTMLElement).click();
    });
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    return (container.querySelector("#fit-text") as HTMLTextAreaElement).value;
  };

  it("has no tap line before the test, and one after it, in the language of the page", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(await prepare(container)).not.toContain("Button size");
    await act(async () => {
      (container.querySelector('.tap [data-action="tap-start"]') as HTMLElement).click();
    });
    for (let i = 0; i < 16; i += 1) {
      await act(async () => {
        (container.querySelector("#tap-target") as HTMLElement).click();
      });
    }
    expect(await prepare(container)).toContain("Button size at which my taps land: 44 CSS pixels");
  });

  it("keeps the tap line after a language switch", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await act(async () => {
      (container.querySelector('.tap [data-action="tap-start"]') as HTMLElement).click();
    });
    await act(async () => {
      (container.querySelector('.tap [data-action="tap-stop"]') as HTMLElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-action="lang-fr"]') as HTMLElement).click();
    });
    expect(await prepare(container)).toContain("Taille de bouton où mes appuis atteignent leur cible\u00A0: UNKNOWN");
  });
});

/** "Reaching controls by keyboard or switch" comes last, with a real DOM under it. jsdom lays nothing out, so each element is given a box. */
describe("NarrowAuditPage: reaching controls by keyboard or switch", () => {
  const original = Element.prototype.getBoundingClientRect;
  const withBoxes = () => {
    Element.prototype.getBoundingClientRect = function box(): DOMRect {
      return { x: 0, y: 0, top: 0, left: 0, right: 50, bottom: 20, width: 50, height: 20, toJSON: () => ({}) } as DOMRect;
    };
  };
  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
  });
  const press = async (container: HTMLElement, selector: string) => {
    await act(async () => {
      (container.querySelector(selector) as HTMLElement).click();
    });
  };

  it("is on the page once, under an h2, after Look by hand, and the page keeps one h1", async () => {
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    expect(container.querySelectorAll(".reach")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const h2 = container.querySelector("#reach-h") as HTMLElement;
    expect(h2.tagName).toBe("H2");
    expect(h2.textContent).toBe("Reaching controls by keyboard or switch");
    expect((container.querySelector("#hand-h") as Node).compareDocumentPosition(h2)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("counts the stops of the other panels, leaves its own out, and puts focus on the result", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    const outside = [...container.querySelectorAll("a[href],button,input,select,textarea,summary")].filter(
      (e) => !e.closest(".reach") && !(e as HTMLButtonElement).disabled && (e as HTMLElement).tabIndex >= 0 && !(e instanceof HTMLInputElement && e.type === "hidden"),
    );
    await press(container, '.reach [data-action="reach-count"]');
    expect(document.activeElement).toBe(container.querySelector("#reach-result-h"));
    const summary = container.querySelector("#reach-result-h + p")?.textContent ?? "";
    const n = Number(/has (\d+) keyboard/.exec(summary)?.[1]);
    expect(n).toBeGreaterThan(10);
    // Radio groups are one stop, so there are no more stops than tabbable elements outside the panel.
    expect(n).toBeLessThanOrEqual(outside.length);
    expect(container.querySelector(".reach [role=status]")?.textContent).toBe("The stops were counted.");
    expect(container.querySelector(".reach")?.textContent).not.toContain("Count the stops on this page");
  });

  it("has a label for each field, takes an interval with a comma in French, and gives times", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("fr"));
    const { container } = render(page());
    await press(container, '.reach [data-action="reach-count"]');
    for (const id of ["reach-interval", "reach-find"]) expect(container.querySelectorAll(`label[for="${id}"]`)).toHaveLength(1);
    (container.querySelector("#reach-interval") as HTMLInputElement).value = "1,5";
    await press(container, '.reach [data-action="reach-apply"]');
    expect(document.activeElement).toBe(container.querySelector('.reach [data-action="reach-apply"]'));
    expect(container.querySelector("#reach-result-h + p")?.textContent).toMatch(/balayage d’un pas toutes les 1,5\u00A0s\.$/);
    expect(container.querySelector(".reach tbody td:last-child")?.textContent).toBe("1,5\u00A0s");
  });

  it("marks a wrong interval by the field and puts focus on it", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.reach [data-action="reach-count"]');
    (container.querySelector("#reach-interval") as HTMLInputElement).value = "soon";
    await press(container, '.reach [data-action="reach-apply"]');
    const field = container.querySelector("#reach-interval") as HTMLInputElement;
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    for (const id of (field.getAttribute("aria-describedby") ?? "").split(" ")) expect(container.querySelector(`#${id}`), id).not.toBeNull();
    expect(container.querySelector("#reach-interval-error")?.textContent).toBe("Write a number of seconds from 0.2 to 10, such as 1.5.");
  });

  it("finds a control of another panel by part of its name", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.reach [data-action="reach-count"]');
    (container.querySelector("#reach-find") as HTMLInputElement).value = "start the test";
    await press(container, '.reach [data-action="reach-apply"]');
    const rows = [...container.querySelectorAll(".reach table:last-of-type tbody tr")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector("th")?.textContent).toBe(container.querySelector('.tap [data-action="tap-start"]')?.textContent);
  });

  it("follows the language of the audit panel and keeps the counts", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("en"));
    const { container } = render(page());
    await press(container, '.reach [data-action="reach-count"]');
    await act(async () => {
      (container.querySelector('[data-action="lang-fr"]') as HTMLElement).click();
    });
    expect(container.querySelectorAll(".reach")).toHaveLength(1);
    expect(container.querySelector("#reach-h")?.textContent).toBe("Atteindre les commandes au clavier ou au contacteur");
    expect(container.querySelector(".reach")?.parentElement?.getAttribute("lang")).toBe("fr");
    expect(container.querySelector("#reach-result-h")?.textContent).toBe("Ce qui a été compté");
  });

  it("leaves the other panels alone, and leaves nothing behind when the page goes away", async () => {
    withBoxes();
    await act(() => i18n.changeLanguage("en"));
    const { container, unmount } = render(page());
    const tapBefore = container.querySelector(".tap")?.innerHTML;
    const handBefore = container.querySelector(".hand")?.innerHTML;
    await press(container, '.reach [data-action="reach-count"]');
    expect(container.querySelector(".tap")?.innerHTML).toBe(tapBefore);
    expect(container.querySelector(".hand")?.innerHTML).toBe(handBefore);
    unmount();
    expect(document.querySelector(".reach")).toBeNull();
  });
});
