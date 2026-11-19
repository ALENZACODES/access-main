import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAIN_VERSION, inspectEvidenceChain, formatEvidenceChainReport } from './offline-evidence-chain.mjs';

function fixture() {
  return {
    version: CHAIN_VERSION,
    sources: [{ id: 's1', title: 'Synthetic observation', url: 'https://example.test/evidence',
      licence: 'CC0-1.0', retrievedOn: '2026-11-19', tier: 0 }],
    observations: [{ id: 'o1', sourceId: 's1', recordedOn: '2026-11-18' }],
    claims: [{ id: 'c1', observationIds: ['o1'], state: 'UNKNOWN',
      label: { en: 'Entrance information unknown', fr: 'Entrée non documentée' } }],
  };
}

function run(change, options) {
  const document = fixture();
  change?.(document);
  return inspectEvidenceChain(document, options);
}
function codes(result) { return result.issues.map((value) => value.code); }
function has(result, code) { assert.ok(codes(result).includes(code), JSON.stringify(result.issues)); }

// Input and provenance contracts.
test('fixture remains an explicitly unknown claim', () => {
  const result = run();
  assert.equal(result.ok, true);
  assert.equal(result.summary.unknown, 1);
  assert.equal(result.summary.known, 0);
  assert.equal(result.summary.structurallySupported, 0);
});
test('document must be an object', () => {
  const result = inspectEvidenceChain([]);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  has(result, 'DOCUMENT_OBJECT');
});
test('version mismatch fails closed', () => has(run((d) => { d.version = 2; }), 'VERSION'));
test('source collection is mandatory', () => has(run((d) => { delete d.sources; }), 'COLLECTION_REQUIRED'));
test('observations collection is mandatory', () => has(run((d) => { delete d.observations; }), 'COLLECTION_REQUIRED'));
test('claims collection is mandatory', () => has(run((d) => { delete d.claims; }), 'COLLECTION_REQUIRED'));
test('collection length is bounded', () => has(run((d) => {
  d.sources = Array.from({ length: 20001 }, (_, i) => ({ id: `s${i}` }));
}), 'COLLECTION_LIMIT'));
test('malformed entry fails', () => has(run((d) => { d.sources.push(null); }), 'ENTRY_OBJECT'));
test('IDs must be stable and bounded', () => has(run((d) => { d.sources[0].id = 'bad key'; }), 'ENTRY_ID'));
test('duplicate source IDs are reported', () => has(run((d) => { d.sources.push({ ...d.sources[0] }); }), 'DUPLICATE_ID'));
test('duplicate observation IDs are reported', () => has(run((d) => { d.observations.push({ ...d.observations[0] }); }), 'DUPLICATE_ID'));
test('duplicate claim IDs are reported', () => has(run((d) => { d.claims.push({ ...d.claims[0] }); }), 'DUPLICATE_ID'));
test('source title cannot be blank', () => has(run((d) => { d.sources[0].title = ' '; }), 'SOURCE_TITLE'));
test('licence is required', () => has(run((d) => { d.sources[0].licence = ''; }), 'SOURCE_LICENCE'));
test('canonical tier is required', () => has(run((d) => { d.sources[0].tier = 'confirmed'; }), 'SOURCE_TIER'));
test('all canonical source tiers are structurally recognised', () => {
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    assert.equal(run((d) => { d.sources[0].tier = tier; }).ok, true);
  }
});
test('missing source retrieval date fails', () => has(run((d) => { delete d.sources[0].retrievedOn; }), 'SOURCE_DATE'));
test('invalid calendar date fails', () => has(run((d) => { d.sources[0].retrievedOn = '2026-02-30'; }), 'SOURCE_DATE'));
test('future retrieval date fails', () => has(run((d) => { d.sources[0].retrievedOn = '2026-11-20'; }), 'SOURCE_DATE'));
test('date option itself is validated', () => has(run(null, { today: 'invalid' }), 'TODAY'));
test('a leap day is valid', () => assert.equal(run((d) => { d.sources[0].retrievedOn = '2024-02-29'; }).ok, true));
test('source must use safe HTTPS', () => {
  for (const url of ['http://example.test', 'javascript:alert(1)', 'file:///tmp/private',
    'https://a:b@example.test', 'https://example.test/#anchor', 'https://example.test/\n']) {
    has(run((d) => { d.sources[0].url = url; }), 'SOURCE_URL');
  }
});
test('non-matching source reference fails', () => has(run((d) => { d.observations[0].sourceId = 'missing'; }), 'SOURCE_REFERENCE'));
test('a source whose provenance is incomplete is not usable', () => {
  const result = run((d) => { d.sources[0].licence = ''; d.claims[0].state = 'YES'; });
  has(result, 'SOURCE_UNUSABLE');
  has(result, 'CLAIM_UNSUPPORTED');
  assert.equal(result.summary.structurallySupported, 0);
});
test('observation dates are mandatory', () => has(run((d) => { delete d.observations[0].recordedOn; }), 'OBSERVATION_DATE'));
test('observation date cannot be future', () => has(run((d) => { d.observations[0].recordedOn = '2026-11-20'; }), 'OBSERVATION_DATE'));

