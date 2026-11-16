import { describe, expect, it } from 'vitest';
import {
  auditLocale,
  commaThousands,
  dateOrder,
  decimalCommas,
  decimalPoints,
  dotThousands,
  enMonthInFrench,
  frMonthFirst,
  LOCALE_RULES,
  numericDates,
  symbolFirst,
  symbolLast,
  twelveHourTimes,
} from './locale.js';
import { EMPTY_PROSE, type ProseFacts } from './prose.js';
import { noFrIssues } from './expect-fr.js';

const facts = (texts: string[], pageLang = 'en'): ProseFacts => ({
  ...EMPTY_PROSE,
  pageLang,
  blocks: texts.map((text, i) => ({ id: `p[${i}]`, lang: '', own: false, text })),
});
const rules = (texts: string[], lang = 'en'): string[] => auditLocale(facts(texts, lang)).entries.map((e) => String(e.rule));
const NN = '\u202F';
const NB = '\u00A0';

describe('numericDates and dateOrder', () => {
  it('reads slash and dot dates with a four digit year', () => {
    expect(numericDates('On 12/31/2026 and 31.12.2026 and 3/4/2026.').map((d) => d.text)).toEqual(['12/31/2026', '31.12.2026', '3/4/2026']);
  });
  it('ignores a year-first date, a phone number and a version', () => {
    expect(numericDates('2026-11-16, 416/555/0100, v1.2.3, 12/2026')).toEqual([]);
  });
  it('ignores numbers that cannot be a date', () => {
    expect(numericDates('45/67/2026 and 13/14/2026 and 0/5/2026')).toEqual([]);
  });
  it('ignores a year that is out of range', () => {
    expect(numericDates('1/2/1800 and 1/2/9999')).toEqual([]);
  });
  it('does not take part of a longer run of numbers', () => {
    expect(numericDates('1/2/2026/5')).toEqual([]);
  });
  it('knows which order a date can only be', () => {
    const d = (text: string) => numericDates(text)[0];
    expect(dateOrder(d('31/12/2026')!)).toBe('day-first');
    expect(dateOrder(d('12/31/2026')!)).toBe('month-first');
    expect(dateOrder(d('03/04/2026')!)).toBe('either');
    expect(dateOrder(d('05/05/2026')!)).toBe('same');
  });
});

describe('twelveHourTimes', () => {
  it.each(['3:00 PM', '3 pm', '11:30 a.m.', '12:05am', '9:15 P.M.'])('finds %s', (t) => {
    expect(twelveHourTimes(`Open at ${t} daily`).map((m) => m.text)).toEqual([t]);
  });
  it.each(['15:00', '3 people', '13:00 pm', 'at 3 pmx', '3 Pamela'])('does not find %s', (t) => {
    expect(twelveHourTimes(`Open at ${t} daily`)).toEqual([]);
  });
});

describe('number and money patterns', () => {
  it('finds comma thousands, with or without decimals', () => {
    expect(commaThousands('Pay 1,234 or 12,345,678 or 1,234.50.').map((m) => m.text)).toEqual(['1,234', '12,345,678', '1,234.50']);
  });
  it('does not take a list of numbers for thousands', () => {
    expect(commaThousands('Pages 1,23 and 12,3456 and 1,2')).toEqual([]);
  });
  it('finds full stop thousands only with two groups or more', () => {
    expect(dotThousands('See 1.234.567 and 12.345 and 3.14.159.').map((m) => m.text)).toEqual(['1.234.567']);
  });
  it('finds decimal commas with two decimals, also after grouped digits', () => {
    expect(decimalCommas('Cost 12,50 and 1 234,50 and 1' + NN + '234,50 and 3,5 and a,12').map((m) => m.text)).toEqual(['12,50', '1 234,50', '1' + NN + '234,50']);
  });
  it('finds decimal points with two decimals and not versions or letters', () => {
    expect(decimalPoints('Cost 12.50 and 1,234.50 and v2.10 and 3.5').map((m) => m.text)).toEqual(['12.50']);
  });
  it('finds amounts with the symbol first or last', () => {
    expect(symbolFirst('Pay $50 or $1,234.50 or €20').map((m) => m.text)).toEqual(['$50', '$1,234.50', '€20']);
    expect(symbolLast('Pay 50' + NB + '$ or 20 € now').map((m) => m.text)).toEqual(['50' + NB + '$', '20 €']);
  });
});

