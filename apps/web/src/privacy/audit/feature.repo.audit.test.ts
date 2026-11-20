// CI audit: every browser feature the App's source uses is in featureRegister.ts, and every powerful feature
// the register says the App does not use is really absent from the source.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkFeatureRegister, FEATURE_REGISTER } from "../panel/featureRegister";
import { compareFeatures, formatFeatureComparison, scanFeatures } from "./featureScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("browser features in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanFeatures(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    const ids = found.map((f) => f.id);
    for (const id of ["service-worker", "file-download", "file-pick", "print", "display-preferences", "language", "clipboard-write"]) expect(ids).toContain(id);
  });

  it("matches the register in both directions", () => {
    const c = compareFeatures(found, FEATURE_REGISTER);
    expect(c, `\n${formatFeatureComparison(c)}\n`).toEqual({ unexpected: [], stale: [], moved: [], uncovered: [] });
  });

  it("has a well-formed register", () => {
    expect(checkFeatureRegister(FEATURE_REGISTER)).toEqual([]);
  });

  it("points every used row at a file that exists", () => {
    for (const r of FEATURE_REGISTER) if (r.path !== null) expect(existsSync(join(ROOT, r.path)), r.path).toBe(true);
  });

  it("backs every header claim with the file's own header settings", () => {
    const names: Record<string, string[]> = { geolocation: ["geolocation"], "camera-microphone": ["camera", "microphone"] };
    for (const r of FEATURE_REGISTER) {
      if (r.blockedBy === undefined) continue;
      const text = readFileSync(join(ROOT, r.blockedBy), "utf8");
      for (const n of names[r.id] ?? []) expect(text, `${r.id} ${n}`).toContain(`${n}=()`);
    }
  });

  describe("would fail on a change, so it cannot pass by being blind", () => {
    const withFile = (path: string, text: string) => [...files, { path, text }];
    const ids = (c: ReturnType<typeof compareFeatures>): string[] => c.unexpected.map((f) => f.id);

    it("fails when a feature adds a location request", () => {
      const c = compareFeatures(scanFeatures(withFile("apps/web/src/near/useNear.ts", "navigator.geolocation.getCurrentPosition(ok);")), FEATURE_REGISTER);
      expect(ids(c)).toEqual(["geolocation"]);
      expect(formatFeatureComparison(c)).toContain("apps/web/src/near/useNear.ts:1");
    });

    it("fails when a feature adds a camera, a notification or a background send", () => {
      const text = "await navigator.mediaDevices.getUserMedia({ video: true });\nnew Notification('x');\nnavigator.sendBeacon('/x', d);";
      expect(ids(compareFeatures(scanFeatures(withFile("apps/web/src/x/y.ts", text)), FEATURE_REGISTER))).toEqual(["camera-microphone", "notifications", "send-beacon"]);
    });

    it("fails when a feature sets a cookie, but not when it only reads one", () => {
      expect(ids(compareFeatures(scanFeatures(withFile("apps/web/src/x/c.ts", 'document.cookie = "a=1";')), FEATURE_REGISTER))).toEqual(["cookie-write"]);
      expect(ids(compareFeatures(scanFeatures(withFile("apps/web/src/x/c.ts", "const raw = document.cookie; if (document.cookie == '') {}")), FEATURE_REGISTER))).toEqual([]);
    });

    it("fails when the only file that registers the service worker disappears", () => {
      const without = files.filter((f) => !/registerOffline\.ts$|states\/serviceWorker\.ts$/.test(f.path));
      expect(compareFeatures(scanFeatures(without), FEATURE_REGISTER).stale.map((r) => r.id)).toEqual(["service-worker"]);
    });

    it("fails when a used row names the wrong file", () => {
      const rows = FEATURE_REGISTER.map((r) => (r.id === "print" ? { ...r, path: "apps/web/src/elsewhere.ts" } : r));
      expect(compareFeatures(found, rows).moved.map((m) => m.id)).toEqual(["print"]);
    });

    it("fails when a pattern has no row, or a row has no pattern", () => {
      expect(compareFeatures(found, FEATURE_REGISTER.filter((r) => r.id !== "share")).uncovered).toEqual(["share: the scan looks for it but the register has no row"]);
      expect(compareFeatures([], [...FEATURE_REGISTER, { ...FEATURE_REGISTER[0]!, id: "extra" as never, used: false, path: null, why: undefined as never }]).uncovered.join("\n")).toContain("extra: in the register");
    });

    it("does not fail for a feature named only in a test or in a comment", () => {
      const c = compareFeatures(scanFeatures([...files, { path: "apps/web/src/x/a.test.ts", text: "navigator.geolocation" }, { path: "apps/web/src/x/b.ts", text: "// navigator.geolocation.watchPosition(f)" }]), FEATURE_REGISTER);
      expect(ids(c)).toEqual([]);
    });
  });
});
