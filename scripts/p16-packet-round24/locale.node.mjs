import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FR_APOSTROPHE, FR_CLOSE, FR_NARROW, FR_NBSP, FR_OPEN,
  auditFrenchText, auditLocalizedPair, auditRecordTypography,
  auditTypographyCollection, formatFrenchCopy, statusCopy, typographyCounts,
} from "./locale.mjs";
import { copy, exampleRecord, ids, withSummary, withTitle } from "./fixtures.mjs";

const base = exampleRecord();
const codes = (copyText) => ids(auditFrenchText(copyText));

test("French typography constants match required code points", () => {
  assert.equal(FR_APOSTROPHE.charCodeAt(0), 0x2019);
  assert.equal(FR_NBSP.charCodeAt(0), 0x00a0);
  assert.equal(FR_NARROW.charCodeAt(0), 0x202f);
  assert.equal(FR_OPEN.charCodeAt(0), 0x00ab);
  assert.equal(FR_CLOSE.charCodeAt(0), 0x00bb);
});

test("plain French copy with no punctuation passes", () => {
  assert.deepEqual(auditFrenchText("Entrée accessible"), []);
});

test("colon preceded by ordinary space is reported", () => {
  assert.ok(codes("État : disponible").includes("fr.colon-space"));
});

test("colon preceded by NBSP is accepted", () => {
  assert.deepEqual(auditFrenchText(`État${FR_NBSP}: disponible`), []);
});

test("semicolon requires narrow NBSP", () => {
  assert.ok(codes("Oui ; non").includes("fr.narrow-before"));
  assert.deepEqual(auditFrenchText(`Oui${FR_NARROW}; non`), []);
});

test("question mark requires narrow NBSP", () => {
  assert.ok(codes("Accessible ?").includes("fr.narrow-before"));
  assert.deepEqual(auditFrenchText(`Accessible${FR_NARROW}?`), []);
});

test("exclamation mark requires narrow NBSP", () => {
  assert.ok(codes("Attention !").includes("fr.narrow-before"));
  assert.deepEqual(auditFrenchText(`Attention${FR_NARROW}!`), []);
});

test("French quotation marks require narrow spaces inside", () => {
  assert.ok(codes("«Entrée»").includes("fr.guillemet-open"));
  assert.ok(codes("«Entrée»").includes("fr.guillemet-close"));
  assert.deepEqual(auditFrenchText(`${FR_OPEN}${FR_NARROW}Entrée${FR_NARROW}${FR_CLOSE}`), []);
});

test("straight apostrophes receive a review finding", () => {
  assert.ok(codes("L'entrée").includes("fr.apostrophe"));
  assert.deepEqual(auditFrenchText(`L${FR_APOSTROPHE}entrée`), []);
});

test("French formatter uses correct colon spacing", () => {
  assert.equal(formatFrenchCopy("État: disponible"), `État${FR_NBSP}: disponible`);
});

test("French formatter uses correct narrow spaces for three signs", () => {
  assert.equal(formatFrenchCopy("Oui; non! Vraiment?"), `Oui${FR_NARROW}; non${FR_NARROW}! Vraiment${FR_NARROW}?`);
});

test("French formatter applies inner guillemet spaces", () => {
  assert.equal(formatFrenchCopy("«Entrée»"), `${FR_OPEN}${FR_NARROW}Entrée${FR_NARROW}${FR_CLOSE}`);
});

test("French formatter replaces straight apostrophes", () => {
  assert.equal(formatFrenchCopy("L'entrée"), `L${FR_APOSTROPHE}entrée`);
});

test("French formatting is idempotent for ordinary copy", () => {
  const original = "L'entrée: «Ouverte»; oui!";
  assert.equal(formatFrenchCopy(formatFrenchCopy(original)), formatFrenchCopy(original));
});

test("French formatting never runs implicitly in audits", () => {
  const original = "L'entrée: Ouverte";
  auditFrenchText(original);
  assert.equal(original, "L'entrée: Ouverte");
});

