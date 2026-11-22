// Behaviour audit of the files the privacy page lets a person download from its lists (the offline workers, the
// questions to the browser, the addresses). For each, in both languages and in several time zones: the file name
// holds the local date and nothing finer; the content holds dates and no time of day; and the content is the same
// whatever the zone, so the only thing in a file that depends on the device's zone is the date in its name.

import { afterEach, describe, expect, it } from "vitest";
import { ADDRESS_REGISTER, CALL_REGISTER } from "../panel/addressRegister";
import { addressesAsCsv, addressesAsText } from "../panel/addressExport";
import type { AddressRegisterView } from "../panel/addressView";
import { AUTO_REGISTER } from "../panel/autoRegister";
import { autoAsCsv, autoAsText } from "../panel/autoSection";
import { BROWSER_REGISTER } from "../panel/browserRegister";
import { browserAsCsv, browserAsText } from "../panel/browserSection";
import type { ExportFile } from "../panel/localData";
import { findTimes, finestPrecision, tallyPrecision } from "./tmText";

const ZONES = ["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Pago_Pago"] as const;
const NOW = new Date("2026-11-22T04:30:15.123Z");
const original = process.env.TZ;
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

const view = { addresses: ADDRESS_REGISTER, calls: CALL_REGISTER } as unknown as AddressRegisterView;
type Make = (locale: "en" | "fr", now: Date) => ExportFile;
const MAKERS: ReadonlyArray<[string, Make]> = [
  ["auto csv", (l, n) => autoAsCsv(l, AUTO_REGISTER, n)],
  ["auto text", (l, n) => autoAsText(l, AUTO_REGISTER, n)],
  ["browser csv", (l, n) => browserAsCsv(l, BROWSER_REGISTER, n)],
  ["browser text", (l, n) => browserAsText(l, BROWSER_REGISTER, n)],
  ["addresses csv", (l, n) => addressesAsCsv(l, view, n)],
  ["addresses text", (l, n) => addressesAsText(l, view, n)],
];
const build = (make: Make, locale: "en" | "fr", tz: string, now = NOW): ExportFile => {
  process.env.TZ = tz;
  return make(locale, now);
};

describe.each(MAKERS)("%s", (_name, make) => {
  it.each(["en", "fr"] as const)("holds only dates in its content, in %s", (locale) => {
    const t = findTimes(make(locale, NOW).text);
    expect(t.length).toBeGreaterThan(0);
    expect(finestPrecision(t)).toBe("date");
  });
  it.each(["en", "fr"] as const)("is the same content in every zone, in %s", (locale) => {
    const base = build(make, locale, "UTC").text;
    for (const tz of ZONES) expect(build(make, locale, tz).text, tz).toBe(base);
  });
  it("writes the local date in its name and nothing finer", () => {
    for (const tz of ZONES) {
      const f = build(make, "en", tz);
      const t = findTimes(f.filename);
      expect(t, `${tz} ${f.filename}`).toHaveLength(1);
      expect(t[0]?.precision).toBe("date");
    }
  });
  it("names the file with the date of the device: Toronto is a day behind UTC at this moment", () => {
    expect(findTimes(build(make, "en", "UTC").filename)[0]?.text).toBe("2026-11-22");
    expect(findTimes(build(make, "en", "America/Toronto").filename)[0]?.text).toBe("2026-11-21");
    expect(findTimes(build(make, "en", "Pacific/Kiritimati").filename)[0]?.text).toBe("2026-11-22");
    expect(findTimes(build(make, "en", "Pacific/Pago_Pago").filename)[0]?.text).toBe("2026-11-21");
  });
  it("does not write the time of the export into the content", () => {
    const a = build(make, "en", "UTC", new Date("2026-11-22T04:30:15.123Z")).text;
    const b = build(make, "en", "UTC", new Date("2026-11-22T21:59:59.999Z")).text;
    expect(a).toBe(b);
  });
  it("changes the name and not the content from one day to the next", () => {
    const a = build(make, "en", "UTC", new Date("2026-11-22T12:00:00.000Z"));
    const b = build(make, "en", "UTC", new Date("2026-11-23T12:00:00.000Z"));
    expect(a.text).toBe(b.text);
    expect(a.filename).not.toBe(b.filename);
  });
});

describe("the dates in the content", () => {
  it("are the dates the lists were recorded, and each is a real date", () => {
    for (const [name, make] of MAKERS) {
      const t = findTimes(make("en", NOW).text);
      expect(tallyPrecision(t).date, name).toBe(t.length);
    }
  });
  it("are the same in both languages for the same list", () => {
    for (const [name, make] of MAKERS) {
      const en = findTimes(make("en", NOW).text).map((m) => m.text);
      const fr = findTimes(make("fr", NOW).text).map((m) => m.text);
      expect(fr, name).toEqual(en);
    }
  });
});
