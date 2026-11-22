// CI audit: every place where the code of the App writes markup into a page is on the list with a reason. A new
// innerHTML write, a new dangerouslySetInnerHTML or a document.write fails here until it is read and listed. It reads
// text with a pattern, so a sink that is built from a computed property name is not seen.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { riskySinks, scanSinks } from "./dgSink";
import { SINK_ROWS, compareSinks, formatSinkProblem } from "./dgSinkRegister";
import { loadFiles } from "./repoFiles";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]);
const sinks = riskySinks(scanSinks(files));

describe("writes of markup in the App", () => {
  it("are read, so the audit cannot pass by finding nothing", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(sinks.length).toBeGreaterThan(15);
  });
  it("match the list exactly", () => expect(compareSinks(sinks, SINK_ROWS).map(formatSinkProblem)).toEqual([]));
  it("use no document.write, no insertAdjacentHTML and no createContextualFragment", () => {
    expect(sinks.filter((s) => s.kind === "document-write" || s.kind === "adjacent" || s.kind === "fragment")).toEqual([]);
  });
  it("use no append to innerHTML", () => expect(sinks.filter((s) => s.kind === "append")).toEqual([]));
  it("use dangerouslySetInnerHTML only on the data status page", () => {
    expect(sinks.filter((s) => s.kind === "react-html").map((s) => s.path)).toEqual(["apps/web/src/pages/DataStatusPage.tsx"]);
  });
  it("write only calls, a template or a forwarded value, never a bare variable from outside", () => {
    expect(sinks.filter((s) => s.kind === "assign" && s.value === "other").map((s) => `${s.path}:${s.line}`)).toEqual([
      "apps/web/src/data-status/panel.ts:1003",
      "apps/web/src/privacy/panel/mount.ts:231",
    ]);
  });
  it("only empty an element on the pages that mount a panel and in the data status test kit", () => {
    const all = scanSinks(files).filter((s) => s.kind === "assign" && s.value === "empty").map((s) => s.path);
    expect(all.sort()).toEqual(["apps/web/src/data-status/testkit.ts", "apps/web/src/pages/AboutPage.tsx", "apps/web/src/pages/NarrowAuditPage.tsx", "apps/web/src/privacy/panel/page.ts"]);
  });
  it("write every narrow panel through its own render function", () => {
    const narrow = sinks.filter((s) => s.path.startsWith("apps/web/src/narrow/"));
    expect(narrow.length).toBeGreaterThanOrEqual(13);
    for (const s of narrow) expect(s.callee, s.path).toMatch(/^render[A-Z]/);
  });
});
