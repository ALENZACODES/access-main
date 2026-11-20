import { describe, expect, it } from 'vitest';
import { filterParts } from './announce';
import { NO_FILTERS } from './filters';
import { hasUnknownToken, lowerKeepingToken, UNKNOWN_WORD } from './unknownWord';

describe('the token', () => {
  it('is one word in capitals, the same in every language', () => {
    expect(UNKNOWN_WORD).toBe('UNKNOWN');
  });
});

describe('lowerKeepingToken', () => {
  it('lowers a label for use inside a sentence and leaves the token in capitals', () => {
    expect(lowerKeepingToken('Update date UNKNOWN')).toBe('update date UNKNOWN');
    expect(lowerKeepingToken('Date de mise à jour UNKNOWN')).toBe('date de mise à jour UNKNOWN');
    expect(lowerKeepingToken('UNKNOWN')).toBe('UNKNOWN');
    expect(lowerKeepingToken('UNKNOWN: Retrieved Date')).toBe('UNKNOWN: retrieved date');
    expect(lowerKeepingToken('Tier: UNKNOWN, Licence: UNKNOWN')).toBe('tier: UNKNOWN, licence: UNKNOWN');
  });
  it('lowers everything when the token is not there', () => {
    expect(lowerKeepingToken('May Be Out Of Date')).toBe('may be out of date');
    expect(lowerKeepingToken('')).toBe('');
    expect(lowerKeepingToken('Élément À Examiner')).toBe('élément à examiner');
  });
  it('treats the letters inside a longer word as part of that word', () => {
    expect(lowerKeepingToken('UNKNOWNS and UNKNOWNABLE')).toBe('unknowns and unknownable');
    expect(lowerKeepingToken('PRE-UNKNOWN')).toBe('pre-UNKNOWN');
    expect(lowerKeepingToken('XUNKNOWN')).toBe('xunknown');
    expect(lowerKeepingToken('UNKNOWN9')).toBe('unknown9');
  });
  it('does not turn a word in another case into the token', () => {
    expect(lowerKeepingToken('Unknown')).toBe('unknown');
    expect(lowerKeepingToken('unknown')).toBe('unknown');
  });
  it('gives the same answer when called again and again', () => {
    for (let i = 0; i < 3; i++) expect(lowerKeepingToken('A UNKNOWN B UNKNOWN')).toBe('a UNKNOWN b UNKNOWN');
    expect(lowerKeepingToken(lowerKeepingToken('Status UNKNOWN'))).toBe('status UNKNOWN');
  });
});

describe('hasUnknownToken', () => {
  it('finds the token as a whole word only, every time it is asked', () => {
    for (let i = 0; i < 3; i++) {
      expect(hasUnknownToken('Tier: UNKNOWN')).toBe(true);
      expect(hasUnknownToken('UNKNOWN')).toBe(true);
      expect(hasUnknownToken('(UNKNOWN)')).toBe(true);
    }
    for (const no of ['', 'unknown', 'Unknown', 'UNKNOWNS', 'XUNKNOWN', 'UNKNOWN2', 'UN KNOWN']) expect(hasUnknownToken(no), no).toBe(false);
  });
});

describe('what the panel says aloud', () => {
  it('keeps the token in capitals in the list of filters in force, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const parts = filterParts({ ...NO_FILTERS, state: 'unknown', tier: 'unknown', licence: 'unknown', age: 'unknown' }, locale);
      expect(parts).toHaveLength(4);
      for (const part of parts) {
        expect(hasUnknownToken(part), part).toBe(true);
        expect(part.replace(/UNKNOWN/g, ''), part).toBe(part.replace(/UNKNOWN/g, '').toLowerCase());
      }
    }
  });
});
