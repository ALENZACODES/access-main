import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_TYPING_HTML } from './samples.js';
import { auditTyping, AUTOCAPITALIZE, ENTER_KEY_HINTS, INPUT_MODES, INPUT_TYPES, TYPING_RULES } from './typing.js';

const found = (html: string): string[] => auditTyping(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('value tables', () => {
  it('hold the values of the HTML standard', () => {
    expect(INPUT_TYPES.size).toBe(22);
    for (const x of ['text', 'email', 'tel', 'url', 'number', 'date', 'datetime-local', 'search', 'password', 'checkbox', 'radio', 'file', 'range', 'color', 'hidden']) expect(INPUT_TYPES.has(x), x).toBe(true);
    expect([...INPUT_MODES].sort()).toEqual(['decimal', 'email', 'none', 'numeric', 'search', 'tel', 'text', 'url']);
    expect([...ENTER_KEY_HINTS].sort()).toEqual(['done', 'enter', 'go', 'next', 'previous', 'search', 'send']);
    expect([...AUTOCAPITALIZE].sort()).toEqual(['characters', 'none', 'off', 'on', 'sentences', 'words']);
  });
  it('do not hold the usual mistakes', () => {
    for (const x of ['phone', 'telephone', 'numeric', 'datetime', 'string', 'mail']) expect(INPUT_TYPES.has(x), x).toBe(false);
    for (const x of ['number', 'phone', 'digits']) expect(INPUT_MODES.has(x), x).toBe(false);
  });
});

describe('type', () => {
  it.each(['phone', 'telephone', 'numeric', 'datetime', 'mail'])('fails type="%s" and names the field', (type) => {
    const e = auditTyping(`<input type="${type}" name="contact">`).entries.filter((x) => x.rule === 'type-invalid');
    expect(e.map((x) => [x.status, x.id])).toEqual([['fail', 'input@L1']]);
    expect(e[0]?.message.en).toContain(`has the type “${type}”`);
    expect(e[0]?.message.en).toContain('“contact”');
    expect(e[0]?.message.fr).toContain(`a le type «\u202F${type}\u202F»`);
  });
  it('passes real types in any case, and an input with no type', () => {
    expect(found('<input type="TEL" name="t"><input type="email" name="m"><input name="x"><input type="" name="y"><input type="datetime-local" name="d">')).toEqual([]);
  });
  it('does not read the type of other elements', () => {
    expect(found('<button type="phone">x</button><textarea type="rich"></textarea>')).toEqual([]);
  });
});

describe('inputmode, enterkeyhint and autocapitalize', () => {
  it('fails a value the browser does not know and lists the allowed ones', () => {
    const mode = auditTyping('<input name="qty" inputmode="number">').entries;
    expect(mode.map((x) => `${x.rule}:${x.status}`)).toEqual(['inputmode-invalid:fail']);
    expect(mode[0]?.message.en).toContain('Allowed: none, text, decimal, numeric, tel, search, email, url.');
    expect(mode[0]?.message.fr).toContain('Valeurs permises\u00A0: none, text, decimal, numeric, tel, search, email, url.');
    expect(found('<input name="q" enterkeyhint="submit">')).toEqual(['enterkeyhint-invalid:fail']);
    expect(found('<textarea name="t" autocapitalize="title"></textarea>')).toEqual(['autocapitalize-invalid:fail']);
  });
  it('passes the allowed values in any case', () => {
    expect(found('<input name="a" inputmode="NUMERIC" enterkeyhint="Search" autocapitalize="WORDS">')).toEqual([]);
  });
  it('reads them on editable regions and other elements that carry them', () => {
    expect(found('<div contenteditable="true" aria-label="Note" inputmode="digits"></div>')).toEqual(['inputmode-invalid:fail']);
    expect(found('<div enterkeyhint="ok">x</div>')).toEqual(['enterkeyhint-invalid:fail']);
  });
});

describe('inputmode against type', () => {
  it('asks when the two disagree', () => {
    const e = auditTyping('<input type="email" name="mail" inputmode="numeric">').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['inputmode-conflict:unknown']);
    expect(e[0]?.message.en).toContain('is of type email and asks for the numeric keyboard');
    expect(found('<input type="tel" name="t" inputmode="email">')).toEqual(['inputmode-conflict:unknown']);
    expect(found('<input type="number" name="n" inputmode="text">')).toEqual(['inputmode-conflict:unknown']);
  });
  it('does not ask when they agree, for a plain text field, or for inputmode none', () => {
    expect(found('<input type="tel" name="t" inputmode="numeric"><input type="number" name="n" inputmode="decimal"><input type="email" name="m" inputmode="email">')).toEqual([]);
    expect(found('<input type="text" name="postal" inputmode="numeric" spellcheck="false"><input name="pin2" inputmode="numeric" autocapitalize="off">')).toEqual([]);
    expect(found('<input type="email" name="m" inputmode="none">')).toEqual([]);
  });
});

describe('typing help on values that are not words', () => {
  it.each(['username', 'email', 'postal_code', 'promo-code', 'user_login', 'courriel'])('asks about a text field named %s', (name) => {
    expect(found(`<input type="text" name="${name}">`)).toEqual(['correction-on-code:unknown']);
  });
  it('reads the id and the autocomplete token too', () => {
    expect(found('<input id="coupon">')).toEqual(['correction-on-code:unknown']);
    expect(found('<input name="x" autocomplete="family-name">')).toEqual(['correction-on-code:unknown']);
    expect(found('<input name="x" autocomplete="shipping postal-code">')).toEqual(['correction-on-code:unknown']);
  });
  it('does not ask once the help is off in any of the three ways', () => {
    expect(found('<input name="username" spellcheck="false">')).toEqual([]);
    expect(found('<input name="username" autocapitalize="none">')).toEqual([]);
    expect(found('<input name="username" autocapitalize="off">')).toEqual([]);
    expect(found('<input name="username" autocorrect="off">')).toEqual([]);
  });
  it('leaves ordinary text, other types and hidden fields alone', () => {
    expect(found('<input name="comment"><input name="city"><textarea name="message"></textarea>')).toEqual([]);
    expect(found('<input type="email" name="email"><input type="password" name="code">')).toEqual([]);
    expect(found('<div hidden><input name="username"></div>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts editable fields and elements that carry a typing attribute', () => {
    expect(auditTyping('<input name="a"><textarea name="b"></textarea><div contenteditable aria-label="c"></div><p>d</p><button>e</button><div hidden><input name="f"></div>')).toEqual({ checked: 3, entries: [] });
  });
  it('keeps the order of the file', () => {
    const e = auditTyping('<input type="phone" name="a">\n<input name="b" inputmode="x">\n<input name="username">').entries;
    expect(e.map((x) => x.id)).toEqual(['input@L1', 'input@L2', 'input@L3']);
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditTyping(SAMPLE_TYPING_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...TYPING_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'inputmode-conflict' || x.rule === 'correction-on-code' ? 'unknown' : 'fail');
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<input type=', '<input inputmode', '<textarea autocapitalize="', '<input type="a b c">']) expect(() => auditTyping(html)).not.toThrow();
  });
});
