import { describe, expect, it } from "vitest";
import { createEgressPolicy, decide, installEgressGuard, type BlockedRequest, type GuardHost } from "./egress";

const SELF = "https://app.example.ca";
const LISTED = "https://data.example.ca";
const readOnly = createEgressPolicy({ selfOrigin: SELF, allowedOrigins: [LISTED] });
const open = createEgressPolicy({ selfOrigin: SELF, allowedOrigins: [LISTED], allowUpload: true });

describe("upload policy", () => {
  it("is read-only by default and frozen", () => {
    expect(readOnly.allowUpload).toBe(false);
    expect(open.allowUpload).toBe(true);
    expect(Object.isFrozen(readOnly)).toBe(true);
  });
  it.each(["GET", "get", "HEAD", "OPTIONS"])("allows %s to a listed origin", (m) => {
    expect(decide(readOnly, `${LISTED}/list`, m)).toEqual({ allowed: true, kind: "listed-origin" });
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "SEND"])("blocks %s to a listed origin, reporting only the host", (m) => {
    expect(decide(readOnly, `${LISTED}/list?name=Jo`, m)).toEqual({ allowed: false, host: "data.example.ca", scheme: "https:", reason: "upload-blocked" });
  });
  it("lets the App's own origin send, whatever the policy", () => {
    expect(decide(readOnly, `${SELF}/api`, "POST")).toEqual({ allowed: true, kind: "same-origin" });
  });
  it("allows sends to a listed origin when the policy says so", () => {
    expect(decide(open, `${LISTED}/list`, "POST")).toEqual({ allowed: true, kind: "listed-origin" });
  });
  it("still blocks unlisted hosts first", () => {
    expect(decide(open, "https://other.example.net/x", "POST")).toMatchObject({ allowed: false, reason: "not-listed" });
  });
});

describe("guard with an upload policy", () => {
  function host(): { h: GuardHost; fetched: string[]; beacons: string[]; opened: string[] } {
    const fetched: string[] = [];
    const beacons: string[] = [];
    const opened: string[] = [];
    function Xhr(): void {}
    Xhr.prototype.open = function (_m: string, url: string | URL): void {
      opened.push(String(url));
    };
    const h: GuardHost = {
      fetch: (input) => {
        fetched.push(String(input));
        return Promise.resolve("ok");
      },
      XMLHttpRequest: Xhr as unknown as NonNullable<GuardHost["XMLHttpRequest"]>,
      navigator: {
        sendBeacon: (url) => {
          beacons.push(String(url));
          return true;
        },
      },
    };
    return { h, fetched, beacons, opened };
  }
  const beacon = (h: GuardHost): ((url: string) => boolean) => (url) => (h.navigator as { sendBeacon(u: string): boolean }).sendBeacon(url);
  const NOW = new Date("2026-11-16T10:00:00Z");

  it("allows reads and blocks sends to a listed origin on fetch, XHR and beacon", async () => {
    const { h, fetched, beacons, opened } = host();
    const blocked: BlockedRequest[] = [];
    installEgressGuard(h, readOnly, (b) => blocked.push(b), () => NOW);
    await expect(h.fetch?.(`${LISTED}/list`)).resolves.toBe("ok");
    await expect(h.fetch?.(`${LISTED}/list`, { method: "post", body: "x" })).rejects.toThrow(TypeError);
    const xhr = new (h.XMLHttpRequest as unknown as new () => { open(m: string, u: string): void })();
    xhr.open("GET", `${LISTED}/a`);
    expect(() => xhr.open("POST", `${LISTED}/a`)).toThrow(TypeError);
    expect(beacon(h)(`${LISTED}/b`)).toBe(false);
    expect(fetched).toEqual([`${LISTED}/list`]);
    expect(opened).toEqual([`${LISTED}/a`]);
    expect(beacons).toEqual([]);
    expect(blocked.map((b) => b.reason)).toEqual(["upload-blocked", "upload-blocked", "upload-blocked"]);
    expect(JSON.stringify(blocked)).not.toContain("/list");
  });
  it("lets sends through when the policy allows them", () => {
    const { h, beacons } = host();
    installEgressGuard(h, open, () => undefined, () => NOW);
    expect(beacon(h)(`${LISTED}/b`)).toBe(true);
    expect(beacons).toEqual([`${LISTED}/b`]);
  });
});
