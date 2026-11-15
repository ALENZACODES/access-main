// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { PendingSection } from "./Section.tsx";
import { LANE_STRINGS } from "./strings.ts";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "string" ? [`${prefix}${key}`] : keys(child as object, `${prefix}${key}.`),
  );
}

function strings(value: object): string[] {
  return Object.values(value).flatMap((child) => (typeof child === "string" ? [child] : strings(child as object)));
}

afterEach(cleanup);

describe("lane strings", () => {
  it("has the same keys in English and French", () => {
    expect(keys(LANE_STRINGS.fr)).toEqual(keys(LANE_STRINGS.en));
  });

  it("uses a non-breaking space before : ; ? ! in French", () => {
    for (const text of strings(LANE_STRINGS.fr)) {
      expect(text).not.toMatch(/ [:;?!]/);
      expect(text).not.toMatch(/[^\u00A0\u202F\s][:;?!]/);
    }
  });
});

describe("PendingSection", () => {
  async function renderPending(lng: "en" | "fr") {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng, resources: {}, interpolation: { escapeValue: false } });
    return render(
      <I18nextProvider i18n={i18n}>
        <PendingSection section="map" />
      </I18nextProvider>,
    );
  }

  it("is marked pending so the release test does not count it as done", async () => {
    const { container } = await renderPending("en");
    const section = container.querySelector('[data-section-status="pending"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("This section is being connected");
  });

  it("is also pending in French", async () => {
    const { container } = await renderPending("fr");
    expect(container.querySelector('[data-section-status="pending"]')?.textContent).toContain("Cette section est en cours de raccordement");
  });
});
