import { describe, expect, it } from 'vitest';
import { auditConstraints, CODE_NAME, CONSTRAINT_RULES, isSubmit } from './constraints.js';
import { noFrIssues } from './expect-fr.js';
import { parseHtml } from './htmllint.js';
import { SAMPLE_CONSTRAINTS_HTML } from './samples.js';

const found = (html: string): string[] => auditConstraints(html).entries.map((e) => `${e.rule}:${e.status}`);
const first = (html: string) => {
  const n = parseHtml(html).nodes[0];
  if (!n) throw new Error('no node');
  return n;
};

describe('CODE_NAME and isSubmit', () => {
  it.each(['phone', 'tel', 'user_phone', 'postal-code', 'zip', 'card-number', 'cvv', 'otp', 'pin', 'account-number', 'code_postal', 'nip'])('%s names a code', (name) => {
    expect(CODE_NAME.test(name)).toBe(true);
  });
  it.each(['quantity', 'age', 'floors', 'telescope', 'decode', 'pinch', 'zipper', 'accounts', 'price'])('%s does not', (name) => {
    expect(CODE_NAME.test(name)).toBe(false);
  });
  it('knows which controls send a form', () => {
    expect(isSubmit(first('<button>Send</button>'))).toBe(true);
    expect(isSubmit(first('<button type="SUBMIT">Send</button>'))).toBe(true);
    expect(isSubmit(first('<input type="submit" value="Send">'))).toBe(true);
    expect(isSubmit(first('<input type="image" alt="Send" src="s.png">'))).toBe(true);
    expect(isSubmit(first('<button type="button">Open</button>'))).toBe(false);
    expect(isSubmit(first('<button type="reset">Clear</button>'))).toBe(false);
    expect(isSubmit(first('<input type="text">'))).toBe(false);
    expect(isSubmit(first('<a href="/x">Send</a>'))).toBe(false);
  });
});

describe('patterns', () => {
  it('asks about a pattern with no title and no linked hint, and names the field', () => {
    const e = auditConstraints('<input name="plate" pattern="[A-Z]{4}">').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['pattern-unexplained', 'unknown', 'input@L1']]);
    expect(e[0]?.message.en).toContain('“plate”');
    expect(e[0]?.message.fr).toContain('«\u202Fplate\u202F»');
  });
  it('prefers the accessible name, then the name, then the id', () => {
    expect(auditConstraints('<input aria-label="Licence plate" name="p" id="i" pattern="x">').entries[0]?.message.en).toContain('“Licence plate”');
    expect(auditConstraints('<input id="plate-field" pattern="x">').entries[0]?.message.en).toContain('“plate-field”');
    expect(auditConstraints('<input pattern="x">').entries[0]?.message.en).toContain('“input”');
  });
  it('does not ask when a title or a hint explains it, or where a pattern does not apply', () => {
    expect(found('<input name="plate" pattern="[A-Z]{4}" title="Four capital letters">')).toEqual([]);
    expect(found('<input name="plate" pattern="[A-Z]{4}" aria-describedby="h"><p id="h">Four capital letters</p>')).toEqual([]);
    expect(found('<input type="number" name="qty" pattern="x"><input type="checkbox" name="c" pattern="x"><input name="p" pattern="">')).toEqual([]);
  });
});

