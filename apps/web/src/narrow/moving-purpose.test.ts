import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditPurpose, parseToken, PURPOSE_RULES, purposeOf, TOKENS } from './purpose.js';
import { auditTiming, TIMING_RULES } from './timing.js';
import type { FieldFact } from './semantics.js';
import type { TimingFacts } from './structure.js';
import type { Entry } from './types.js';

const rules = (es: readonly Entry[]): string[] => es.map((e) => `${e.rule}:${e.status}`);
const none: TimingFacts = { marquee: [], blink: [], carousels: [], expiry: [] };

describe('auditTiming', () => {
  it('passes a page with nothing that moves and counts nothing', () => {
    expect(auditTiming(none)).toEqual({ checked: 0, entries: [] });
  });
  it('fails marquee and blinking text, with the id of each', () => {
    const r = auditTiming({ ...none, marquee: ['marquee[0]'], blink: ['span[3]'] });
    expect(rules(r.entries)).toEqual(['marquee:fail', 'text-blink:fail']);
    expect(r.entries.map((e) => e.id)).toEqual(['marquee[0]', 'span[3]']);
    noFrIssues(r.entries);
  });
  it('asks about a carousel with no pause control and passes one that has it', () => {
    const r = auditTiming({ ...none, carousels: [{ id: 'div[0]', pause: false }, { id: 'div[1]', pause: true }] });
    expect(r.checked).toBe(2);
    expect(rules(r.entries)).toEqual(['carousel-no-pause:unknown']);
    expect(r.entries[0]?.id).toBe('div[0]');
    noFrIssues(r.entries);
  });
  it('asks about text that speaks of a time limit, and never fails it', () => {
    const r = auditTiming({ ...none, expiry: ['p[2]'] });
    expect(rules(r.entries)).toEqual(['session-expiry:unknown']);
    noFrIssues(r.entries);
  });
  it('counts every item it looked at', () => {
    expect(auditTiming({ marquee: ['a'], blink: ['b'], carousels: [{ id: 'c', pause: true }], expiry: ['d'] }).checked).toBe(4);
  });
  it('does not report a timed refresh, which the markup check owns', () => {
    expect(TIMING_RULES).not.toContain('meta-refresh');
  });
  it('produces every listed rule and nothing else', () => {
    const r = auditTiming({ marquee: ['m'], blink: ['b'], carousels: [{ id: 'c', pause: false }], expiry: ['e'] });
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of TIMING_RULES) expect(seen.has(rule), rule).toBe(true);
    for (const e of r.entries) expect(TIMING_RULES).toContain(e.rule);
  });
});

const field = (over: Partial<FieldFact> = {}): FieldFact => ({
  id: 'input[0]',
  kind: 'input',
  type: 'text',
  name: '',
  label: '',
  placeholder: '',
  required: false,
  autocomplete: '',
  inputmode: '',
  described: false,
  hintUnlinked: false,
  invalid: false,
  error: null,
  ...over,
});

describe('parseToken', () => {
  it('accepts every token on the list', () => {
    for (const tok of TOKENS) expect(parseToken(tok), tok).not.toBeNull();
  });
  it('accepts section, shipping, billing and webauthn parts', () => {
    expect(parseToken('section-blue shipping street-address')).toEqual({ token: 'street-address' });
    expect(parseToken('billing postal-code')).toEqual({ token: 'postal-code' });
    expect(parseToken('username webauthn')).toEqual({ token: 'username' });
    expect(parseToken('  EMAIL ')).toEqual({ token: 'email' });
  });
  it('accepts a contact prefix only before a contact token', () => {
    expect(parseToken('work tel')).toEqual({ token: 'tel' });
    expect(parseToken('mobile email')).toEqual({ token: 'email' });
    expect(parseToken('home name')).toBeNull();
    expect(parseToken('work')).toBeNull();
  });
  it('reads off and on, and refuses anything else', () => {
    expect(parseToken('off')).toEqual({ off: true });
    expect(parseToken('on')).toEqual({ token: 'on' });
    expect(parseToken('')).toBeNull();
    expect(parseToken('town')).toBeNull();
    expect(parseToken('given-name family-name')).toBeNull();
    expect(parseToken('section-a')).toBeNull();
  });
});