describe('month names', () => {
  it('finds an English month before the day', () => {
    expect(enMonthInFrench('Le November 16, 2026 et le march 3rd').map((m) => m.text)).toEqual(['November 16, 2026', 'march 3rd']);
  });
  it('does not find a French date written day first', () => {
    expect(enMonthInFrench('Le 16 novembre 2026')).toEqual([]);
    expect(frMonthFirst('Le 16 novembre 2026')).toEqual([]);
  });
  it('finds a French month before the day, with accents in either form', () => {
    expect(frMonthFirst('Le novembre 16 et février 3 et fevrier 4 et août 1er').map((m) => m.text)).toEqual(['novembre 16', 'février 3', 'fevrier 4', 'août 1er']);
  });
  it('does not take a month name that is part of a longer word', () => {
    expect(enMonthInFrench('Les marches 12 et mayonnaise 3')).toEqual([]);
  });
});

describe('auditLocale in French', () => {
  it('has a rule for each kind of finding', () => {
    expect(LOCALE_RULES).toHaveLength(9);
  });
  it('flags a month-first date', () => {
    expect(rules(['La clinique ouvre le 12/31/2026 pour toutes les personnes inscrites.'], 'fr')).toEqual(['us-date-in-fr']);
  });
  it('accepts a date that is day first in French', () => {
    expect(rules(['La clinique ouvre le 31/12/2026 pour toutes les personnes inscrites.'], 'fr')).toEqual([]);
  });
  it('flags a date that can be read two ways, in either language', () => {
    expect(rules(['La clinique ouvre le 03/04/2026 pour toutes les personnes inscrites.'], 'fr')).toEqual(['ambiguous-date']);
    expect(rules(['The clinic opens on 03/04/2026 for everyone who has registered.'])).toEqual(['ambiguous-date']);
  });
  it('does not flag a date with the same day and month', () => {
    expect(rules(['La clinique ouvre le 05/05/2026 pour toutes les personnes inscrites.'], 'fr')).toEqual([]);
  });
  it('flags am and pm times once per block', () => {
    expect(rules(['La clinique ouvre à 9 am et ferme à 5 pm pour toutes les personnes.'], 'fr')).toEqual(['twelve-hour-in-fr']);
  });
  it('flags comma thousands, and a decimal point when there are none', () => {
    expect(rules(['Le montant est de 1,234 pour toutes les personnes inscrites ici.'], 'fr')).toEqual(['fr-number-format']);
    expect(rules(['Le montant est de 12.50 pour toutes les personnes inscrites ici.'], 'fr')).toEqual(['fr-number-format']);
  });
  it('says one thing about numbers when a block has both problems', () => {
    expect(rules(['Le montant est de 1,234 et de 12.50 pour toutes les personnes ici.'], 'fr')).toEqual(['fr-number-format']);
  });
  it('flags a currency symbol before the amount and accepts one after', () => {
    expect(rules(['Le montant est de $50 pour toutes les personnes inscrites ici.'], 'fr')).toEqual(['fr-currency-position']);
    expect(rules(['Le montant est de 50' + NB + '$ pour toutes les personnes inscrites ici.'], 'fr')).toEqual([]);
  });
  it('flags a month written before the day, English or French', () => {
    expect(rules(['La clinique ouvre le November 16 pour toutes les personnes inscrites.'], 'fr')).toEqual(['month-name-order']);
    expect(rules(['La clinique ouvre le novembre 16 pour toutes les personnes inscrites.'], 'fr')).toEqual(['month-name-order']);
  });
  it('accepts French typography for all of it', () => {
    expect(rules(['La clinique ouvre à 15' + NN + 'h' + NN + '00 le 16 novembre 2026 pour 1' + NN + '234,50' + NB + '$ de frais.'], 'fr')).toEqual([]);
  });
});