describe('length limits', () => {
  it('asks about a silent maximum and warns that extra typing is dropped', () => {
    const e = auditConstraints('<textarea name="note" maxlength="200"></textarea>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['length-silent:unknown']);
    expect(e[0]?.message.en).toContain('accepts at most 200 characters');
    expect(e[0]?.message.en).toContain('dropped without a sound');
    expect(e[0]?.message.fr).toContain('accepte au plus 200 caractères');
  });
  it('words a minimum, and both together', () => {
    const min = auditConstraints('<input type="password" name="pw" minlength="12">').entries[0];
    expect(min?.message.en).toContain('accepts at least 12 characters');
    expect(min?.message.en).not.toContain('dropped');
    const both = auditConstraints('<input name="code" minlength="4" maxlength="8">').entries[0];
    expect(both?.message.en).toContain('at least 4 and at most 8 characters');
    expect(both?.message.fr).toContain('au moins 4 et au plus 8 caractères');
  });
  it('does not ask when a hint is linked, the value is not a number, or the field takes no typing', () => {
    expect(found('<input name="note" maxlength="20" aria-describedby="h"><p id="h">20 characters at most</p>')).toEqual([]);
    expect(found('<input name="note" maxlength="">')).toEqual([]);
    expect(found('<input name="note" maxlength="lots">')).toEqual([]);
    expect(found('<input type="checkbox" name="c" maxlength="2"><select name="s" maxlength="2"></select>')).toEqual([]);
  });
});

describe('number fields for codes', () => {
  it.each(['phone', 'postal_code', 'zip', 'card-number', 'otp'])('asks about a number field named %s', (name) => {
    expect(found(`<input type="number" name="${name}">`)).toEqual(['number-for-code:unknown']);
  });
  it('reads the id and the autocomplete token too', () => {
    expect(found('<input type="number" id="user-phone">')).toEqual(['number-for-code:unknown']);
    expect(found('<input type="number" name="x" autocomplete="postal-code">')).toEqual(['number-for-code:unknown']);
    expect(found('<input type="NUMBER" name="x" autocomplete="one-time-code">')).toEqual(['number-for-code:unknown']);
  });
  it('leaves real quantities and text fields alone', () => {
    expect(found('<input type="number" name="quantity"><input type="number" name="age"><input type="tel" name="phone"><input type="text" inputmode="numeric" name="postal">')).toEqual([]);
  });
});

describe('select, reset and option groups', () => {
  it('asks about a list that takes several options', () => {
    const e = auditConstraints('<select name="days" multiple><option>Mon</option></select>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['multiple-select:unknown']);
    expect(e[0]?.message.en).toContain('“days”');
    expect(found('<select name="day"><option>Mon</option></select>')).toEqual([]);
  });
  it('asks about a reset button, as a button or an input', () => {
    expect(found('<button type="reset">Clear</button>')).toEqual(['reset-button:unknown']);
    expect(found('<input type="RESET" value="Clear">')).toEqual(['reset-button:unknown']);
    expect(found('<button type="button">Clear search</button>')).toEqual([]);
  });
  it('fails an option group with no label', () => {
    const e = auditConstraints('<select name="town"><optgroup><option>Ottawa</option></optgroup>\n<optgroup label=""><option>Sudbury</option></optgroup>\n<optgroup label="North"><option>Timmins</option></optgroup></select>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['group-no-label', 'fail', 'optgroup@L1'], ['group-no-label', 'fail', 'optgroup@L2']]);
  });
});

describe('forms with no button to send them', () => {
  it('asks and counts the fields, with singular and plural', () => {
    const one = auditConstraints('<form><select name="lang"><option>English</option></select></form>').entries;
    expect(one.map((x) => [x.rule, x.status, x.id])).toEqual([['no-submit', 'unknown', 'form@L1']]);
    expect(one[0]?.message.en).toContain('has 1 field and no button');
    expect(one[0]?.message.fr).toContain('a 1 champ et aucun bouton');
    const two = auditConstraints('<form><input name="a"><input name="b"><input type="hidden" name="t"></form>').entries[0];
    expect(two?.message.en).toContain('has 2 fields and no button');
    expect(two?.message.fr).toContain('a 2 champs et aucun bouton');
  });
  it('accepts every kind of submit control', () => {
    for (const button of ['<button>Send</button>', '<button type="submit">Send</button>', '<input type="submit" value="Send">', '<input type="image" alt="Send" src="s.png">']) {
      expect(found(`<form><input name="a">${button}</form>`), button).toEqual([]);
    }
  });
  it('does not accept a plain or reset button as the way to send', () => {
    expect(found('<form><input name="a"><button type="button">Open</button></form>')).toEqual(['no-submit:unknown']);
    expect(found('<form><input name="a"><button type="reset">Clear</button></form>')).toEqual(['reset-button:unknown', 'no-submit:unknown']);
  });
  it('follows the form attribute in both directions', () => {
    expect(found('<form id="f"><input name="a"></form><button form="f">Send</button>')).toEqual([]);
    expect(found('<form id="f"><input name="a"><button form="other">Send</button></form><form id="other"></form>')).toEqual(['no-submit:unknown']);
    expect(found('<form id="f"></form><input name="a" form="f">')).toEqual(['no-submit:unknown']);
  });
  it('leaves a form with no field, and a hidden form, alone', () => {
    expect(found('<form><input type="hidden" name="t"></form><form></form>')).toEqual([]);
    expect(found('<form hidden><input name="a"></form>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts fields, reset buttons, option groups and forms, and skips hidden ones', () => {
    const r = auditConstraints('<form><input name="a"><input type="hidden" name="t"><select name="s"><optgroup label="g"></optgroup></select><textarea name="n"></textarea><button>Send</button></form><div hidden><input name="h"></div>');
    expect(r).toEqual({ checked: 5, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditConstraints('<form>\n<input name="a" pattern="x">\n<button type="reset">Clear</button>\n</form>').entries;
    expect(e.map((x) => x.id)).toEqual(['form@L1', 'input@L2', 'button@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only the option group', () => {
    const e = auditConstraints(SAMPLE_CONSTRAINTS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...CONSTRAINT_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'group-no-label' ? 'fail' : 'unknown');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<form', '<input pattern=', '<select multiple', '<form><form><input>']) expect(() => auditConstraints(html)).not.toThrow();
  });
});
