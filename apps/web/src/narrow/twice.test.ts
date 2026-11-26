import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import type { TwiceFacts, TwiceField } from './twice-inpage.js';
import { CONFIRM_WORDS, TWICE_KINDS, buildTwice, confirms, twiceAdvice, twiceFindingText, twiceNote, twiceSummary } from './twice.js';
import { NBSP, NNBSP } from './types.js';

const f = (label: string, extra: Partial<TwiceField> = {}): TwiceField => ({ id: `input[${label}]`, label, type: 'text', token: '', form: 0, group: '', ...extra });
const facts = (fields: TwiceField[], sameAs: string[] = []): TwiceFacts => ({ fields, sameAs, truncated: false });

describe('CONFIRM_WORDS and confirms', () => {
  it('knows the words that ask again, in both languages', () => {
    for (const w of ['Confirm email', 'Re-enter your email', 'Reenter phone', 'Email again', 'Repeat password', 'Retype it', 'Confirmer le courriel', 'Ressaisissez le courriel', 'Répétez le mot de passe', 'Courriel à nouveau']) {
      expect(CONFIRM_WORDS.test(w), w).toBe(true);
    }
    for (const w of ['Email', 'Configuration', 'Repeatable', 'Phone']) expect(CONFIRM_WORDS.test(w), w).toBe(false);
  });

  it('pairs a field with a later one that asks for it again, by type, token or label', () => {
    expect(confirms(f('Email', { type: 'email' }), f('Confirm email', { type: 'email' }))).toBe(true);
    expect(confirms(f('Home', { token: 'tel' }), f('Repeat it', { token: 'tel' }))).toBe(true);
    expect(confirms(f('Health card number'), f('Re-enter health card number'))).toBe(true);
  });

  it('does not pair across forms, without a word that asks again, or with unrelated labels', () => {
    expect(confirms(f('Email', { type: 'email' }), f('Confirm email', { type: 'email', form: 1 }))).toBe(false);
    expect(confirms(f('Email', { type: 'email' }), f('Work email', { type: 'email' }))).toBe(false);
    expect(confirms(f('Name'), f('Confirm city'))).toBe(false);
    expect(confirms(f('Confirm email', { type: 'email' }), f('Confirm email', { type: 'email' }))).toBe(false);
  });
});

describe('buildTwice', () => {
  it('finds a field to confirm, and says a password confirmed apart', () => {
    const m = buildTwice(facts([f('Email', { type: 'email' }), f('Confirm email', { type: 'email' }), f('Password', { type: 'password' }), f('Repeat password', { type: 'password' })]));
    expect(m.findings.map((x) => [x.kind, x.first?.label, x.second?.label])).toEqual([
      ['confirm', 'Email', 'Confirm email'],
      ['confirm-password', 'Password', 'Repeat password'],
    ]);
    expect([m.twice, m.fields, m.forms]).toEqual([1, 4, 1]);
  });

  it('finds the same autocomplete token twice in a form, not across forms', () => {
    const m = buildTwice(facts([f('Phone', { token: 'tel' }), f('Mobile', { token: 'tel' }), f('Phone', { token: 'tel', form: 1 })]));
    expect(m.findings.map((x) => [x.kind, x.first?.label, x.second?.label])).toEqual([['same-token', 'Phone', 'Mobile']]);
  });

  it('finds two addresses with no box to reuse one, and not when there is one', () => {
    const fields = [f('Street', { token: 'shipping street-address' }), f('Postal code', { token: 'shipping postal-code' }), f('Street', { token: 'billing street-address' }), f('Postal code', { token: 'billing postal-code' })];
    expect(buildTwice(facts(fields)).findings.map((x) => x.kind)).toEqual(['two-addresses']);
    expect(buildTwice(facts(fields, ['Same as shipping address'])).findings).toEqual([]);
  });

  it('finds the same label and type twice in a group, but not in two groups', () => {
    expect(buildTwice(facts([f('Name'), f('Name')])).findings.map((x) => x.kind)).toEqual(['same-label']);
    expect(buildTwice(facts([f('Name', { group: 'Traveller 1' }), f('Name', { group: 'Traveller 2' })])).findings).toEqual([]);
    expect(buildTwice(facts([f('Date', { type: 'date' }), f('Date')])).findings).toEqual([]);
    expect(buildTwice(facts([f('Phone', { token: 'home tel' }), f('Phone', { token: 'work tel' })])).findings).toEqual([]);
  });

  it('counts each field in one finding only, and sorts by kind', () => {
    const m = buildTwice(facts([f('Name'), f('Email', { type: 'email', token: 'email' }), f('Name'), f('Confirm email', { type: 'email', token: 'email' })]));
    expect(m.findings.map((x) => x.kind)).toEqual(['confirm', 'same-label']);
    expect(TWICE_KINDS[0]).toBe('confirm');
  });

  it('has nothing for no field, and keeps a cut reading', () => {
    const m = buildTwice({ fields: [], sameAs: [], truncated: true });
    expect([m.findings.length, m.fields, m.twice, m.truncated]).toEqual([0, 0, 0, true]);
  });
});

