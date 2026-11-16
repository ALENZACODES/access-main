import { describe, expect, it } from 'vitest';
import { LICENCES, OPEN_LICENCES, lintFrench, licenceInfo, licenceKey, licenceName, normaliseLicence, scanCopy } from './index';

describe('licence table', () => {
  it('covers exactly the open licences the audit accepts (drift fails here)', () => {
    expect([...LICENCES.map((l) => l.id)].sort()).toEqual([...OPEN_LICENCES].sort());
  });

  it('has https reference links and EN + FR names that pass the copy and FR lints', () => {
    for (const l of LICENCES) {
      expect(l.url.startsWith('https://')).toBe(true);
      expect(l.name.en.trim()).not.toBe('');
      expect(l.name.fr.trim()).not.toBe('');
      expect(lintFrench(l.name.fr)).toEqual([]);
      expect(scanCopy(`${l.name.en} ${l.name.fr}`)).toEqual([]);
    }
  });

  it('marks public-domain dedications as no-credit and share-alike licences as such', () => {
    expect(licenceInfo('CC0-1.0')).toMatchObject({ attribution: false, shareAlike: false });
    expect(licenceInfo('PDDL-1.0')).toMatchObject({ attribution: false });
    expect(licenceInfo('CC-BY-SA-4.0')).toMatchObject({ attribution: true, shareAlike: true });
    expect(licenceInfo('ODbL-1.0')).toMatchObject({ attribution: true, shareAlike: true });
    expect(licenceInfo('CC-BY-4.0')).toMatchObject({ attribution: true, shareAlike: false });
  });
});

describe('licenceKey', () => {
  it('ignores case, accents and punctuation', () => {
    expect(licenceKey('Licence du gouvernement ouvert – Canada 2.0')).toBe('licence du gouvernement ouvert canada 2.0');
    expect(licenceKey('CC-BY_4.0')).toBe('cc by 4.0');
  });
});

describe('normaliseLicence', () => {
  it.each([
    ['CC BY 4.0', 'CC-BY-4.0', true],
    ['cc-by-4.0', 'CC-BY-4.0', true],
    ['CC-BY-4.0', 'CC-BY-4.0', false],
    ['  OGL-Ontario  ', 'OGL-Ontario', false],
    ['Open Government Licence – Ontario', 'OGL-Ontario', true],
    ['Licence du gouvernement ouvert – Canada 2.0', 'OGL-Canada-2.0', true],
    ['Open Government Licence - Canada', 'OGL-Canada-2.0', true],
    ['ODbL', 'ODbL-1.0', true],
    ['Open Database License', 'ODbL-1.0', true],
    ['CC0', 'CC0-1.0', true],
    ['Creative Commons Attribution-ShareAlike 4.0 International', 'CC-BY-SA-4.0', true],
    ['PDDL', 'PDDL-1.0', true],
  ])('%s -> %s', (raw, id, changed) => {
    const m = normaliseLicence(raw);
    expect(m.id).toBe(id);
    expect(m.changed).toBe(changed);
  });

  it.each(['CC BY', 'CC BY 3.0', 'CC BY-NC 4.0', 'CC BY-ND 4.0', 'MIT', 'All rights reserved', 'Creative Commons', 'OGL', '', '   ', null, undefined])(
    'does not guess: %s stays unrecognised',
    (raw) => {
      expect(normaliseLicence(raw)).toEqual({ id: null, changed: false });
    },
  );

  it('every canonical id and name maps back to itself', () => {
    for (const l of LICENCES) {
      expect(normaliseLicence(l.id).id).toBe(l.id);
      expect(normaliseLicence(l.name.en).id).toBe(l.id);
      expect(normaliseLicence(l.name.fr).id).toBe(l.id);
    }
  });
});

describe('licenceInfo / licenceName', () => {
  it('looks up by id and locale', () => {
    expect(licenceInfo(null)).toBeNull();
    expect(licenceInfo('nope')).toBeNull();
    expect(licenceName('OGL-Ontario', 'fr')).toBe('Licence du gouvernement ouvert – Ontario');
    expect(licenceName('x', 'en')).toBeNull();
  });
});
