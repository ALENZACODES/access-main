// Behaviour audit of the code in the privacy folder that writes a time: what it stores, what it exports, and how the
// text changes with the time zone of the device. The time zone of the test process is changed for each case and set
// back after. It checks the functions on the times and zones written here; it does not check a real browser, and it
// does not check what a person's device answers. The first test checks that the change of zone works at all, so the
// others cannot pass by running in one zone only.

import { afterEach, describe, expect, it } from "vitest";
import { addressesAsCsv } from "../panel/addressExport";
import { formatActivityTime, loadActivity, recordActivity } from "../panel/activityLog";
import { scanDevice } from "../panel/deviceStorage";
import { createEgressPolicy, installEgressGuard, type GuardHost } from "../panel/egress";
import { loadBlocked, recordBlocked } from "../panel/egressLog";
import { getExpiring, parseEnvelope, putExpiring } from "../panel/expiry";
import { exportLocalData } from "../panel/localData";
import { createMemoryStorage } from "../panel/storage";
import type { AddressRegisterView } from "../panel/addressView";
import { findTimes, finestPrecision, offsetsIn, timesOfDayAreUtc } from "./tmText";

const ZONES = ["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Kiritimati", "America/St_Johns", "Pacific/Pago_Pago"] as const;
const original = process.env.TZ;
const inZone = <T,>(tz: string, fn: () => T): T => {
  process.env.TZ = tz;
  return fn();
};
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

// 2026-11-22T04:30:15.123Z is 23:30 on 21 November in Toronto and 10:00 on 22 November in Kolkata.
const NOW = new Date("2026-11-22T04:30:15.123Z");

describe("the change of zone in this test", () => {
  it("changes what the local getters answer", () => {
    expect(inZone("UTC", () => NOW.getDate())).toBe(22);
    expect(inZone("America/Toronto", () => NOW.getDate())).toBe(21);
    expect(inZone("Asia/Kolkata", () => NOW.getHours() * 60 + NOW.getMinutes())).toBe(10 * 60);
    expect(inZone("Pacific/Kiritimati", () => NOW.getDate())).toBe(22);
    expect(inZone("Pacific/Pago_Pago", () => NOW.getDate())).toBe(21);
  });
});

describe("what is stored", () => {
  const stored = (): string => {
    const storage = createMemoryStorage();
    putExpiring(storage, "k", "v", NOW, 90);
    return storage.getItem("k") ?? "";
  };
  it("writes the time of saving and of expiry as UTC text to the millisecond, with no offset", () => {
    const env = parseEnvelope(stored());
    expect(env?.savedAt).toBe("2026-11-22T04:30:15.123Z");
    expect(env?.expiresAt).toBe("2027-02-20T04:30:15.123Z");
  });
  it.each(ZONES)("writes the same stored text in %s", (tz) => expect(inZone(tz, stored)).toBe(stored()));
  it("counts the days in whole days of 24 hours, also across the change of clock in Toronto", () => {
    const start = new Date("2026-10-30T12:00:00.000Z");
    const text = inZone("America/Toronto", () => {
      const storage = createMemoryStorage();
      putExpiring(storage, "k", "v", start, 7);
      return storage.getItem("k") ?? "";
    });
    expect(parseEnvelope(text)?.expiresAt).toBe("2026-11-06T12:00:00.000Z");
  });
  it.each(ZONES)("says a value is expired at the same moment in %s", (tz) => {
    const storage = createMemoryStorage();
    putExpiring(storage, "k", "v", NOW, 1);
    const at = (iso: string): string => inZone(tz, () => getExpiring(storage, "k", new Date(iso)).state);
    expect(at("2026-11-23T04:30:15.122Z")).not.toBe(at("2026-11-23T04:30:15.123Z"));
  });
  it("writes times of day only as UTC in what the activity log keeps", () => {
    const storage = createMemoryStorage();
    recordActivity(storage, "p.", { kind: "export", locale: "en" } as never, NOW);
    const text = [...Array(storage.length).keys()].map((i) => storage.getItem(storage.key(i) as string)).join("\n");
    const times = findTimes(text);
    expect(times.length).toBeGreaterThan(1);
    expect(timesOfDayAreUtc(times)).toBe(true);
    expect(offsetsIn(times)).toEqual([]);
  });
  it("keeps the time of a refused request as the text the guard gave, to the millisecond", () => {
    const storage = createMemoryStorage();
    recordBlocked(storage, "p.", { at: NOW.toISOString(), host: "x.example", scheme: "https", via: "fetch", reason: "not-listed" }, NOW);
    expect(loadBlocked(storage, "p.", NOW).hosts[0]?.lastAt).toBe("2026-11-22T04:30:15.123Z");
    expect(loadBlocked(storage, "p.", NOW).since).toBe("2026-11-22T04:30:15.123Z");
  });
  it("gives the guard's time to the log from the clock it was given", async () => {
    const seen: string[] = [];
    const host: GuardHost = { fetch: (() => Promise.resolve(new Response())) as never } as never;
    const g = installEgressGuard(host, createEgressPolicy({ selfOrigin: "https://app.example.ca" }), (b) => void seen.push(b.at), () => NOW);
    await Promise.resolve(host.fetch?.("https://other.example/x")).catch(() => undefined);
    g.uninstall();
    expect(seen.every((s) => s === "2026-11-22T04:30:15.123Z")).toBe(true);
  });
});

