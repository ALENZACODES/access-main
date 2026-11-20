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
