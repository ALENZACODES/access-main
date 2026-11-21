import { describe, expect, it } from "vitest";
import { compareClaims, formatClaimComparison, scanClaims } from "./claimScan";

const f = (path: string, text: string) => ({ path, text });
const scan = (text: string, path = "apps/web/src/a.ts") => scanClaims([f(path, text)]);

describe("scanClaims: English statements", () => {
  it.each([
    ['const a = "Nothing is sent.";'],
    ['const a = "Nothing is uploaded from here.";'],
    ['const a = "Nothing is published.";'],
    ['const a = "Your notes are not sent anywhere.";'],
    ['const a = "The file stays on this device.";'],
    ['const a = "Rounds stay on this device.";'],
    ['const a = "It does not upload your cells.";'],
    ['const a = "There is no account.";'],
    ['const a = "Your data never leaves the page.";'],
  ])("finds %s", (line) => {
    expect(scan(line)).toEqual([{ path: "apps/web/src/a.ts", en: 1, fr: 0, lines: [1] }]);
  });
  it("does not find a line that says something is kept or cannot be kept on the device", () => {
    expect(scan('const a = "This report could not be kept on this device.";')).toEqual([]);
    expect(scan('const a = "Plans are kept on this device.";')).toEqual([]);
  });
  it("does not find a form control that is not sent with a form", () => {
    expect(scan('const a = "The control is not sent with any form.";')).toEqual([]);
  });
});

describe("scanClaims: French statements", () => {
  it.each([
    ['const a = "Rien n’est envoyé.";'],
    ['const a = "Rien ici n’est envoyé nulle part.";'],
    ['const a = "Aucune donnée n’est envoyée ni enregistrée.";'],
    ['const a = "Ils ne sont envoyés nulle part.";'],
    ['const a = "Les réglages restent sur cet appareil.";'],
    ['const a = "Le plan reste sur cet appareil.";'],
    ['const a = "L\'application n\'envoie jamais de contributions.";'],
    ['const a = "Cette interface n\'a pas de serveur.";'],
  ])("finds %s", (line) => {
    expect(scan(line)).toEqual([{ path: "apps/web/src/a.ts", en: 0, fr: 1, lines: [1] }]);
  });
  it("does not find a link that leads nowhere", () => {
    expect(scan('const a = "Le lien ne mène nulle part.";')).toEqual([]);
  });
});

describe("scanClaims: what is read", () => {
  it("counts each language on its own and lists every line, sorted", () => {
    const text = ['const a = "Nothing is sent.";', "const b = 1;", 'const c = "Rien n’est envoyé.";', 'const d = "Nothing is uploaded.";'].join("\n");
    expect(scan(text)).toEqual([{ path: "apps/web/src/a.ts", en: 2, fr: 1, lines: [1, 3, 4] }]);
  });
  it("counts a line with both languages once in each", () => {
    expect(scan('const a = { en: "Nothing is sent.", fr: "Rien n’est envoyé." };')).toEqual([{ path: "apps/web/src/a.ts", en: 1, fr: 1, lines: [1] }]);
  });
  it("skips comment lines and lines without a quoted string", () => {
    const text = ["// Nothing is sent.", " * Nothing is sent.", "/* Nothing is sent. */", "Nothing is sent."].join("\n");
    expect(scan(text)).toEqual([]);
  });
  it("skips the privacy folder, test scripts, test kits, samples and files outside the scan", () => {
    const text = 'const a = "Nothing is sent.";';
    for (const p of ["apps/web/src/privacy/panel/x.ts", "apps/web/src/a.node.mjs", "apps/web/src/site-testkit.ts", "apps/web/src/narrow/samples.ts", "apps/web/src/a.md", "apps/web/src/a.test.ts"]) expect(scan(text, p), p).toEqual([]);
  });
  it("lists files in path order", () => {
    const r = scanClaims([f("apps/web/src/z.ts", 'const a = "Nothing is sent.";'), f("apps/web/src/b.ts", 'const a = "Nothing is sent.";')]);
    expect(r.map((x) => x.path)).toEqual(["apps/web/src/b.ts", "apps/web/src/z.ts"]);
  });
});

describe("compareClaims", () => {
  const found = scan('const a = "Nothing is sent.";\nconst b = "Rien n’est envoyé.";');
  const row = (en: number, fr: number, path = "apps/web/src/a.ts") => ({ path, en, fr });
  it("is clean when the counts match", () => {
    const c = compareClaims(found, [row(1, 1)]);
    expect(c).toEqual({ unlisted: [], stale: [], differences: [] });
    expect(formatClaimComparison(c)).toBe("");
  });
  it("names a file with statements and no row", () => {
    expect(formatClaimComparison(compareClaims(found, []))).toBe("apps/web/src/a.ts: holds 2 statements (line 1, 2) but has no row in statementRegister.ts");
  });
  it("names a single statement in the singular", () => {
    expect(formatClaimComparison(compareClaims(scan('const a = "Nothing is sent.";'), []))).toContain("holds 1 statement (line 1)");
  });
  it("names a row whose file holds no statement now", () => {
    expect(formatClaimComparison(compareClaims([], [row(1, 0)]))).toBe("apps/web/src/a.ts: in statementRegister.ts but the source holds no statement there");
  });
  it("names counts that differ", () => {
    expect(formatClaimComparison(compareClaims(found, [row(2, 1)]))).toBe("apps/web/src/a.ts: the register says 2 English and 1 French, the source has 1 and 1 (line 1, 2)");
  });
});
