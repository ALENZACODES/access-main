import { describe, expect, it } from 'vitest';
import { auditProvenance, OPEN_LICENCES } from './provenance.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const source = { name: 'City open data', url: 'https://example.org/data', licence: 'OGL-Canada-2.0', retrieved: '2026-11-01' };
const good = { id: 'p1', source, facts: { ramp: 'yes', elevator: 'unknown', door: { value: 'no', evidence: 'Photo taken on site' } } };

const run = (data: unknown, extra: { requiredFacts?: string[]; allowedLicences?: string[] } = {}) =>
  auditProvenance(data, { now: NOW, ...extra });
const rules = (data: unknown, extra = {}): Array<string | undefined> => run(data, extra).entries.map((e) => e.rule);

describe('auditProvenance', () => {
  it('accepts a record with a full source and clear facts', () => {
    const res = run([good]);
    expect(res.checked).toBe(1);
    expect(res.entries).toEqual([]);
  });
  it('accepts a { records: [...] } wrapper', () => {
    expect(run({ records: [good] }).entries).toEqual([]);
  });
  it('rejects data that is not a list of objects', () => {
    expect(rules('nope')).toEqual(['shape']);
    expect(rules({ a: 1 })).toEqual(['shape']);
    expect(rules([7, null])).toEqual(['shape', 'shape']);
  });

  describe('source', () => {
    it('needs a source', () => {
      expect(rules([{ id: 'a', facts: {} }])).toEqual(['source-missing']);
    });
    it.each(['name', 'url', 'licence', 'retrieved'])('needs a %s', (field) => {
      const rec = { id: 'a', source: { ...source, [field]: '' } };
      expect(rules([rec])).toContain(`source-${field}`);
    });
    it('needs an https URL', () => {
      expect(rules([{ id: 'a', source: { ...source, url: 'http://example.org' } }])).toEqual(['source-url']);
    });
    it('needs a real date that is not in the future', () => {
      expect(rules([{ id: 'a', source: { ...source, retrieved: '2026-02-30' } }])).toEqual(['retrieved-format']);
      expect(rules([{ id: 'a', source: { ...source, retrieved: '15/11/2026' } }])).toEqual(['retrieved-format']);
      expect(rules([{ id: 'a', source: { ...source, retrieved: '2026-11-16' } }])).toEqual(['retrieved-future']);
      expect(rules([{ id: 'a', source: { ...source, retrieved: '2026-11-15' } }])).toEqual([]);
    });
  });

  describe('licence', () => {
    it('lists open licences and compares them without caring about case', () => {
      expect(OPEN_LICENCES).toContain('CC-BY-4.0');
      expect(rules([{ id: 'a', source: { ...source, licence: 'cc-by-4.0' } }])).toEqual([]);
    });
    it('asks for a look at a licence that is not on the list, and does not fail it', () => {
      const res = run([{ id: 'a', source: { ...source, licence: 'All rights reserved' } }]);
      expect(res.entries.map((e) => [e.rule, e.status])).toEqual([['licence-unlisted', 'unknown']]);
    });
    it('uses the list the caller passes', () => {
      expect(rules([{ id: 'a', source: { ...source, licence: 'MIT' } }], { allowedLicences: ['MIT'] })).toEqual([]);
      expect(rules([good], { allowedLicences: ['MIT'] })).toEqual(['licence-unlisted']);
    });
  });

  describe('facts keep unknown as unknown', () => {
    it.each([null, '', 'n/a', 'N/A', 'none', '?', 'TBD', 'inconnu', 'Not sure'])('rejects %j as a spelling of unknown', (v) => {
      expect(rules([{ ...good, facts: { ramp: v } }])).toEqual(['fact-unknown-spelling']);
    });
    it('rejects a value that is not yes, no or unknown', () => {
      expect(rules([{ ...good, facts: { ramp: 'maybe' } }])).toEqual(['fact-value']);
      expect(rules([{ ...good, facts: { ramp: 3 } }])).toEqual(['fact-value']);
    });
    it('accepts booleans only when a source exists', () => {
      expect(rules([{ ...good, facts: { ramp: true } }])).toEqual([]);
      expect(rules([{ id: 'a', facts: { ramp: false } }])).toEqual(['source-missing', 'fact-unsourced']);
    });
    it('does not let a guess stand as yes or no', () => {
      expect(rules([{ ...good, facts: { ramp: { value: 'yes', evidence: 'Probably has a ramp' } } }])).toEqual(['fact-inferred']);
      expect(rules([{ ...good, facts: { ramp: { value: 'no', evidence: 'estimé' } } }])).toEqual(['fact-inferred']);
      expect(rules([{ ...good, facts: { ramp: { value: 'unknown', evidence: 'probably' } } }])).toEqual([]);
    });
    it('can require a fact to be stated, with unknown counting as stated', () => {
      expect(rules([{ ...good, facts: {} }], { requiredFacts: ['ramp'] })).toEqual(['fact-missing']);
      expect(rules([{ ...good, facts: { ramp: 'unknown' } }], { requiredFacts: ['ramp'] })).toEqual([]);
    });
  });

  it('names each problem with the record and fact, and writes both languages', () => {
    const res = run([{ id: 'p9', source, facts: { ramp: '?' } }]);
    expect(res.entries[0]?.id).toBe('p9.ramp');
    expect(res.entries[0]?.message.fr).toContain('«unknown»'.replace('«', '«\u202F').replace('»', '\u202F»'));
    expect(res.entries[0]?.check).toBe('provenance');
  });
  it('uses the position when a record has no id', () => {
    expect(run([{ source }, 5]).entries.map((e) => e.id)).toEqual(['#1']);
    expect(run([{ facts: {} }]).entries[0]?.id).toBe('#0');
  });
});