describe('purposeOf', () => {
  const cases: Array<[string, string | null]> = [
    ['Email address', 'email'],
    ['Courriel', 'email'],
    ['Phone number', 'tel'],
    ['Numéro de téléphone', 'tel'],
    ['Postal code', 'postal'],
    ['Code postal', 'postal'],
    ['First name', 'given'],
    ['Prénom', 'given'],
    ['Last name', 'family'],
    ['Nom de famille', 'family'],
    ['Name', 'name'],
    ['Your name', 'name'],
    ['Nom complet', 'name'],
    ['Name *', 'name'],
    ['Place name', null],
    ['Nom du lieu', null],
    ['Street address', 'street'],
    ['City', 'city'],
    ['Ville', 'city'],
    ['Province', 'region'],
    ['Country', 'country'],
    ['Date of birth', 'bday'],
    ['User name', 'username'],
    ['Card number', 'card'],
    ['Search', null],
    ['Comments', null],
  ];
  for (const [label, group] of cases) {
    it(`${label} is ${group ?? 'not a personal field'}`, () => {
      expect(purposeOf({ label, name: '' })?.group ?? null).toBe(group);
    });
  }
  it('falls back to the field name only when there is no label', () => {
    expect(purposeOf({ label: '', name: 'email' })?.group).toBe('email');
    expect(purposeOf({ label: 'Search', name: 'email' })).toBeNull();
  });
});

describe('auditPurpose', () => {
  it('passes a field with the right token and counts it', () => {
    expect(auditPurpose([field({ label: 'Email', autocomplete: 'email' })])).toEqual({ checked: 1, entries: [] });
  });
  it('does not report a missing or an invalid token, which the markup check owns', () => {
    expect(auditPurpose([field({ label: 'Phone number' }), field({ id: 'input[1]', label: 'City', autocomplete: 'town' })]).entries).toEqual([]);
  });
  it('fails a token that contradicts the label', () => {
    const r = auditPurpose([field({ label: 'Email', autocomplete: 'tel' })]);
    expect(rules(r.entries)).toEqual(['purpose-mismatch:fail']);
    expect(r.entries[0]?.message.en).toContain('“tel”');
    noFrIssues(r.entries);
  });
  it('accepts the tokens that fit a label, including the username on an e-mail field', () => {
    expect(auditPurpose([field({ label: 'Email', autocomplete: 'username' })]).entries).toEqual([]);
    expect(auditPurpose([field({ label: 'Phone', autocomplete: 'mobile tel-national' })]).entries).toEqual([]);
    expect(auditPurpose([field({ label: 'Phone', autocomplete: 'work tel' })]).entries).toEqual([]);
    expect(auditPurpose([field({ label: 'First name', autocomplete: 'section-a given-name' })]).entries).toEqual([]);
  });
  it('asks about autocomplete off on a personal field, and ignores it elsewhere', () => {
    expect(rules(auditPurpose([field({ label: 'Phone', autocomplete: 'off' })]).entries)).toEqual(['autocomplete-off:unknown']);
    expect(auditPurpose([field({ label: 'Search', autocomplete: 'off' })]).entries).toEqual([]);
    expect(auditPurpose([field({ type: 'password', label: 'Password', autocomplete: 'off' })]).entries).toEqual([]);
  });
  it('accepts on', () => {
    expect(auditPurpose([field({ label: 'Email', autocomplete: 'on' })]).entries).toEqual([]);
  });
  it('does not judge number or range fields', () => {
    expect(auditPurpose([field({ type: 'number', label: 'Postal code', autocomplete: 'tel' })]).entries).toEqual([]);
  });
  it('judges a date field that asks for a birth date', () => {
    expect(auditPurpose([field({ type: 'date', label: 'Date of birth', autocomplete: 'bday' })]).entries).toEqual([]);
    expect(rules(auditPurpose([field({ type: 'date', label: 'Date of birth', autocomplete: 'email' })]).entries)).toEqual(['purpose-mismatch:fail']);
  });
  it('writes French that follows the typography rules, with a French label', () => {
    const r = auditPurpose([field({ label: 'Prénom', autocomplete: 'family-name' }), field({ id: 'input[1]', label: 'Courriel', autocomplete: 'off' })]);
    expect(rules(r.entries)).toEqual(['purpose-mismatch:fail', 'autocomplete-off:unknown']);
    noFrIssues(r.entries);
  });
  it('produces every listed rule', () => {
    const r = auditPurpose([field({ label: 'Email', autocomplete: 'tel' }), field({ id: 'input[3]', label: 'Phone', autocomplete: 'off' })]);
    const seen = new Set(r.entries.map((e) => e.rule));
    for (const rule of PURPOSE_RULES) expect(seen.has(rule), rule).toBe(true);
  });
});
