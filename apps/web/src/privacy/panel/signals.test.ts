import { describe, expect, it } from "vitest";
import { dntSignal, readSignals } from "./signals";

describe("dntSignal", () => {
  it.each([["1", "yes"], [1, "yes"], ["yes", "yes"], ["0", "no"], [0, "no"], ["no", "no"], ["unspecified", "unknown"], [null, "unknown"], [undefined, "unknown"], [true, "unknown"]])(
    "%j is %s",
    (v, want) => {
      expect(dntSignal(v)).toBe(want);
    },
  );
});

describe("readSignals", () => {
  it("reports what the browser says", async () => {
    const s = await readSignals({
      navigator: {
        globalPrivacyControl: true,
        doNotTrack: "0",
        cookieEnabled: true,
        storage: { persisted: () => Promise.resolve(false), estimate: () => Promise.resolve({ usage: 1234.4, quota: 5_000_000 }) },
      },
      isSecureContext: true,
    });
    expect(s).toEqual({ gpc: "yes", dnt: "no", cookies: "yes", secureContext: "yes", persistent: "no", usageBytes: 1234, quotaBytes: 5_000_000 });
  });
  it("keeps Unknown as Unknown when the browser does not say", async () => {
    expect(await readSignals({})).toEqual({
      gpc: "unknown", dnt: "unknown", cookies: "unknown", secureContext: "unknown", persistent: "unknown", usageBytes: null, quotaBytes: null,
    });
  });
  it("a missing Global Privacy Control is Unknown, never No", async () => {
    expect((await readSignals({ navigator: { cookieEnabled: true } })).gpc).toBe("unknown");
    expect((await readSignals({ navigator: { globalPrivacyControl: false } })).gpc).toBe("no");
  });
  it("a storage call that fails or gives nonsense is Unknown", async () => {
    const s = await readSignals({
      navigator: {
        storage: { persisted: () => Promise.reject(new Error("blocked")), estimate: () => Promise.resolve({ usage: -5, quota: Number.NaN }) },
      },
    });
    expect(s.persistent).toBe("unknown");
    expect([s.usageBytes, s.quotaBytes]).toEqual([null, null]);
  });
  it("does not invent a number when only part is given", async () => {
    const s = await readSignals({ navigator: { storage: { estimate: () => Promise.resolve({ usage: 10 }) } } });
    expect([s.usageBytes, s.quotaBytes]).toEqual([10, null]);
  });
  it("non-boolean answers are Unknown", async () => {
    const s = await readSignals({ navigator: { globalPrivacyControl: "yes", cookieEnabled: 1 }, isSecureContext: "true" });
    expect([s.gpc, s.cookies, s.secureContext]).toEqual(["unknown", "unknown", "unknown"]);
  });
});