// Citation graph behaviour.
test('a known claim with one complete source path has structural citations only', () => {
  const result = run((d) => { d.claims[0].state = 'YES'; });
  assert.equal(result.ok, true);
  assert.equal(result.summary.known, 1);
  assert.equal(result.summary.structurallySupported, 1);
});
test('no evidence does not support an affirmative claim', () => has(run((d) => {
  d.claims[0].state = 'YES'; d.claims[0].observationIds = [];
}), 'CLAIM_NO_EVIDENCE'));
test('no evidence does not support a negative claim', () => has(run((d) => {
  d.claims[0].state = 'NO'; d.claims[0].observationIds = [];
}), 'CLAIM_NO_EVIDENCE'));
test('unknown remains unknown even with complete evidence', () => {
  const result = run((d) => { d.observations[0].note = { en: 'No conclusion', fr: 'Aucune conclusion' }; });
  assert.equal(result.ok, true);
  assert.equal(result.summary.unknown, 1);
});
test('invalid claim state is rejected', () => has(run((d) => { d.claims[0].state = 'accessible'; }), 'CLAIM_STATE'));
test('missing referenced observation is reported', () => has(run((d) => {
  d.claims[0].observationIds = ['does-not-exist'];
}), 'CLAIM_REFERENCE'));
test('missing observation ref also blocks a known claim', () => has(run((d) => {
  d.claims[0].state = 'YES'; d.claims[0].observationIds = ['does-not-exist'];
}), 'CLAIM_UNSUPPORTED'));
test('claim refs must be an array', () => has(run((d) => { d.claims[0].observationIds = 'o1'; }), 'REFERENCES_ARRAY'));
test('duplicate claim refs are rejected', () => has(run((d) => { d.claims[0].observationIds = ['o1', 'o1']; }), 'DUPLICATE_REFERENCE'));
test('invalid claim ref syntax is rejected', () => has(run((d) => { d.claims[0].observationIds = ['o1', 'bad id']; }), 'REFERENCE_ID'));
test('a nested, valid citation chain passes', () => {
  const result = run((d) => {
    d.observations.push({ id: 'o2', sourceId: 's1', recordedOn: '2026-11-18', evidenceIds: ['o1'] });
    d.claims[0].state = 'NO'; d.claims[0].observationIds = ['o2'];
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.structurallySupported, 1);
});
test('missing nested evidence blocks a known claim', () => {
  const result = run((d) => {
    d.observations[0].evidenceIds = ['missing']; d.claims[0].state = 'NO';
  });
  has(result, 'EVIDENCE_REFERENCE');
  has(result, 'CLAIM_UNSUPPORTED');
});
test('self reference fails closed', () => has(run((d) => {
  d.observations[0].evidenceIds = ['o1']; d.claims[0].state = 'YES';
}), 'SELF_REFERENCE'));
test('two-node citation cycle fails closed', () => {
  const result = run((d) => {
    d.observations[0].evidenceIds = ['o2'];
    d.observations.push({ id: 'o2', sourceId: 's1', recordedOn: '2026-11-18', evidenceIds: ['o1'] });
    d.claims[0].state = 'YES';
  });
  has(result, 'REFERENCE_CYCLE');
  has(result, 'CLAIM_UNSUPPORTED');
});
test('unreferenced observation is reported', () => has(run((d) => {
  d.observations.push({ id: 'orphan', sourceId: 's1', recordedOn: '2026-11-18' });
}), 'UNUSED_OBSERVATION'));
test('duplicate nested observation refs rejected', () => has(run((d) => {
  d.observations[0].evidenceIds = ['o2', 'o2'];
}), 'DUPLICATE_REFERENCE'));

// Bilingual accessibility of generated reports and input labels.
test('claim labels require English and French', () => has(run((d) => {
  d.claims[0].label.fr = '';
}), 'BILINGUAL_TEXT'));
test('observation notes require English and French', () => has(run((d) => {
  d.observations[0].note = { en: 'Note' };
}), 'BILINGUAL_TEXT'));
test('French colon requires a nonbreaking space', () => has(run((d) => {
  d.claims[0].label.fr = 'Entrée: inconnue';
}), 'FR_SPACING'));
test('French question mark requires a nonbreaking space', () => has(run((d) => {
  d.claims[0].label.fr = 'Entrée?';
}), 'FR_SPACING'));
test('French exclamation mark requires a nonbreaking space', () => has(run((d) => {
  d.claims[0].label.fr = 'Attention!';
}), 'FR_SPACING'));
test('correct French nonbreaking punctuation is accepted', () => assert.equal(run((d) => {
  d.claims[0].label.fr = 'Entrée\u00a0: inconnue\u00a0!';
}).ok, true));
test('opening and closing French guillemets require nonbreaking spaces', () => {
  has(run((d) => { d.claims[0].label.fr = '«Entrée»'; }), 'FR_GUILLEMET');
  assert.equal(run((d) => { d.claims[0].label.fr = '«\u00a0Entrée\u00a0»'; }).ok, true);
});
test('extra translation keys fail closed', () => has(run((d) => {
  d.claims[0].label.de = 'Eingang';
}), 'UNEXPECTED_TEXT_KEY'));

// Private data and stable reports.
test('private secrets are refused even in nested metadata', () => has(run((d) => {
  d.claims[0].metadata = { access_token: 'not-a-real-token' };
}), 'PRIVATE_FIELD'));
test('sensitive health fields are refused', () => has(run((d) => {
  d.observations[0].diagnosis = 'test';
}), 'PRIVATE_FIELD'));
test('a circular object does not make privacy scanning recurse forever', () => {
  const document = fixture();
  document.extra = document;
  assert.ok(inspectEvidenceChain(document).summary);
});
test('the audit does not mutate the input', () => {
  const document = fixture();
  const prior = JSON.stringify(document);
  inspectEvidenceChain(document);
  assert.equal(JSON.stringify(document), prior);
});
test('issues are deterministically ordered', () => {
  const result = run((d) => { d.sources[0].licence = ''; d.claims[0].state = 'YES'; });
  const expected = [...result.issues].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
  assert.deepEqual(result.issues, expected);
});
test('English report contains counts and avoids real-place guarantees', () => {
  const report = formatEvidenceChainReport(run());
  assert.match(report, /Unknown claims: 1/);
  assert.match(report, /No conclusion about real-world accessibility/);
});
test('French report uses nonbreaking-space punctuation', () => {
  const report = formatEvidenceChainReport(run(), 'fr');
  assert.ok(report.includes('Sources\u00a0: 1'));
  assert.match(report, /Aucune conclusion/);
});
test('invalid report input yields no misleading text', () => assert.equal(formatEvidenceChainReport(null), ''));
