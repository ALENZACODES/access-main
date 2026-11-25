// CI audit: every place in the App's source that starts work on its own is in autoRegister.ts, kind by kind and file
// by file, and every row is still true. A new timer, observer, listener or worker registration fails here, so work
// that starts without a button press is always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTO_REGISTER, autoCounts, validateAuto } from "../panel/autoRegister";
import { compareAuto, formatAutoComparison, isCleanAuto, scanAuto, totalsByKind } from "./autoScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("work that starts on its own, in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanAuto(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((f) => f.path)).toContain("apps/web/src/states/serviceWorker.ts");
    expect(found.length).toBeGreaterThan(10);
    expect(new Set(found.map((f) => f.kind)).size).toBeGreaterThan(4);
  });

  it("matches the register in both directions", () => {
    const c = compareAuto(found, AUTO_REGISTER);
    expect(isCleanAuto(c), `\n${formatAutoComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validateAuto(AUTO_REGISTER)).toEqual([]);
  });

  it("has a file that exists for every row", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of AUTO_REGISTER) expect(paths.has(r.path), r.path).toBe(true);
  });

  it("agrees with the register about how many places there are", () => {
    expect(found.reduce((n, f) => n + f.lines.length, 0)).toBe(autoCounts(AUTO_REGISTER).uses);
    expect(totalsByKind(found).reduce((n, t) => n + t.places, 0)).toBe(autoCounts(AUTO_REGISTER).uses);
  });

  describe("fails when the source and the register disagree", () => {
    const rows = AUTO_REGISTER;
    const plus = (path: string, text: string) => [...files, { path, text }];
    it("for a new file that starts work", () => {
      const c = compareAuto(scanAuto(plus("apps/web/src/map/New.tsx", "setInterval(() => poll(), 1000);\n")), rows);
      expect(c.unlisted).toEqual([{ kind: "timer", path: "apps/web/src/map/New.tsx", lines: [1] }]);
      expect(formatAutoComparison(c)).toContain("apps/web/src/map/New.tsx:1: 1 timer place found and no row lists them");
    });
    it("for a new kind of work in a listed file", () => {
      const f = files.find((x) => x.path === "apps/web/src/shell/useOnline.ts")!;
      const mutated = files.map((x) => (x === f ? { ...x, text: `${x.text}\nnew BroadcastChannel("a");\n` } : x));
      expect(compareAuto(scanAuto(mutated), rows).unlisted.map((u) => u.kind)).toEqual(["channel"]);
    });
    it("for one more place of a listed kind", () => {
      const f = files.find((x) => x.path === "apps/web/src/shell/useOnline.ts")!;
      const mutated = files.map((x) => (x === f ? { ...x, text: `${x.text}\nwindow.addEventListener("online", again);\n` } : x));
      expect(compareAuto(scanAuto(mutated), rows).wrongCount).toEqual([{ kind: "network", path: "apps/web/src/shell/useOnline.ts", listed: 2, found: 3 }]);
    });
    it("for work taken out of a listed file", () => {
      const f = files.find((x) => x.path === "apps/web/src/states/useShortlist.ts")!;
      const mutated = files.map((x) => (x === f ? { ...x, text: x.text.replace(/addEventListener\("storage"/g, 'addEventListener("custom"') } : x));
      expect(compareAuto(scanAuto(mutated), rows).gone).toEqual([{ kind: "storage-event", path: "apps/web/src/states/useShortlist.ts" }]);
    });
    it("for a worker registered in a file that only read before", () => {
      const f = files.find((x) => x.path === "apps/web/src/pages/DataStatusPage.tsx")!;
      const mutated = files.map((x) => (x === f ? { ...x, text: `${x.text}\nnavigator.serviceWorker.register("/sw.js");\n` } : x));
      expect(compareAuto(scanAuto(mutated), rows).wrongCount).toEqual([{ kind: "service-worker", path: "apps/web/src/pages/DataStatusPage.tsx", listed: 2, found: 3 }]);
    });
  });
});