describe("what is exported", () => {
  const exported = (tz: string): { filename: string; text: string } =>
    inZone(tz, () => {
      const storage = createMemoryStorage({ "p.a": "1", "p.b": "2" });
      const f = exportLocalData(storage, "p.", NOW, "en");
      return { filename: f.filename, text: f.text };
    });
  it("writes the time of the export as UTC text to the millisecond", () => {
    const t = findTimes(exported("UTC").text);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ text: "2026-11-22T04:30:15.123Z", precision: "millisecond", zone: "utc" });
  });
  it.each(ZONES)("writes the same content in %s", (tz) => expect(exported(tz).text).toBe(exported("UTC").text));
  it("holds no offset in the content, in any zone", () => {
    for (const tz of ZONES) expect(offsetsIn(findTimes(exported(tz).text)), tz).toEqual([]);
  });
});

describe("what is shown", () => {
  it.each([
    ["UTC", "2026-11-22 04:30"],
    ["America/Toronto", "2026-11-21 23:30"],
    ["Asia/Kolkata", "2026-11-22 10:00"],
    ["America/St_Johns", "2026-11-22 01:00"],
    ["Pacific/Kiritimati", "2026-11-22 18:30"],
  ])("writes the activity time to the minute in the time zone of the device: %s", (tz, shown) => {
    expect(inZone(tz, () => formatActivityTime(NOW.toISOString()))).toBe(shown);
  });
  it("shows no seconds and no milliseconds", () => expect(findTimes(formatActivityTime(NOW.toISOString()))[0]?.precision).toBe("minute"));
});

describe("known: what the written dates do with the time zone", () => {
  // Each of these records what the code does today. When one changes the test fails, and the record and the finding in
  // the notes file change with it.
  it("names the exported file by the local date, which is not the date inside it", () => {
    const toronto = inZone("America/Toronto", () => exportLocalData(createMemoryStorage({ "p.a": "1" }), "p.", NOW, "en"));
    expect(toronto.filename).toBe("the-app-data-2026-11-21.json");
    expect(findTimes(toronto.text)[0]?.text.slice(0, 10)).toBe("2026-11-22");
  });
  it("gives a file name that depends on the zone: the same moment, a different name", () => {
    const names = new Set(ZONES.map((tz) => inZone(tz, () => exportLocalData(createMemoryStorage(), "p.", NOW, "en").filename)));
    expect(names.size).toBe(2);
  });
  it("lets the name and the content together narrow the zone: the name's date minus the UTC date gives the side of midnight", () => {
    const f = inZone("Pacific/Pago_Pago", () => exportLocalData(createMemoryStorage(), "p.", NOW, "en"));
    const nameDate = /\d{4}-\d{2}-\d{2}/.exec(f.filename)?.[0] ?? "";
    const utcDate = findTimes(f.text)[0]?.text.slice(0, 10) ?? "";
    expect(Date.parse(utcDate) - Date.parse(nameDate)).toBe(24 * 3_600_000);
  });
  it("names the files of the address list by the local date as well", () => {
    const view: AddressRegisterView = { addresses: [], calls: [] } as unknown as AddressRegisterView;
    const name = (tz: string): string => inZone(tz, () => addressesAsCsv("en", view, NOW).filename);
    expect(name("America/Toronto")).not.toBe(name("UTC"));
    expect(findTimes(name("UTC"))[0]?.precision).toBe("date");
  });
});

describe("the device scan and the feature states", () => {
  it("writes the time of the scan as UTC text to the millisecond, in any zone", async () => {
    for (const tz of ZONES) {
      process.env.TZ = tz;
      const scan = await scanDevice({}, NOW);
      expect(scan.at, tz).toBe("2026-11-22T04:30:15.123Z");
      expect(finestPrecision(findTimes(scan.at))).toBe("millisecond");
    }
  });
  it("loads the same entries whatever the zone", () => {
    const storage = createMemoryStorage();
    recordActivity(storage, "p.", { kind: "export", locale: "en" } as never, NOW);
    const a = inZone("UTC", () => JSON.stringify(loadActivity(storage, "p.", NOW)));
    for (const tz of ZONES) expect(inZone(tz, () => JSON.stringify(loadActivity(storage, "p.", NOW))), tz).toBe(a);
  });
});
