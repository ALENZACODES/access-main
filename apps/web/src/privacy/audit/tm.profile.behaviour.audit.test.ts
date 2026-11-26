// Behaviour audit of the times that the stored profile keeps: when consent was given, when it was withdrawn, and
// when the profile was last changed. It runs the real storage code on an in-memory IndexedDB and reads the stored
// records back as text. It checks the code on the times written here; it does not check what the page passes in (the
// page passes the time of the click, to the millisecond, which is not run here).

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type UserProfile } from "@access/shared";
import { db } from "../../storage/db";
import { exportPhrases } from "../../profile/exportCopy";
import { deleteProfile, exportProfileText, getProfile, saveProfile, updateProfileLanguage, withdrawStoredConsent } from "../../storage/repository";
import { findTimes, finestPrecision, offsetsIn, timesOfDayAreUtc } from "./tmText";

const GIVEN = "2026-11-22T04:30:15.123Z";
const LATER = "2026-11-22T09:45:59.987Z";
const ZONES = ["UTC", "America/Toronto", "Asia/Kolkata", "Pacific/Kiritimati"] as const;
const original = process.env.TZ;

const consented = (profile: UserProfile, at = GIVEN): UserProfile => ({
  ...profile,
  equipment_type_general: "manual_chair",
  consent_records: [{ purpose: "store-preferences-on-device", policy_version: "privacy-local-1", granted_at: at, withdrawn_at: null }],
});

const storedText = async (): Promise<string> => JSON.stringify(await db.profiles.toArray());

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
});

describe("the times a saved profile keeps", () => {
  it("keeps the time of consent as it was given, to the millisecond, in UTC", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    const t = findTimes(await storedText());
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.map((m) => m.text)).toContain(GIVEN);
    expect(finestPrecision(t)).toBe("millisecond");
    expect(timesOfDayAreUtc(t)).toBe(true);
    expect(offsetsIn(t)).toEqual([]);
  });
  it("does not make the time coarser: a time given to the millisecond is kept to the millisecond", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en"), "2026-11-22T04:30:15.001Z"));
    expect(findTimes(await storedText()).map((m) => m.text)).toContain("2026-11-22T04:30:15.001Z");
  });
  it.each(ZONES)("keeps the same stored text in %s", async (tz) => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    const base = await storedText();
    process.env.TZ = tz;
    await db.delete();
    await db.open();
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    expect(await storedText()).toBe(base);
  });
  it("keeps one stored profile, whatever the number of saves", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    await saveProfile(consented(createEmptyProfile(GIVEN, "en"), LATER));
    expect(await db.profiles.count()).toBe(1);
  });
});

describe("withdrawing consent and changing the language", () => {
  it("writes the time of withdrawal into the consent record, to the millisecond, and clears what was chosen", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    const w = await withdrawStoredConsent(LATER);
    expect(w?.consent_records[0]?.withdrawn_at).toBe(LATER);
    expect(w?.equipment_type_general).toBeNull();
    expect(findTimes(await storedText()).map((m) => m.text)).toEqual(expect.arrayContaining([GIVEN, LATER]));
  });
  it("keeps the time of the first consent after a withdrawal, so the record shows when it was given", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    await withdrawStoredConsent(LATER);
    expect((await getProfile())?.consent_records[0]?.granted_at).toBe(GIVEN);
  });
  it("gives nothing and writes nothing when there is no profile to withdraw", async () => {
    expect(await withdrawStoredConsent(LATER)).toBeNull();
    expect(await db.profiles.count()).toBe(0);
  });
  it("writes the time of a change of language as the time of the update, and none when the language is the same", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    await updateProfileLanguage("en", LATER);
    expect((await getProfile())?.updated_at).toBe(GIVEN);
    await updateProfileLanguage("fr", LATER);
    expect((await getProfile())?.updated_at).toBe(LATER);
  });
  it("leaves no time after the profile is deleted", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    await deleteProfile();
    expect(findTimes(await storedText())).toEqual([]);
  });
});

describe("known: what the person is shown and given", () => {
  // These record what the code does today; each fails when it changes, and the notes file changes with it.
  it("writes the full time of withdrawal, to the millisecond, in the text the person can export", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    const w = await withdrawStoredConsent(LATER);
    const text = exportProfileText(w as UserProfile, exportPhrases("en"));
    expect(text).toContain(`Consent withdrawn: ${LATER}`);
    expect(finestPrecision(findTimes(text))).toBe("millisecond");
  });
  it("writes the same full time in French, with the same ISO form", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "fr")));
    const w = await withdrawStoredConsent(LATER);
    const text = exportProfileText(w as UserProfile, exportPhrases("fr"));
    expect(findTimes(text).map((m) => m.text)).toContain(LATER);
  });
  it("keeps the time of every save in the record, and does not round it to the day", async () => {
    await saveProfile(consented(createEmptyProfile(GIVEN, "en")));
    const times = findTimes(await storedText());
    expect(times.every((m) => m.precision === "millisecond")).toBe(true);
  });
});
