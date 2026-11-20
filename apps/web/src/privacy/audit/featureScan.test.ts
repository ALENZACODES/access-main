import { describe, expect, it } from "vitest";
import { FEATURE_REGISTER, type FeatureRow } from "../panel/featureRegister";
import { compareFeatures, FEATURE_CATALOGUE, formatFeatureComparison, scanFeatures, type FeaturePattern } from "./featureScan";

const file = (path: string, text: string) => ({ path, text });
const idsIn = (text: string, path = "apps/web/src/a.ts"): string[] => scanFeatures([file(path, text)]).map((f) => f.id);

describe("scanFeatures: what each feature looks like in the source", () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    ["service-worker", 'await navigator.serviceWorker.register("/sw.js");', "also in a template string"],
    ["service-worker", "nav.serviceWorker?.register(url)", "with optional chaining"],
    ["storage-estimate", "const e = await navigator.storage.estimate();", "estimate"],
    ["storage-estimate", "const p = await storage.persisted();", "persisted"],
    ["storage-persist", "await storage.persist();", "persist"],
    ["storage-persist", "await storage?.persist?.();", "persist with optional chaining"],
    ["permission-query", 'await navigator.permissions.query({ name: "geolocation" });', "query"],
    ["clipboard-write", "await navigator.clipboard.writeText(t);", "writeText"],
    ["clipboard-write", "await navigator.clipboard.write([item]);", "write"],
    ["clipboard-read", "await navigator.clipboard.readText();", "readText"],
    ["file-download", "const u = URL.createObjectURL(blob);", "object URL"],
    ["file-pick", '<input type="file" accept=".json" />', "markup"],
    ["file-pick", "const el = { type: 'file' };", "object"],
    ["file-pick", "<input type={'file'} />", "JSX braces"],
    ["print", "window.print();", "print"],
    ["language", "const l = navigator.language;", "language"],
    ["language", "const l = navigator.languages[0];", "languages"],
    ["display-preferences", 'window.matchMedia("(prefers-contrast: more)")', "matchMedia"],
    ["geolocation", "navigator.geolocation.getCurrentPosition(ok);", "navigator"],
    ["geolocation", "geo.watchPosition(ok);", "watch"],
    ["camera-microphone", "navigator.mediaDevices.getUserMedia({ audio: true });", "media"],
    ["camera-microphone", "stream = await getDisplayMedia();", "display"],
    ["notifications", "await Notification.requestPermission();", "request"],
    ["notifications", "new Notification('hi');", "new"],
    ["notifications", "reg.showNotification('hi');", "service worker"],
    ["notifications", "reg.pushManager.subscribe();", "push"],
    ["send-beacon", "navigator.sendBeacon('/x', d);", "beacon"],
    ["share", "await navigator.share({ title });", "share"],
    ["cookie-write", 'document.cookie = "a=1";', "write"],
    ["device-apis", "await navigator.bluetooth.requestDevice({});", "bluetooth"],
    ["device-apis", "navigator.usb.getDevices();", "usb"],
    ["sensors", "navigator.vibrate(100);", "vibrate"],
    ["sensors", "await navigator.wakeLock.request('screen');", "wake lock"],
    ["sensors", "new Accelerometer({});", "accelerometer"],
    ["credentials", "await navigator.credentials.get({});", "credentials"],
    ["credentials", "PublicKeyCredential.isConditionalMediationAvailable();", "passkey"],
  ];
  for (const [id, text, note] of cases) {
    it(`${id}: finds ${note}`, () => {
      expect(idsIn(text)).toContain(id);
    });
  }

  it("does not mistake reading a cookie, comparing one, or a nearby name for a use", () => {
    expect(idsIn("const raw = document.cookie; if (document.cookie === '') {} const cookie = 1;")).toEqual([]);
    expect(idsIn("const geolocationLabel = 'x'; const usbPorts = 3; const printed = 2;")).toEqual([]);
    expect(idsIn("// window.print() is not used here")).toEqual([]);
    expect(idsIn("const permissions = {}; permissions.queryAll();")).toEqual([]);
  });
  it("does not count persisted as a persist request, or a persist request as an estimate", () => {
    expect(idsIn("await storage.persisted();")).toEqual(["storage-estimate"]);
    expect(idsIn("await storage.persist();")).toEqual(["storage-persist"]);
  });
  it("ignores comments in all three styles, tests, test helpers, declaration files, the audit folder and the narrow-screen samples", () => {
    const t = "navigator.geolocation.getCurrentPosition(f);";
    expect(idsIn(`// ${t}`)).toEqual([]);
    expect(idsIn(` * ${t}`)).toEqual([]);
    expect(idsIn(`/* ${t}`)).toEqual([]);
    for (const p of ["apps/web/src/a.test.ts", "apps/web/src/a.test-util.ts", "apps/web/src/a.d.ts", "apps/web/src/privacy/audit/x.ts", "apps/web/src/narrow/s.ts", "apps/web/src/notes.md"]) expect(idsIn(t, p), p).toEqual([]);
  });
  it("finds a use that follows a comment on the same file", () => {
    expect(idsIn("// window.print();\nwindow.print();")).toEqual(["print"]);
  });
  it("records the first file, the first line, and every file that uses a feature", () => {
    const found = scanFeatures([file("apps/web/src/z.ts", "x\nwindow.print();"), file("apps/web/src/a.ts", "\n\nwindow.print();")]);
    expect(found).toEqual([{ id: "print", path: "apps/web/src/a.ts", line: 3, paths: ["apps/web/src/a.ts", "apps/web/src/z.ts"] }]);
  });
  it("uses the earliest match in a file when more than one pattern of a feature matches", () => {
    const [f] = scanFeatures([file("apps/web/src/a.ts", "x;\nnavigator.geolocation;\ngeo.watchPosition(f);")]);
    expect(f?.line).toBe(2);
  });
  it("sorts by id whatever the order of the files", () => {
    expect(idsIn("window.print(); navigator.share(x); URL.createObjectURL(b);")).toEqual(["file-download", "print", "share"]);
  });
  it("skips the network guard's own wrapping of the background send, and nothing else in that file", () => {
    expect(idsIn("nav.sendBeacon = wrapped;", "apps/web/src/privacy/panel/egress.ts")).toEqual([]);
    expect(idsIn("nav.sendBeacon = wrapped;", "apps/web/src/privacy/panel/other.ts")).toEqual(["send-beacon"]);
    expect(idsIn("window.print();", "apps/web/src/privacy/panel/egress.ts")).toEqual(["print"]);
  });
  it("accepts a catalogue of its own and leaves a pattern's flags alone", () => {
    const own: FeaturePattern[] = [{ id: "print", patterns: [/PRINT\(\)/i] }];
    expect(scanFeatures([file("apps/web/src/a.ts", "print()")], own).map((f) => f.id)).toEqual(["print"]);
  });
  it("catalogues every feature id in the App's register exactly once", () => {
    const ids = FEATURE_CATALOGUE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual(FEATURE_REGISTER.map((r) => r.id).sort());
  });
});

