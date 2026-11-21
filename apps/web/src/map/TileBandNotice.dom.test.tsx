/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { mapMessages } from "./i18n.ts";
import { TileBandNotice, type TileFailure } from "./TileBandNotice.tsx";

const i18n = initI18n();
const failures: TileFailure[] = [
  { file: { key: "odbl/n44", family: "odbl", band: { lat: "n44", lon: null } }, reason: "integrity" },
  { file: { key: "odbl/n43-w080", family: "odbl", band: { lat: "n43", lon: "w080" } }, reason: "network" },
  { file: { key: "open", family: "open", band: { lat: null, lon: null } }, reason: "integrity" },
];

const expected = {
  en: [
    "Map data for OpenStreetMap places, latitude 44° to 45° N is unavailable: its file did not pass the integrity check. Other map data still loads.",
    "Map data for OpenStreetMap places, latitude 43° to 44° N, longitude 80° to 79° W is unavailable: its file could not be downloaded and is not saved on this device. Other map data still loads.",
    "Map data for other open data places is unavailable: its file did not pass the integrity check. Other map data still loads.",
  ],
  fr: [
    "Les données cartographiques pour lieux OpenStreetMap, latitude 44° à 45° N sont indisponibles : leur fichier n’a pas réussi le contrôle d’intégrité. Les autres données de la carte se chargent toujours.",
    "Les données cartographiques pour lieux OpenStreetMap, latitude 43° à 44° N, longitude 80° à 79° O sont indisponibles : leur fichier n’a pas pu être téléchargé et n’est pas enregistré sur cet appareil. Les autres données de la carte se chargent toujours.",
    "Les données cartographiques pour lieux d’autres données ouvertes sont indisponibles : leur fichier n’a pas réussi le contrôle d’intégrité. Les autres données de la carte se chargent toujours.",
  ],
} as const;

async function view(lang: "en" | "fr", props: Parameters<typeof TileBandNotice>[0]) {
  await i18n.changeLanguage(lang);
  return render(<I18nextProvider i18n={i18n}><main><TileBandNotice {...props} /></main></I18nextProvider>);
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(cleanup);

describe("unavailable map data files", () => {
  it.each(["en", "fr"] as const)("names each unavailable band and why, in a status region (%s)", async (lang) => {
    const { container } = await view(lang, { failures, listUnavailable: false });
    const status = screen.getByTestId("map-tile-status");
    expect(status.getAttribute("role")).toBe("status");
    const items = [...status.querySelectorAll("li")].map((item) => item.textContent?.replace(/\u00a0/g, " "));
    expect(items).toEqual(expected[lang]);
    const results = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it.each(["en", "fr"] as const)("says when the tile list itself could not be read (%s)", async (lang) => {
    await view(lang, { failures: [], listUnavailable: true });
    expect(screen.getByTestId("map-tile-status").textContent).toBe(mapMessages[lang].map.tileListUnavailable);
  });

  it("is an empty status region when every file loaded", async () => {
    await view("en", { failures: [], listUnavailable: false });
    expect(screen.getByTestId("map-tile-status").textContent).toBe("");
  });

  it.each(["en", "fr"] as const)("credits OpenStreetMap with the exact required wording (%s)", (lang) => {
    expect(mapMessages[lang].map.attribution).toBe("© OpenStreetMap contributors");
  });
});