describe('the words', () => {
  const m = buildTwice(
    facts([
      f('Email', { type: 'email' }),
      f('Confirm email', { type: 'email' }),
      f('Phone', { token: 'tel' }),
      f('Cell', { token: 'tel' }),
      f('Street', { token: 'shipping street-address' }),
      f('Rue', { token: 'billing street-address' }),
      f('Name'),
      f('Name'),
      f('Password', { type: 'password' }),
      f('Retype password', { type: 'password' }),
    ]),
  );

  it('says each finding in both languages', () => {
    expect(m.findings.map((x) => twiceFindingText(x, 'en'))).toEqual([
      '“Confirm email” asks for “Email” again. The same answer has to be typed twice.',
      '“Phone” and “Cell” ask for the same thing (autocomplete “tel”).',
      'A shipping and a billing address are asked for, with no box to reuse the first.',
      '“Name” is asked for twice, in the same place. It may be the same thing, or two different ones.',
      '“Retype password” asks for the password “Password” again. The rules allow this for security, but it is one more thing to type.',
    ]);
    expect(twiceFindingText(m.findings[0]!, 'fr')).toBe(`«${NNBSP}Confirm email${NNBSP}» redemande «${NNBSP}Email${NNBSP}». La même réponse est à taper deux fois.`);
  });

  it('sums up the page, and says what stays UNKNOWN', () => {
    expect(twiceSummary(m, 'en')).toEqual(['10 fields to fill in. Asked for twice: 4.', 'Only this page is read. Something asked on an earlier step and asked again here is UNKNOWN.']);
    expect(twiceSummary(buildTwice(facts([f('A')], ['Same as above'])), 'fr')[1]).toBe(`Cases qui peuvent reprendre une réponse${NBSP}: «${NNBSP}Same as above${NNBSP}».`);
    expect(twiceSummary(buildTwice(facts([])), 'en')).toEqual(['No field to fill in was found on this page, so nothing is asked for twice.']);
    expect(twiceSummary(buildTwice({ fields: [f('A')], sameAs: [], truncated: true }), 'en')[0]).toBe('1 field to fill in (the reading stopped before the end). Asked for twice: 0.');
  });

  it('gives a hint for each kind found', () => {
    expect(twiceAdvice(m, 'en')).toEqual([
      'Ask for each answer once, then show it so it can be read back and corrected.',
      'Fill in a field already answered, or let it be picked from the answers given.',
      'Add a “Same as shipping address” box, checked by default.',
      'For a password, a button to show it can replace typing it twice.',
    ]);
    expect(twiceAdvice(buildTwice(facts([f('A')])), 'en')).toEqual([]);
  });

  it('gives a line for the barrier text only when something is asked twice', () => {
    expect(twiceNote(m, 'en')).toBe('Asked twice: this page asks for 4 things twice. I need to answer once.');
    expect(twiceNote(m, 'fr')).toBe(`Demandé deux fois${NBSP}: cette page demande 4${NBSP}choses deux fois. J’ai besoin de répondre une seule fois.`);
    expect(twiceNote(buildTwice(facts([f('Password', { type: 'password' }), f('Repeat password', { type: 'password' })])), 'en')).toBe('');
    expect(twiceNote(null, 'en')).toBe('');
  });

  it('follows French typography and makes no claim', () => {
    const lines = [...m.findings.map((x) => twiceFindingText(x, 'fr')), ...twiceSummary(m, 'fr'), ...twiceAdvice(m, 'fr'), twiceNote(m, 'fr'), ...twiceSummary(buildTwice(facts([])), 'fr')];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line).not.toMatch(/\p{L}'\p{L}|\$\{/u);
      expect(line.toLowerCase()).not.toMatch(/vérif|garanti|diagnos|conforme|admissib/);
    }
  });
});
