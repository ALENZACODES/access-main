import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { containsForbiddenOrg, forbiddenOrgNeedles } from "./forbiddenOrg.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("forbidden organisation-name guard", () => {
  it("is not re-exported from the public @access/shared barrel", () => {
    const barrel = readFileSync(join(here, "../src/index.ts"), "utf8");
    expect(barrel.includes("forbiddenOrg")).toBe(false);
  });

  it("rejects each encoded needle, including the long English and French names, without regard to case", () => {
    const needles = forbiddenOrgNeedles();
    expect(needles.length).toBeGreaterThanOrEqual(6);
    for (const needle of needles) {
      if (containsForbiddenOrg(needle) !== true) {
        throw new Error("a coded needle was not rejected");
      }
      if (containsForbiddenOrg(needle.toLowerCase()) !== true) {
        throw new Error("a lower-case coded needle was not rejected");
      }
      if (containsForbiddenOrg(needle.toUpperCase()) !== true) {
        throw new Error("an upper-case coded needle was not rejected");
      }
      if (containsForbiddenOrg(`prefix ${needle} suffix`) !== true) {
        throw new Error("a coded needle embedded in other text was not rejected");
      }
    }
    expect(containsForbiddenOrg("the App")).toBe(false);
    expect(containsForbiddenOrg("l'application")).toBe(false);
  });
});