describe('auditLocale in English', () => {
  it('flags a decimal comma and full stop thousands', () => {
    expect(rules(['The fee is 12,50 for everyone who has registered at the clinic.'])).toEqual(['en-number-format']);
    expect(rules(['The fee is 1.234.567 for everyone who has registered at the clinic.'])).toEqual(['en-number-format']);
  });
  it('accepts comma thousands, a decimal point, am and pm, and a dollar sign first', () => {
    expect(rules(['The fee is $1,234.50 and the clinic opens at 9 am for everyone who has registered.'])).toEqual([]);
  });
  it('flags a currency symbol after the number', () => {
    expect(rules(['The fee is 50 $ for everyone who has registered at the clinic.'])).toEqual(['en-currency-position']);
  });
  it('flags a date that is day first only, and accepts one that is month first', () => {
    expect(rules(['The clinic opens on 31/12/2026 for everyone who has registered.'])).toEqual(['day-first-in-en']);
    expect(rules(['The clinic opens on 12/31/2026 for everyone who has registered.'])).toEqual([]);
  });
  it('does not apply French rules to English text', () => {
    expect(rules(['The clinic opens on 16 November at 9 am for everyone who has registered.'])).toEqual([]);
  });
});

describe('auditLocale: scope and shape', () => {
  it('uses the language of the block when it has one, and skips other languages', () => {
    const f: ProseFacts = {
      ...EMPTY_PROSE,
      pageLang: 'en',
      blocks: [
        { id: 'p[0]', lang: 'fr-CA', own: true, text: 'La clinique ouvre à 9 am pour toutes les personnes inscrites ici.' },
        { id: 'p[1]', lang: 'de', own: true, text: 'Die Klinik öffnet um 9 am für alle angemeldeten Personen hier.' },
      ],
    };
    const r = auditLocale(f);
    expect(r.checked).toBe(1);
    expect(r.entries.map((e) => e.id)).toEqual(['p[0]']);
  });
  it('skips a block that is too short', () => {
    const r = auditLocale(facts(['Ouvre à 9 am.'], 'fr'));
    expect(r.checked).toBe(0);
  });
  it('reports each rule once per block but again for another block', () => {
    const r = auditLocale(facts(['La date du 12/31/2026 et celle du 11/30/2026 sont proches.', 'La date du 10/25/2026 est proche de nous.'], 'fr'));
    expect(r.entries.map((e) => `${e.id}:${e.rule}`)).toEqual(['p[0]:us-date-in-fr', 'p[1]:us-date-in-fr']);
  });
  it('gives every entry the locale check, an unknown status, and clean French', () => {
    const fr = auditLocale(
      facts(
        [
          'Ouvert le 12/31/2026, le 03/04/2026 et à 9 am avec 1,234 de frais, 12.50 de plus et $50 de dépôt le November 16 ici.',
          'Le novembre 16 est proche de nous ce jour.',
        ],
        'fr',
      ),
    );
    const en = auditLocale(facts(['Opened 31/12/2026 with 12,50 and 50 $ fees for everyone who is here.']));
    const all = [...fr.entries, ...en.entries];
    expect(new Set(all.map((e) => e.rule))).toEqual(new Set(['us-date-in-fr', 'ambiguous-date', 'twelve-hour-in-fr', 'fr-number-format', 'fr-currency-position', 'month-name-order', 'day-first-in-en', 'en-number-format', 'en-currency-position']));
    for (const e of all) {
      expect(e.check).toBe('locale');
      expect(e.status).toBe('unknown');
    }
    noFrIssues(all);
  });
  it('names the text it found in both languages', () => {
    const e = auditLocale(facts(['La clinique ouvre le 12/31/2026 pour toutes les personnes inscrites.'], 'fr')).entries[0];
    expect(e?.message.en).toContain('12/31/2026');
    expect(e?.message.fr).toContain('12/31/2026');
  });
});
