// CI audit: every link in the App's source that opens another app has a row in handoffRegister.ts, and every row
// is still true. A new mail, phone or maps link without a row fails here, so handing text to another app is
// always a visible decision.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HANDOFF_REGISTER, handoffCounts, validateHandoffs } from "../panel/handoffRegister";
import { SCHEME_CATALOGUE, compareHandoffs, formatHandoffComparison, isClean, scanHandoffs } from "./handoffScan";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("hand-off links in the source", () => {
  const files = loadFiles(ROOT, ["apps/web/src"]);
  const found = scanHandoffs(files);

  it("scans the real tree, so it cannot pass by finding nothing", () => {
    expect(files.map((x) => x.path)).toContain("apps/web/src/states/geo.ts");
    expect(found.map((f) => f.scheme)).toEqual(expect.arrayContaining(["mailto", "geo", "tel"]));
  });

  it("matches the register in both directions", () => {
    const c = compareHandoffs(found, HANDOFF_REGISTER);
    expect(isClean(c), `\n${formatHandoffComparison(c)}\n`).toBe(true);
  });

  it("has a well-formed register", () => {
    expect(validateHandoffs(HANDOFF_REGISTER)).toEqual([]);
  });

  it("finds no navigation to an address built at run time", () => {
    expect(found.filter((f) => f.scheme === "navigation")).toEqual([]);
  });

  it("names a file that exists for every row", () => {
    const paths = new Set(files.map((f) => f.path));
    for (const r of HANDOFF_REGISTER) expect(paths.has(r.path), r.path).toBe(true);
  });

  it("counts what the register lists", () => {
    expect(handoffCounts(HANDOFF_REGISTER)).toEqual({ total: 3, uses: 3, schemes: 3, files: 3 });
  });

  it("has a pattern for each kind of link the register can name", () => {
    expect(SCHEME_CATALOGUE.map((s) => s.id).sort()).toEqual(["facetime", "geo", "intent", "mailto", "maps", "navigation", "sms", "tel", "webcal", "whatsapp"]);
  });

  describe("fails when the source and the register disagree", () => {
    const rows = HANDOFF_REGISTER;
    it("for a link added in a new file", () => {
      const extra = [...files, { path: "apps/web/src/new/Share.tsx", text: 'const href = "sms:" + number;\n' }];
      const c = compareHandoffs(scanHandoffs(extra), rows);
      expect(c.unlisted.map((u) => `${u.scheme} ${u.path}`)).toEqual(["sms apps/web/src/new/Share.tsx"]);
      expect(formatHandoffComparison(c)).toContain("apps/web/src/new/Share.tsx:1: a sms link (1 place) is in no row");
    });
    it("for a second link in a listed file", () => {
      const geo = files.find((f) => f.path === "apps/web/src/states/geo.ts")!;
      const mutated = files.map((f) => (f === geo ? { ...f, text: `${f.text}\nexport const other = \`geo:\${1},\${2}\`;\n` } : f));
      const c = compareHandoffs(scanHandoffs(mutated), rows);
      expect(c.wrongCount).toEqual([{ scheme: "geo", path: "apps/web/src/states/geo.ts", listed: 1, found: 2 }]);
    });
    it("for a link taken out of a listed file", () => {
      const tel = files.find((f) => f.path === "apps/web/src/pages/OfflinePackPage.tsx")!;
      const mutated = files.map((f) => (f === tel ? { ...f, text: f.text.replace("`tel:${", "`call:${") } : f));
      const c = compareHandoffs(scanHandoffs(mutated), rows);
      expect(c.gone).toEqual([{ scheme: "tel", path: "apps/web/src/pages/OfflinePackPage.tsx" }]);
    });
    it("for navigation to a run-time address", () => {
      const extra = [...files, { path: "apps/web/src/new/Go.ts", text: "export const go = (u: string) => window.location.assign(u);\n" }];
      expect(compareHandoffs(scanHandoffs(extra), rows).unlisted.map((u) => u.scheme)).toEqual(["navigation"]);
    });
  });
});
