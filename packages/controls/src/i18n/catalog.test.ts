import { describe, expect, it } from "vitest";
import { ACTION_IDS } from "../types.ts";
import { CATALOGS, LANGS, actionLabel, quote, t } from "./catalog.ts";

const NBSP = " ";
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("catalogs", () => {
  it("have the same keys in English and French", () => {
    expect(Object.keys(CATALOGS.fr).sort()).toEqual(Object.keys(CATALOGS.en).sort());
  });

  it("use the same placeholders in both languages", () => {
    for (const key of Object.keys(CATALOGS.en) as (keyof typeof CATALOGS.en)[]) {
      expect(placeholders(CATALOGS.fr[key]), key).toEqual(placeholders(CATALOGS.en[key]));
    }
  });

  it("have no empty strings", () => {
    for (const lang of LANGS) for (const [key, value] of Object.entries(CATALOGS[lang])) expect(value.trim(), `${lang} ${key}`).not.toBe("");
  });

  it("use non-breaking spaces before : ; ? ! and inside guillemets in French", () => {
    for (const [key, value] of Object.entries(CATALOGS.fr)) {
      expect(value, key).not.toMatch(/ [:;?!»]/);
      expect(value, key).not.toMatch(/« /);
      expect(value, key).not.toMatch(/\d %/);
      if (value.includes("«")) expect(value, key).toContain(`«${NBSP}`);
    }
  });

  it("name no organisation and make no claim of endorsement", () => {
    for (const lang of LANGS) for (const value of Object.values(CATALOGS[lang])) expect(value).not.toMatch(/endorse|partner/i);
  });

  it("says plainly that gaze is simulated and voice is typed, in both languages", () => {
    expect(CATALOGS.en["gaze.intro"]).toMatch(/simulated/i);
    expect(CATALOGS.en["gaze.intro"]).toMatch(/no eye-tracking hardware/i);
    expect(CATALOGS.fr["gaze.intro"]).toMatch(/simulé/i);
    expect(CATALOGS.en["voice.intro"]).toMatch(/does not use a microphone/i);
    expect(CATALOGS.fr["voice.intro"]).toMatch(/n'utilise pas de microphone/i);
  });

  it("interpolates and refuses a missing parameter", () => {
    expect(t("en", "msg.moved", { name: "Option B", position: 2, total: 3 })).toBe("Now on Option B, 2 of 3.");
    expect(() => t("en", "msg.moved", { name: "x" })).toThrow(/position/);
    expect(quote("fr", "suivant")).toBe(`«${NBSP}suivant${NBSP}»`);
    expect(actionLabel("fr", "clear")).toBe("Effacer");
    expect(ACTION_IDS.every((a) => actionLabel("en", a).length > 0)).toBe(true);
  });
});