test("French formatter rejects control characters", () => {
  assert.throws(() => formatFrenchCopy(String.fromCharCode(7)));
});

test("French formatter rejects empty strings", () => {
  assert.throws(() => formatFrenchCopy(""));
  assert.throws(() => formatFrenchCopy("  "));
});

test("locale pair accepts complete bilingual content", () => {
  assert.deepEqual(auditLocalizedPair(base.title, "title"), []);
});

test("missing English text is a hard failure", () => {
  assert.ok(ids(auditLocalizedPair({ en: "", fr: "Entrée" }, "title")).includes("locale.missing"));
});

test("missing French text is a hard failure", () => {
  assert.ok(ids(auditLocalizedPair({ en: "Entrance", fr: "" }, "title")).includes("locale.missing"));
});

test("invalid locale object is reported", () => {
  assert.deepEqual(ids(auditLocalizedPair(null, "title")), ["locale.object"]);
});

test("duplicated translations are review-only", () => {
  const result = auditLocalizedPair({ en: "Entrance", fr: "Entrance" }, "title");
  assert.equal(result[0].code, "locale.same-copy");
  assert.equal(result[0].severity, "review");
});

test("invalid punctuation in French title is detected", () => {
  const result = auditRecordTypography(withTitle(base, { fr: "Entrée : accessible" }));
  assert.ok(ids(result).includes("fr.colon-space"));
});

test("invalid punctuation in French summary is detected", () => {
  const result = auditRecordTypography(withSummary(base, { fr: "Attention !" }));
  assert.ok(ids(result).includes("fr.narrow-before"));
});

test("valid French summary punctuation passes", () => {
  const record = withSummary(base, { fr: `Attention${FR_NARROW}!` });
  assert.deepEqual(auditRecordTypography(record), []);
});

test("optional notes are audited when present", () => {
  const record = { ...base, notes: { en: "Note", fr: "Note : oui" } };
  assert.ok(ids(auditRecordTypography(record)).includes("fr.colon-space"));
});

test("an absent optional notes field is acceptable", () => {
  assert.deepEqual(auditRecordTypography(base), []);
});

test("non-object records produce structural findings", () => {
  assert.deepEqual(ids(auditRecordTypography(null)), ["record.object"]);
});

test("collection typography checks each record", () => {
  const records = [base, withTitle(copy(base), { fr: "Accès ?" })];
  const findings = auditTypographyCollection(records);
  assert.ok(findings.some((f) => f.path.startsWith("records[1]")));
});

test("collection typography requires an array", () => {
  assert.deepEqual(ids(auditTypographyCollection({})), ["collection.array"]);
});

test("safe status copy exists in both languages", () => {
  for (const status of ["READY", "HOLD", "UNKNOWN"]) {
    assert.ok(statusCopy(status, "en").length > 0);
    assert.ok(statusCopy(status, "fr").length > 0);
  }
});

test("unknown copy contains explicit state token", () => {
  assert.ok(statusCopy("UNKNOWN", "fr").includes("UNKNOWN"));
  assert.ok(statusCopy("INVALID", "en").includes("UNKNOWN"));
});

test("language guard rejects unsupported languages", () => {
  assert.throws(() => statusCopy("READY", "de"));
});

test("typography counts split errors and review requests", () => {
  const findings = [
    { code: "a", path: "x", severity: "error" },
    { code: "b", path: "y", severity: "error" },
    { code: "c", path: "z", severity: "review" },
  ];
  assert.deepEqual(typographyCounts(findings), { error: 2, review: 1 });
});

test("diagnostics contain codes and field paths, not source copy", () => {
  const text = "Source private copy: do not expose";
  const findings = auditFrenchText(text);
  assert.equal(JSON.stringify(findings).includes(text), false);
});

test("localization tests do not mutate shared fixtures", () => {
  const record = copy(base);
  const before = copy(record);
  auditRecordTypography(record);
  assert.deepEqual(record, before);
});
