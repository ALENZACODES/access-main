import { describe, expect, it } from 'vitest';
import { MAX_QUERY_LENGTH, applyFilters, auditRegistry, foldText, matchesQuery, NO_FILTERS, normaliseQuery, queryWords } from './index';
import { NOW, RECORDS } from './testkit';

describe('foldText', () => {
  it('removes accents, folds case, ligatures and curly apostrophes', () => {
    expect(foldText('Élévation  Œuvre')).toBe('elevation oeuvre');
    expect(foldText('Straße Æther')).toBe('strasse aether');
    expect(foldText('l’Ontario ʼ`')).toBe("l'ontario ''");
    expect(foldText('  A\t\nB ')).toBe('a b');
  });
  it('does not touch digits or punctuation', () => {
    expect(foldText('CC-BY-4.0')).toBe('cc-by-4.0');
  });
});

describe('queryWords / matchesQuery', () => {
  it('splits into folded words', () => {
    expect(queryWords('  Rue  KING ')).toEqual(['rue', 'king']);
    expect(queryWords('   ')).toEqual([]);
  });
  it('needs every word, in any order, ignoring accents', () => {
    expect(matchesQuery('King Street Rue du Roi', 'rue king')).toBe(true);
    expect(matchesQuery('Élévation des rues', 'elevation rue')).toBe(true);
    expect(matchesQuery('King Street', 'king queen')).toBe(false);
    expect(matchesQuery("Parc de l’Ontario", "l'ontario")).toBe(true);
  });
  it('an empty query matches everything', () => {
    expect(matchesQuery('anything', '')).toBe(true);
  });
});

describe('search in the filters', () => {
  const audit = auditRegistry(RECORDS, NOW);
  it('finds sources by words in different fields', () => {
    expect(applyFilters(audit.sources, { ...NO_FILTERS, query: 'alpha places' }).map((s) => s.sourceId)).toEqual(['a']);
    expect(applyFilters(audit.sources, { ...NO_FILTERS, query: 'PLACES <A>' }).map((s) => s.sourceId)).toEqual(['a', 'b']);
  });
  it('a word that is nowhere gives no rows', () => {
    expect(applyFilters(audit.sources, { ...NO_FILTERS, query: 'alpha routes' })).toEqual([]);
  });
  it('normaliseQuery keeps its length limit and folding', () => {
    expect(normaliseQuery('ÉLÉVATION')).toBe('elevation');
    expect(normaliseQuery('x'.repeat(MAX_QUERY_LENGTH + 20))).toHaveLength(MAX_QUERY_LENGTH);
  });
});
