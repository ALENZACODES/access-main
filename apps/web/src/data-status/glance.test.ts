import { describe, expect, it } from 'vitest';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { glanceSentences, renderGlanceHtml } from './glance';
import { lintFrench } from './i18n';
import { isoDayOffset, randomRegistry } from './round7Kit';
import { NOW, RECORDS, structureProblems } from './testkit';

const good = { name: 'Good', source: 'P', licence: 'OGL-Ontario', retrievedAt: isoDayOffset(NOW, -2) };
const ds = (id: string, n: number): DatasetRecord => ({ id, name: id, kind: 'places', sources: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, ...good })) });

describe('glanceSentences', () => {
  it('says nothing is saved for an empty registry', () => {
    expect(glanceSentences(auditRegistry([], NOW), 'en')).toEqual(['No sources are saved on this device.']);
    expect(glanceSentences(auditRegistry([], NOW), 'fr')).toEqual(['Aucune source n’est enregistrée sur cet appareil.']);
  });
  it('gives the scope, then what needs review', () => {
    expect(glanceSentences(auditRegistry(RECORDS, NOW), 'en')).toEqual([
      '3 sources saved on this device, in 2 datasets.',
      'To review: 1 possibly out of date, 1 with an unknown update date, 1 licence to review and 3 missing details.',
    ]);
  });
  it('says nothing needs review when everything is complete', () => {
    expect(glanceSentences(auditRegistry([ds('a', 2)], NOW), 'en')).toEqual(['2 sources saved on this device, in 1 dataset.', 'Nothing needs review.']);
  });
  it('uses the singular for one source in one dataset', () => {
    expect(glanceSentences(auditRegistry([ds('a', 1)], NOW), 'en')[0]).toBe('1 source saved on this device, in 1 dataset.');
    expect(glanceSentences(auditRegistry([ds('a', 1)], NOW), 'fr')[0]).toBe('1 source enregistrées sur cet appareil, dans 1 jeu de données.');
  });
  it('joins the French list with “et”', () => {
    const fr = glanceSentences(auditRegistry(RECORDS, NOW), 'fr');
    expect(fr[1]).toBe('À examiner : 1 possiblement périmée, 1 à date de mise à jour inconnue, 1 licence à examiner et 3 informations manquantes.');
  });
  it('counts a dataset with no sources', () => {
    const s = glanceSentences(auditRegistry([{ id: 'e', name: 'E', kind: 'places', sources: [] }], NOW), 'en');
    expect(s[0]).toBe('0 sources saved on this device, in 1 dataset.');
  });
  it('mentions duplicates', () => {
    const s = glanceSentences(auditRegistry([ds('x', 1), ds('x', 1)], NOW), 'en');
    expect(s[1]).toContain('duplicate id');
  });
  it('has no French typography problems in any random registry', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const s of glanceSentences(auditRegistry(randomRegistry(seed, NOW), NOW), 'fr')) expect(lintFrench(s), `seed ${seed}: ${s}`).toEqual([]);
    }
  });
});

describe('renderGlanceHtml', () => {
  it('is a labelled section with one paragraph per sentence', () => {
    const html = renderGlanceHtml(auditRegistry(RECORDS, NOW), 'en');
    expect(html).toContain('<h2 id="ds-glance-title">At a glance</h2>');
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(structureProblems(html)).toEqual([]);
  });
  it('is in French with the French heading', () => {
    expect(renderGlanceHtml(auditRegistry(RECORDS, NOW), 'fr')).toContain('<h2 id="ds-glance-title">En bref</h2>');
  });
  it('agrees with the totals in every random registry', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const audit = auditRegistry(randomRegistry(seed, NOW), NOW);
      const first = glanceSentences(audit, 'en')[0] ?? '';
      expect(first, `seed ${seed}`).toContain(`${audit.totals.sources} source`);
      if (audit.totals.stale > 0) expect(glanceSentences(audit, 'en')[1]).toContain(`${audit.totals.stale} possibly out of date`);
      expect(structureProblems(renderGlanceHtml(audit, 'en')), `seed ${seed}`).toEqual([]);
    }
  });
});
