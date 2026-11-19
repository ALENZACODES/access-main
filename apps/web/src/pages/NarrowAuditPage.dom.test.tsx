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
