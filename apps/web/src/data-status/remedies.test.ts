import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord, type FindingCode } from './datasetRegistry';
import { lintFrench } from './i18n';
import { buildActions, exampleText, FINDING_CODES, MAX_EXAMPLES, remedyStep, remedyTitle, renderActionsHtml, type ActionItem } from './remedies';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';
import { findingRank } from './datasetRegistry';

const record = (id: string, sources: DatasetRecord['sources'], name = `Dataset ${id}`): DatasetRecord => ({ id, name, kind: 'places', sources });
const good = { name: 'Good', source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -2) };

describe('FINDING_CODES', () => {
  it('lists every code the audit can produce, once each', () => {
    expect(new Set(FINDING_CODES).size).toBe(FINDING_CODES.length);
    const seen = new Set<FindingCode>();
    for (let seed = 1; seed <= 200; seed++) for (const f of auditRegistry(randomRegistry(seed, NOW), NOW).findings) seen.add(f.code);
    for (const code of seen) expect(FINDING_CODES, code).toContain(code);
  });
  it('has a title and a step in both languages for every code', () => {
    for (const code of FINDING_CODES) {
      for (const locale of ['en', 'fr'] as const) {
        expect(remedyTitle(code, locale).length, `${code} ${locale}`).toBeGreaterThan(3);
        expect(remedyStep(code, locale).length, `${code} ${locale}`).toBeGreaterThan(10);
      }
    }
  });
});

describe('buildActions', () => {
  it('is empty when the registry has no findings', () => {
    expect(buildActions(auditRegistry([record('a', [{ id: 's', ...good }])], NOW))).toEqual([]);
    expect(buildActions(auditRegistry([], NOW))).toEqual([]);
  });
  it('groups findings by kind and counts them', () => {
    const items = buildActions(auditRegistry(RECORDS, NOW));
    const byCode = Object.fromEntries(items.map((i) => [i.code, i.count]));
    expect(byCode['licence-unrecognised']).toBe(1);
    expect(byCode['stale']).toBe(1);
    expect(byCode['missing-date']).toBe(1);
    expect(items.reduce((n, i) => n + i.count, 0)).toBe(auditRegistry(RECORDS, NOW).findings.length);
  });
  it('puts the most urgent kinds first, then the larger group, then a fixed order', () => {
    const records = [
      record('a', [{ id: '1' }, { id: '2' }, { id: '3', ...good, retrievedAt: isoDayOffset(NOW, -400) }]),
      record('b', [{ id: '4', ...good, licence: 'Weird' }]),
    ];
    const items = buildActions(auditRegistry(records, NOW));
    const ranks = items.map((i) => findingRank(i.code));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    const sameRank = items.filter((i) => findingRank(i.code) === findingRank(items[0]?.code as FindingCode));
    const counts = sameRank.map((i) => i.count);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
  });
  it('lists at most three examples, without repeats, and says how many more there are', () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, source: 'P', licence: 'OGL-Ontario' }));
    const item = buildActions(auditRegistry([record('d', sources)], NOW)).find((i) => i.code === 'missing-date');
    expect(item?.count).toBe(6);
    expect(item?.examples).toHaveLength(MAX_EXAMPLES);
    expect(item?.more).toBe(3);
    expect(new Set(item?.examples).size).toBe(MAX_EXAMPLES);
  });
  it('counts a dataset-level finding by the dataset name alone', () => {
    const items = buildActions(auditRegistry([record('d', [])], NOW));
    expect(items.find((i) => i.code === 'no-sources')?.examples).toEqual(['Dataset d']);
  });
  it('merges equal names so one source with two findings shows once among the examples', () => {
    const item = buildActions(auditRegistry([record('d', [{ id: 's' }])], NOW)).find((i) => i.code === 'missing-licence');
    expect(item?.examples).toEqual(['Dataset d / s']);
  });
  it('detects duplicate ids as their own kinds', () => {
    const items = buildActions(auditRegistry([record('x', [{ id: 's', ...good }, { id: 's', ...good }]), record('x', [{ id: 't', ...good }])], NOW));
    expect(items.map((i) => i.code)).toEqual(expect.arrayContaining(['duplicate-dataset-id', 'duplicate-source-id']));
  });
});

