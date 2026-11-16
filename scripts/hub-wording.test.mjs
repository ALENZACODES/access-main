import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyHubWordingBan, findBannedVerif, rewriteHubWording } from "./hub-wording.mjs";

test("rewrites user-facing verify and vérifier forms and keeps PROTOTYPE-UNVERIFIED", () => {
  const input = [
    'demo: "Demonstration data — not a verified listing",',
    'tier: "Verification tier",',
    'fr: "Vérifier un partage",',
    'label: "PROTOTYPE-UNVERIFIED",',
    "verificationTier: 'PROTOTYPE-UNVERIFIED',",
    'verifierType: "fixture-author",',
  ].join("\n");
  const out = rewriteHubWording(input);
  assert.equal(findBannedVerif(out).length, 0, out);
  assert.match(out, /PROTOTYPE-UNVERIFIED/);
  assert.match(out, /provenanceTier/);
  assert.match(out, /observerType/);
  assert.match(out, /not a recorded listing/);
  assert.doesNotMatch(out, /Verification tier/);
});

test("applyHubWordingBan rewrites a package tree and fails closed on leftovers", async () => {
  const root = await mkdtemp(join(tmpdir(), "hub-wording-"));
  try {
    const src = join(root, "src");
    await mkdir(src);
    await writeFile(join(src, "catalog.ts"), 'export const demo = "not a verified listing";\n');
    assert.throws(() => applyHubWordingBan(root), /banned verify/);
    await writeFile(
      join(src, "catalog.ts"),
      'export const demo = "Demonstration data — not a verified listing";\nexport const label = "PROTOTYPE-UNVERIFIED";\n',
    );
    applyHubWordingBan(root);
    const text = await readFile(join(src, "catalog.ts"), "utf8");
    assert.match(text, /not a recorded listing/);
    assert.match(text, /PROTOTYPE-UNVERIFIED/);
    assert.equal(findBannedVerif(text).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
