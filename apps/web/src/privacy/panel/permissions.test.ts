import { describe, expect, it } from "vitest";
import { FEATURE_REGISTER, type FeatureRow } from "./featureRegister";
import { browserFeatureHost, readFeatureStates, type FeatureHost } from "./permissions";

const NOW = new Date("2026-11-19T14:00:00.000Z");
const row = (id: string, permission?: string): FeatureRow =>
  ({ id: id as never, used: false, path: null, asks: "yes", holds: { en: "x", fr: "x" }, source: "t", recordedOn: "2026-11-19", ...(permission === undefined ? {} : { permission }) });

function host(map: Record<string, string | Error>, asked: string[] = []): FeatureHost {
  return {
    permissions: {
      query: ({ name }) => {
        asked.push(name);
        const v = map[name];
        if (v instanceof Error) return Promise.reject(v);
        return v === undefined ? Promise.reject(new TypeError("unknown name")) : Promise.resolve({ state: v });
      },
    },
  };
}

describe("readFeatureStates", () => {
  it("records the time of the check as an ISO string", async () => {
    expect((await readFeatureStates(host({}), [], NOW)).at).toBe("2026-11-19T14:00:00.000Z");
  });
  it("answers only for rows that have a permission name", async () => {
    const s = await readFeatureStates(host({ geolocation: "denied" }), [row("geolocation", "geolocation"), row("share")], NOW);
    expect(s.answers).toEqual({ geolocation: "denied" });
  });
  it("passes granted, denied and prompt through", async () => {
    const s = await readFeatureStates(host({ a: "granted", b: "denied", c: "prompt" }), [row("geolocation", "a"), row("notifications", "b"), row("share", "c")], NOW);
    expect(s.answers).toEqual({ geolocation: "granted", notifications: "denied", share: "prompt" });
  });
  it("turns an answer it does not know into unknown, not into a guess", async () => {
    const s = await readFeatureStates(host({ a: "maybe", b: "" }), [row("geolocation", "a"), row("notifications", "b")], NOW);
    expect(s.answers).toEqual({ geolocation: "unknown", notifications: "unknown" });
  });
  it("answers unknown when the browser rejects the name or throws", async () => {
    const s = await readFeatureStates(host({ a: new Error("blocked") }), [row("geolocation", "a"), row("notifications", "missing")], NOW);
    expect(s.answers).toEqual({ geolocation: "unknown", notifications: "unknown" });
  });
  it("answers unknown when the query itself throws before returning a promise", async () => {
    const h: FeatureHost = {
      permissions: {
        query: () => {
          throw new Error("sync failure");
        },
      },
    };
    expect((await readFeatureStates(h, [row("geolocation", "a")], NOW)).answers).toEqual({ geolocation: "unknown" });
  });
  it("answers unknown for every row when the browser has no permission query", async () => {
    expect((await readFeatureStates({}, [row("geolocation", "a")], NOW)).answers).toEqual({ geolocation: "unknown" });
    expect((await readFeatureStates({ permissions: {} as never }, [row("geolocation", "a")], NOW)).answers).toEqual({ geolocation: "unknown" });
  });
  it("asks once per name and gives rows that share a name the same answer", async () => {
    const asked: string[] = [];
    const s = await readFeatureStates(host({ camera: "prompt" }, asked), [row("camera-microphone", "camera"), row("device-apis", "camera")], NOW);
    expect(asked).toEqual(["camera"]);
    expect(s.answers).toEqual({ "camera-microphone": "prompt", "device-apis": "prompt" });
  });
  it("asks in the register's order and only reads", async () => {
    const asked: string[] = [];
    await readFeatureStates(host({ a: "granted", b: "granted" }, asked), [row("geolocation", "b"), row("notifications", "a")], NOW);
    expect(asked).toEqual(["b", "a"]);
  });
  it("works on the App's own register", async () => {
    const s = await readFeatureStates(host({ geolocation: "denied", camera: "prompt", notifications: "granted", "clipboard-read": "prompt", "clipboard-write": "granted", "persistent-storage": "prompt" }), FEATURE_REGISTER, NOW);
    expect(s.answers.geolocation).toBe("denied");
    expect(s.answers["storage-persist"]).toBe("prompt");
    expect(Object.keys(s.answers).length).toBe(FEATURE_REGISTER.filter((r) => r.permission !== undefined).length);
  });
});

describe("browserFeatureHost", () => {
  it("is empty when there is no browser object", () => {
    expect(browserFeatureHost(undefined)).toEqual({});
  });
  it("is empty when the browser has no permissions object", () => {
    expect(browserFeatureHost({})).toEqual({});
  });
  it("passes the browser's permissions object through", () => {
    const permissions = { query: () => Promise.resolve({ state: "granted" }) };
    expect(browserFeatureHost({ permissions }).permissions).toBe(permissions);
  });
});