describe('exampleText', () => {
  const item = (examples: string[], more: number): ActionItem => ({ code: 'stale', count: examples.length + more, examples, more });
  it('lists the examples with a semicolon in English', () => {
    expect(exampleText(item(['A', 'B'], 0), 'en')).toBe('For example: A; B.');
  });
  it('adds the remainder, with the French singular and plural', () => {
    expect(exampleText(item(['A', 'B', 'C'], 1), 'en')).toBe('For example: A; B; C, and 1 more.');
    expect(exampleText(item(['A'], 1), 'fr')).toBe('Par exemple : A et 1 autre.');
    expect(exampleText(item(['A'], 4), 'fr')).toBe('Par exemple : A et 4 autres.');
  });
  it('puts a narrow no-break space before each French semicolon', () => {
    const text = exampleText(item(['A', 'B', 'C'], 0), 'fr');
    expect(text).toBe('Par exemple : A ; B ; C.');
    expect(lintFrench(text)).toEqual([]);
  });
});

describe('renderActionsHtml', () => {
  const html = renderActionsHtml(buildActions(auditRegistry(RECORDS, NOW)), 'en');
  it('has a labelled section with an ordered list, one item per kind', () => {
    expect(html).toContain('aria-labelledby="ds-actions-title"');
    expect(html).toContain('<h2 id="ds-actions-title">What to do next</h2>');
    expect(html.match(/<li>/g)?.length).toBe(buildActions(auditRegistry(RECORDS, NOW)).length);
    expect(html).toContain('<ol>');
  });
  it('shows the count, the step and the examples', () => {
    expect(html).toContain('<strong>Possibly out of date</strong> (1 item)');
    expect(html).toContain('Look at the source again and fetch a newer copy if one exists.');
    expect(html).toContain('For example: Places &lt;A&gt; / b.');
  });
  it('says nothing needs action when there is nothing to do', () => {
    expect(renderActionsHtml([], 'fr')).toContain('Aucune action n’est nécessaire.');
    expect(renderActionsHtml([], 'fr')).not.toContain('<ol>');
  });
  it('passes the markup audit in both languages', () => {
    expect(structureProblems(html)).toEqual([]);
    expect(structureProblems(renderActionsHtml(buildActions(auditRegistry(RECORDS, NOW)), 'fr'))).toEqual([]);
  });
  it('escapes names from the records', () => {
    const evil = auditRegistry([record('d', [{ id: '"><script>x</script>' }], '<img src=x>')], NOW);
    const out = renderActionsHtml(buildActions(evil), 'en');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
  });
  it('has no French typography problems', () => {
    const fr = renderActionsHtml(buildActions(auditRegistry(RECORDS, NOW)), 'fr').replace(/<[^>]*>/g, ' ');
    expect(lintFrench(fr.replace(/Places &lt;A&gt;|\bb\b|\bc\b|Routes/g, ''))).toEqual([]);
  });
});

describe('actions over random registries', () => {
  it('account for every finding and render valid markup', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW);
      const items = buildActions(audit);
      expect(items.reduce((n, i) => n + i.count, 0), `seed ${seed}`).toBe(audit.findings.length);
      expect(new Set(items.map((i) => i.code)).size, `seed ${seed}`).toBe(items.length);
      for (const i of items) {
        expect(i.examples.length).toBeLessThanOrEqual(MAX_EXAMPLES);
        expect(i.examples.length + i.more).toBeLessThanOrEqual(i.count);
        expect(i.examples.length).toBeGreaterThan(0);
      }
      for (const locale of ['en', 'fr'] as const) expect(structureProblems(renderActionsHtml(items, locale)), `seed ${seed}`).toEqual([]);
    }
  });
});
