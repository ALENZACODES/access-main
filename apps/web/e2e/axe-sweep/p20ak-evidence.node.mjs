import test from "node:test";
import assert from "node:assert/strict";
import {
  provenanceComplete, evidenceKnown, provenanceSignature, evidenceSignature,
  evidenceFindings, evidenceContinuity, evidenceEventFindings, receiptFindings,
  reconcileReceipts, escapeCsv, csvHeader, exportEvidenceCsv, exportEvidenceText,
  exportEvidenceJson, exportIntegrity, summarizeEvidence, compareEvidenceIds,
} from "./p20ak-evidence.ts";
import { sampleEvidence, sampleEvent, sampleSnapshot, UNKNOWN } from "./p20ak-types.ts";
const record = (patch = {}) => sampleEvidence(patch);
const known = (patch = {}) => record({ value: "Observed", certainty: "observed", ...patch });
const codes = (items) => items.map((item) => item.code);
const receipt = (patch = {}) => ({ traceId: "trace", route: "/places", locale: "en", observedAt: 100,
  result: "pass", errors: 0, warnings: 0, unknowns: 0, findings: [], evidence: [], ...patch });

test("a synthetic complete known record is known", () => {
  assert.equal(provenanceComplete(known()), true);
  assert.equal(evidenceKnown(known()), true);
});
test("an unknown sample is never counted as known", () => {
  assert.equal(evidenceKnown(record()), false);
});
test("provenance signature does not depend on translation", () => {
  assert.equal(provenanceSignature(known()), provenanceSignature(known({ label: "Exemple" })));
});
test("evidence signature includes observed value", () => {
  assert.notEqual(evidenceSignature(known()), evidenceSignature(known({ value: "Different" })));
});
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`missing ${field} makes provenance incomplete`, () => {
    const p = { ...known().provenance, [field]: null };
    assert.equal(provenanceComplete(known({ provenance: p })), false);
  });
  test(`sentinel ${field} makes provenance incomplete`, () => {
    const p = { ...known().provenance, [field]: UNKNOWN };
    assert.equal(provenanceComplete(known({ provenance: p })), false);
  });
  test(`changing ${field} modifies provenance identity`, () => {
    const p = { ...known().provenance, [field]: "Different" };
    assert.notEqual(provenanceSignature(known()), provenanceSignature(known({ provenance: p })));
  });
  test(`preserving ${field} drift is detected`, () => {
    const changed = known({ provenance: { ...known().provenance, [field]: "Different" } });
    assert.ok(codes(evidenceContinuity([known()], [changed], true, 3)).includes("provenance-changed"));
  });
}
for (const value of [null, undefined, "", "UNKNOWN", "unknown", "Inconnu", "Inconnue", "N/A", "—", "-"]) {
  test(`unknown value ${String(value)} is not promoted`, () => {
    assert.equal(evidenceKnown(known({ value })), false);
  });
}
for (const id of ["", " "]) {
  test(`empty identifier ${JSON.stringify(id)} is reported`, () => {
    assert.ok(codes(evidenceFindings([record({ id })])).includes("evidence-id-missing"));
  });
}
for (const label of [null, "", "UNKNOWN", "Inconnu"]) {
  test(`missing label ${String(label)} remains information`, () => {
    const findings = evidenceFindings([record({ label })]);
    assert.ok(codes(findings).includes("evidence-label-unknown"));
  });
}
for (const field of ["source", "licence", "retrievedOn", "tier"]) {
  test(`missing metadata field ${field} is diagnosed`, () => {
    const p = { ...record().provenance, [field]: null };
    const findings = evidenceFindings([record({ provenance: p })]);
    assert.ok(findings.some((item) => item.code.includes("unknown")));
  });
}
test("duplicate evidence identifiers are rejected", () => {
  assert.ok(codes(evidenceFindings([record(), record()])).includes("evidence-id-duplicate"));
});
test("unsupported observed claim cannot use an UNKNOWN value", () => {
  assert.ok(codes(evidenceFindings([record({ certainty: "observed" })])).includes("evidence-claim-without-value"));
});
test("unknown certainty with nonempty value produces warning", () => {
  assert.ok(codes(evidenceFindings([record({ value: "Measured" })])).includes("evidence-uncertain-value"));
});
test("known translation may change while provenance stays stable", () => {
  assert.deepEqual(evidenceContinuity([known()], [known({ label: "Exemple" })], true), []);
});
test("non-preserving search can replace result list", () => {
  assert.deepEqual(evidenceContinuity([known()], [], false), []);
});
test("preserving transition detects removed evidence", () => {
  assert.ok(codes(evidenceContinuity([known()], [], true)).includes("evidence-lost"));
});
test("UNKNOWN certainty may remain UNKNOWN", () => {
  assert.equal(codes(evidenceContinuity([record()], [record()], true)).includes("unknown-promoted"), false);
});
test("UNKNOWN value requires fresh provenance before promotion", () => {
  const updated = known();
  assert.ok(codes(evidenceContinuity([record()], [updated], true)).includes("unknown-promoted"));
});
test("language switch preserves evidence metadata", () => {
  const before = sampleSnapshot({ evidence: [known()] });
  const after = sampleSnapshot({ language: "fr", evidence: [known({ label: "Exemple" })] });
  assert.deepEqual(evidenceEventFindings(sampleEvent({ action: "language", before, after }), 2), []);
});
test("search transition can replace evidence", () => {
  const before = sampleSnapshot({ evidence: [known()] });
  const after = sampleSnapshot({ evidence: [] });
  assert.deepEqual(evidenceEventFindings(sampleEvent({ action: "search", before, after }), 2), []);
});
test("explicitly preserving search protects evidence", () => {
  const before = sampleSnapshot({ evidence: [known()] });
  const after = sampleSnapshot({ evidence: [] });
  assert.ok(codes(evidenceEventFindings(sampleEvent({ action: "search", before, after, preserveEvidence: true }), 2)).includes("evidence-lost"));
});
for (const text of ["=SUM(1,1)", "+SUM(1,1)", "-2+4", "@cmd", "  =A1"]) {
  test(`CSV formula entry ${text} is protected`, () => {
    assert.ok(escapeCsv(text).startsWith('"\''));
  });
}
for (const text of ["abc", "Value", "UNKNOWN", "0", "a,b"]) {
  test(`ordinary CSV value ${text} remains quoted`, () => {
    assert.equal(escapeCsv(text), `"${text}"`);
  });
}
test("CSV escapes embedded double quotes", () => {
  assert.equal(escapeCsv('say "hello"'), '"say ""hello"""');
});
test("CSV has localized French headers", () => {
  assert.ok(csvHeader("fr").includes("Date de consultation"));
});
test("CSV has English headers", () => {
  assert.ok(csvHeader("en").includes("Retrieved on"));
});
test("CSV begins with UTF8 BOM and CRLF", () => {
  const output = exportEvidenceCsv([known()], "en");
  assert.ok(output.startsWith("\uFEFF"));
  assert.ok(output.endsWith("\r\n"));
});
test("CSV retains UNKNOWN sentinel", () => {
  assert.ok(exportEvidenceCsv([record()], "fr").includes(UNKNOWN));
});
test("CSV export includes source and retrieval date", () => {
  const output = exportEvidenceCsv([known()], "en");
  assert.ok(output.includes("Synthetic example"));
  assert.ok(output.includes("2026-11-20"));
});
test("text export includes localized copy", () => {
  assert.ok(exportEvidenceText([record()], "fr").includes("Niveau de preuve"));
});
test("text export includes source metadata", () => {
  assert.ok(exportEvidenceText([record()], "en").includes("Example licence"));
});
test("JSON export contains a format marker", () => {
  const json = JSON.parse(exportEvidenceJson([known()]));
  assert.equal(json.format, "the-app-evidence-v1");
});
test("JSON export preserves record identifiers", () => {
  const json = JSON.parse(exportEvidenceJson([record()]));
  assert.equal(json.records[0].id, "demo");
});
test("JSON export preserves UNKNOWN", () => {
  const json = JSON.parse(exportEvidenceJson([record()]));
  assert.equal(json.records[0].value, UNKNOWN);
});
for (const format of ["csv", "text", "json"]) {
  test(`unmodified ${format} export matches deterministic representation`, () => {
    const output = format === "csv" ? exportEvidenceCsv([record()], "en") : format === "text" ? exportEvidenceText([record()], "en") : exportEvidenceJson([record()]);
    assert.deepEqual(exportIntegrity([record()], output, format, "en"), []);
  });
  test(`truncated ${format} export is rejected`, () => {
    assert.ok(codes(exportIntegrity([known()], "", format, "en")).includes("export-content-drift"));
  });
}
test("export dropping UNKNOWN is detected", () => {
  assert.ok(codes(exportIntegrity([record()], "none", "json", "en")).includes("export-unknown-lost"));
});
test("export dropping retrieval date is detected", () => {
  assert.ok(codes(exportIntegrity([known()], "none", "text", "en")).includes("export-date-lost"));
});
test("summaries count uncertainty separately", () => {
  const summary = summarizeEvidence([record(), known(), known({ value: UNKNOWN })]);
  assert.deepEqual(summary, { known: 1, unknown: 1, incomplete: 1, total: 3 });
});
test("ID comparison identifies additions and removals", () => {
  const result = compareEvidenceIds([record({ id: "one" })], [record({ id: "two" })]);
  assert.deepEqual(result, { added: ["two"], removed: ["one"], common: [] });
});
test("receipt cannot pass while counting errors", () => {
  assert.ok(codes(receiptFindings(receipt({ errors: 1 }))).includes("receipt-overclaim"));
});
test("receipt unknowns cannot be called an unqualified pass", () => {
  assert.ok(codes(receiptFindings(receipt({ unknowns: 1 }))).includes("receipt-unknown-overclaim"));
});
test("receipt timestamps must be finite", () => {
  assert.ok(codes(receiptFindings(receipt({ observedAt: Number.NaN }))).includes("receipt-time"));
});
test("receipt metadata loss is diagnosed", () => {
  assert.ok(codes(reconcileReceipts(receipt({ evidence: [known()] }), receipt({ evidence: [] }))).includes("evidence-lost"));
});
test("receipt route continuity is checked", () => {
  assert.ok(codes(reconcileReceipts(receipt(), receipt({ route: "/help" }))).includes("receipt-route-changed"));
});
test("receipt trace identity continuity is checked", () => {
  assert.ok(codes(reconcileReceipts(receipt(), receipt({ traceId: "other" }))).includes("receipt-trace-changed"));
});
