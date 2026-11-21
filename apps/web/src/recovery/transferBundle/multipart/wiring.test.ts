import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { forbiddenOrgNeedles } from "../../../../../../packages/shared/test/forbiddenOrg";
import { multipartCopy } from "./copy";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const rootPanel = read("../Panel.tsx");
const disclosure = read("../Disclosure.tsx");
const barrel = read("../../index.ts");
const modules = ["./model.ts", "./planner.ts", "./analysis.ts", "./receipt.ts", "./copy.ts", "./Panel.tsx"]
  .map(path => read(path));

describe("multi-part transfer integration and copy contracts", () => {
  it("mounts the new panel from the existing lazy-loaded transfer panel", () => {
    expect(rootPanel).toContain('import { MultipartTransferPanel } from "./multipart/Panel"');
    expect(rootPanel).toContain("<MultipartTransferPanel locale={locale} />");
  });

  it("keeps the transfer tool lazy-loaded by the recovery shell disclosure", () => {
    expect(disclosure).toContain('await import("./Panel")');
  });

  it("exports the model, planner, audit, receipt and bilingual copy APIs from the recovery barrel", () => {
    for (const path of ["./transferBundle/multipart/model", "./transferBundle/multipart/planner",
      "./transferBundle/multipart/analysis", "./transferBundle/multipart/receipt",
      "./transferBundle/multipart/copy"]) {
      expect(barrel).toContain(`from "${path}"`);
    }
  });

  it("keeps all unknown claims literal in both languages", () => {
    expect(JSON.stringify(multipartCopy("en"))).not.toMatch(/unknown means available|ready for use/i);
    expect(JSON.stringify(multipartCopy("fr"))).toContain("empreinte");
  });

  it("uses French non-breaking spaces before punctuation where labels use colons", () => {
    const fr = JSON.stringify(multipartCopy("fr"));
    expect(fr).not.toMatch(/ [;:!?]/u);
    expect(fr).toContain("\u00a0");
  });

  it("does not make sender identity or record accuracy claims", () => {
    const all = [...modules, JSON.stringify(multipartCopy("en")), JSON.stringify(multipartCopy("fr"))].join("\n");
    expect(all).not.toMatch(/sender verified|identity confirmed|accuracy confirmed/i);
    expect(all).not.toMatch(/expéditeur vérifié|identité confirmée|exactitude confirmée/i);
  });

  it("does not make network requests or write browser storage", () => {
    for (const source of modules) {
      expect(source).not.toContain(["fe", "tch("].join(""));
      expect(source).not.toContain(["localStorage", ".setItem("].join(""));
      expect(source).not.toContain(["indexedDB", ".open("].join(""));
    }
  });

  it("keeps the feature free of scheduled work and automatic retries", () => {
    for (const source of modules) {
      expect(source).not.toContain(["set", "Timeout("].join(""));
      expect(source).not.toContain(["set", "Interval("].join(""));
      expect(source).not.toContain(["Web", "Socket("].join(""));
    }
  });

  it("keeps all files within the repository privacy needle policy", () => {
    for (const source of [...modules, rootPanel, disclosure, barrel]) {
      for (const needle of forbiddenOrgNeedles()) {
        expect(source.toLocaleLowerCase()).not.toContain(needle.toLocaleLowerCase());
      }
    }
  });
});