const used = (id: FeatureRow["id"], path: string): FeatureRow => ({ id, used: true, path, asks: "no", holds: { en: "x", fr: "x" }, why: { en: "x", fr: "x" }, source: "t", recordedOn: "2026-11-19" });
const unused = (id: FeatureRow["id"]): FeatureRow => ({ id, used: false, path: null, asks: "yes", holds: { en: "x", fr: "x" }, source: "t", recordedOn: "2026-11-19" });
const CAT: FeaturePattern[] = [{ id: "print", patterns: [/print/] }, { id: "geolocation", patterns: [/geo/] }];
const found = (...ids: Array<[FeatureRow["id"], string]>) => ids.map(([id, path]) => ({ id, path, line: 1, paths: [path] }));

describe("compareFeatures", () => {
  it("is clean when both sides agree", () => {
    expect(compareFeatures(found(["print", "a.ts"]), [used("print", "a.ts"), unused("geolocation")], CAT)).toEqual({ unexpected: [], stale: [], moved: [], uncovered: [] });
  });
  it("reports a feature the register says is not used", () => {
    const c = compareFeatures(found(["geolocation", "b.ts"]), [unused("geolocation"), used("print", "a.ts")], CAT);
    expect(c.unexpected.map((f) => f.id)).toEqual(["geolocation"]);
    expect(formatFeatureComparison(c)).toContain("geolocation: used in b.ts:1 but featureRegister.ts says the App does not use it");
  });
  it("reports a feature with no row at all", () => {
    expect(compareFeatures(found(["geolocation", "b.ts"]), [used("print", "a.ts")], CAT).unexpected.map((f) => f.id)).toEqual(["geolocation"]);
  });
  it("reports a used row the source no longer shows", () => {
    const c = compareFeatures([], [used("print", "a.ts"), unused("geolocation")], CAT);
    expect(c.stale.map((r) => r.id)).toEqual(["print"]);
    expect(formatFeatureComparison(c)).toContain("print: featureRegister.ts says the App uses it but the source does not show it");
  });
  it("does not report an unused row as stale when it is absent from the source", () => {
    expect(compareFeatures([], [unused("geolocation"), unused("print")], CAT).stale).toEqual([]);
  });
  it("reports a row whose file is not among the files that use the feature", () => {
    const c = compareFeatures(found(["print", "b.ts"]), [used("print", "a.ts"), unused("geolocation")], CAT);
    expect(c.moved).toEqual([{ id: "print", registered: "a.ts", found: ["b.ts"] }]);
    expect(formatFeatureComparison(c)).toContain("print: registered for a.ts, found in b.ts");
  });
  it("accepts a row whose file is one of several that use the feature", () => {
    const f = [{ id: "print" as const, path: "a.ts", line: 1, paths: ["a.ts", "b.ts"] }];
    expect(compareFeatures(f, [used("print", "b.ts"), unused("geolocation")], CAT).moved).toEqual([]);
  });
  it("reports an id the register has but the scan cannot look for, and the reverse", () => {
    const c = compareFeatures([], [used("print", "a.ts")], CAT);
    expect(c.uncovered).toEqual(["geolocation: the scan looks for it but the register has no row"]);
    expect(compareFeatures([], [used("print", "a.ts"), unused("geolocation"), unused("share")], CAT).uncovered).toEqual(["share: in the register but the scan has no pattern for it"]);
  });
  it("formats nothing for a clean comparison", () => {
    expect(formatFeatureComparison({ unexpected: [], stale: [], moved: [], uncovered: [] })).toBe("");
  });
});
