/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPackDownloadError,
  getRecoveryMessage,
  RecoveryNotice,
  type RecoveryLocale,
  type RecoveryOperation,
  type RecoveryReason,
} from "./index.ts";

const operations: readonly RecoveryOperation[] = ["pack", "download", "export"];
const reasons: readonly RecoveryReason[] = ["offline", "quota", "permission", "interrupted", "invalid-data", "unknown"];

async function axeViolations(container: HTMLElement) {
  // jsdom has no layout, so colour contrast is checked in the e2e run instead.
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  return results.violations;
}

afterEach(cleanup);

describe("RecoveryNotice", () => {
  it.each(["en", "fr"] as const)("renders every failure as a labelled alert with no axe violations (%s)", async (locale: RecoveryLocale) => {
    for (const operation of operations) {
      for (const reason of reasons) {
        const failure = { operation, reason };
        const message = getRecoveryMessage(failure, locale);
        const { container, unmount } = render(
          <main><h1>Page</h1><RecoveryNotice failure={failure} locale={locale} onRetry={() => undefined} onCheckInput={() => undefined} onDismiss={() => undefined} /></main>,
        );
        const alert = screen.getByRole("alert");
        expect(alert.getAttribute("lang")).toBe(locale);
        expect(screen.getByRole("heading", { level: 2, name: message.title })).toBeTruthy();
        expect(alert.getAttribute("aria-describedby")).toBeTruthy();
        expect(document.getElementById(alert.getAttribute("aria-describedby")!)?.textContent).toBe(message.description);
        for (const button of screen.getAllByRole("button")) {
          expect(button.style.minWidth).toBe("44px");
          expect(button.style.minHeight).toBe("44px");
        }
        expect(await axeViolations(container)).toEqual([]);
        unmount();
      }
    }
  });

  it("calls the matching handler and never shows a primary action without one", () => {
    const onRetry = vi.fn();
    const onCheckInput = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(<RecoveryNotice failure={{ operation: "download", reason: "invalid-data" }} locale="en" onRetry={onRetry} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(<RecoveryNotice failure={{ operation: "export", reason: "invalid-data" }} locale="fr" onCheckInput={onCheckInput} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Corriger les données" }));
    expect(onCheckInput).toHaveBeenCalledTimes(1);

    rerender(<RecoveryNotice failure={{ operation: "export", reason: "invalid-data" }} locale="en" onDismiss={onDismiss} />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Dismiss"]);

    rerender(<RecoveryNotice failure={{ operation: "download", reason: "quota" }} locale="fr" onRetry={onRetry} onDismiss={onDismiss} />);
    expect(screen.getByText(/Aucun fichier ne sera supprimé automatiquement/)).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Fermer"]);
  });

  it("shows provenance only when name, licence and date are all supplied, with French spacing", () => {
    const { rerender, container } = render(<RecoveryNotice failure={{ operation: "pack", reason: "unknown", source: { name: "OpenStreetMap", licence: "ODbL-1.0", date: "2026-11-01" } }} locale="fr" onDismiss={() => undefined} />);
    expect(container.textContent).toContain("Source\u00a0: OpenStreetMap · Licence\u00a0: ODbL-1.0 · Date\u00a0: 2026-11-01");
    rerender(<RecoveryNotice failure={{ operation: "pack", reason: "unknown", source: { name: "OpenStreetMap", licence: "", date: "2026-11-01" } }} locale="fr" onDismiss={() => undefined} />);
    expect(container.textContent).not.toContain("OpenStreetMap");
  });
});

describe("recovery copy", () => {
  it("never claims or denies verification, and FR uses typographic apostrophes and spaces", () => {
    for (const locale of ["en", "fr"] as const) {
      for (const operation of operations) {
        for (const reason of reasons) {
          const message = getRecoveryMessage({ operation, reason }, locale);
          const text = Object.values(message).join(" ");
          expect(text).not.toMatch(/verif|vérif/i);
          expect(text).not.toMatch(/'/);
          if (locale === "fr") expect(text).not.toMatch(/ [:;!?]/);
        }
      }
    }
  });

  it("maps pack download codes without inventing a cause", () => {
    const error = (code: string) => Object.assign(new Error("raw detail"), { code });
    expect(classifyPackDownloadError(error("quota"), true).reason).toBe("quota");
    for (const code of ["bytes", "sha256", "content"]) expect(classifyPackDownloadError(error(code), true).reason).toBe("invalid-data");
    expect(classifyPackDownloadError(error("network"), false).reason).toBe("offline");
    expect(classifyPackDownloadError(error("network"), true).reason).toBe("unknown");
    expect(classifyPackDownloadError(error("missing"), true).reason).toBe("unknown");
    expect(classifyPackDownloadError(new Error("x"), true)).toEqual({ operation: "download", reason: "unknown" });
    expect(JSON.stringify(classifyPackDownloadError(error("bytes"), true))).not.toContain("raw detail");
  });
});
