import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditLabels, GENERIC_LABELS, LABEL_RULES, plainLabel } from './labels.js';
import { SAMPLE_LABELS_HTML } from './samples.js';

const found = (html: string): string[] => auditLabels(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('plainLabel', () => {
  it('drops case, accents, punctuation and a required mark', () => {
    expect(plainLabel('  Étiquette : ')).toBe('etiquette');
    expect(plainLabel('Phone *')).toBe('phone');
    expect(plainLabel('E-mail (work)')).toBe('e mail work');
    expect(plainLabel('*')).toBe('');
  });
  it('keeps the generic word list in the same plain form', () => {
    for (const w of GENERIC_LABELS) expect(plainLabel(w), w).toBe(w);
  });
});

describe('one label, one field', () => {
  it('fails a label that wraps two fields and counts them', () => {
    const e = auditLabels('<label>Dates <input name="from"> to <input name="to"><select name="tz"></select></label>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['label-two-controls', 'fail', 'label@L1']]);
    expect(e[0]?.message.en).toContain('wraps 3 fields');
    expect(e[0]?.message.fr).toContain('entoure 3 champs');
  });
  it('does not count hidden inputs or buttons as fields', () => {
    expect(found('<label>Name <input name="n"><input type="hidden" name="t"></label>')).toEqual([]);
    expect(found('<label>File <input type="file" name="f"><input type="submit" value="Send"></label>')).toEqual([]);
  });
  it('fails a label inside a label', () => {
    const e = auditLabels('<label>Outer\n<label>Inner <input name="n"></label></label>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['label-nested', 'fail', 'label@L2']]);
    expect(e[0]?.message.en).toContain('“Inner”');
  });
  it('asks when for points one way and the label wraps another field', () => {
    const e = auditLabels('<label for="other">City <input id="city" name="city"></label><input id="other" name="o" aria-label="Other">').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['label-for-and-wraps:unknown']);
    expect(e[0]?.message.en).toContain('points to “other”');
    expect(found('<label for="city">City <input id="city" name="city"></label>')).toEqual([]);
  });
});

describe('controls inside a label', () => {
  it('asks about a link or a button, with words for each', () => {
    const link = auditLabels('<label><input type="checkbox" name="ok"> I accept the <a href="/terms">terms</a></label>').entries;
    expect(link.map((x) => `${x.rule}:${x.status}`)).toEqual(['label-holds-control:unknown']);
    expect(link[0]?.message.en).toContain('holds a link');
    expect(link[0]?.message.fr).toContain('contient un lien');
    const button = auditLabels('<label>Password <button type="button">Show</button> <input type="password" name="p"></label>').entries[0];
    expect(button?.message.en).toContain('holds a button');
    expect(button?.message.fr).toContain('contient un bouton');
  });
  it('does not ask about an anchor with no href or other inline markup', () => {
    expect(found('<label>Name <a>info</a> <strong>required</strong> <input name="n"></label>')).toEqual([]);
  });
});

describe('label words', () => {
  it.each(['Label', 'Input', 'Field', 'Text', 'Champ', 'Étiquette', 'Enter text', '*', ':'])('asks about the label “%s”', (text) => {
    expect(found(`<label for="f">${text}</label><input id="f" name="f">`)).toEqual(['label-generic:unknown']);
  });
  it('does not ask about real words, an empty label or an image with alt text', () => {
    expect(found('<label for="f">Postal code</label><input id="f" name="f">')).toEqual([]);
    expect(found('<label for="f"></label><input id="f" name="f">')).toEqual([]);
    expect(found('<label for="f"><img src="s.png" alt="Search"> *</label><input id="f" name="f">')).toEqual([]);
  });
  it('asks once about the same words on two different fields, and says where the first is', () => {
    const e = auditLabels('<label for="p1">Phone</label><input id="p1" name="p1">\n<label for="p2">phone *</label><input id="p2" name="p2">\n<label for="p3">Phone</label><input id="p3" name="p3">').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['label-duplicate', 'unknown', 'label@L2']]);
    expect(e[0]?.message.en).toContain('the first on line 1');
    expect(e[0]?.message.fr).toContain('le premier à la ligne 1');
  });
  it('does not ask for two labels on one field, for checkboxes and radios, or for different words', () => {
    expect(found('<label for="f">Phone</label><label for="f">Phone</label><input id="f" name="f">')).toEqual([]);
    expect(found('<label><input type="radio" name="a"> Yes</label><label><input type="radio" name="b"> Yes</label>')).toEqual([]);
    expect(found('<label for="a">Home phone</label><input id="a" name="a"><label for="b">Work phone</label><input id="b" name="b">')).toEqual([]);
  });
  it('works for wrapping labels too', () => {
    expect(found('<label>Phone <input name="a"></label><label>Phone <input name="b"></label>')).toEqual(['label-duplicate:unknown']);
  });
});

describe('the result', () => {
  it('counts visible labels', () => {
    expect(auditLabels('<label for="a">A</label><input id="a"><label>B <input></label><div hidden><label>C <input><input></label></div><p>x</p>')).toEqual({ checked: 2, entries: [] });
  });
  it('has a sample for every rule, in clean French, and fails only what it measured', () => {
    const e = auditLabels(SAMPLE_LABELS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...LABEL_RULES].sort());
    noFrIssues(e);
    for (const x of e) expect(x.status, x.rule).toBe(x.rule === 'label-two-controls' || x.rule === 'label-nested' ? 'fail' : 'unknown');
  });
  it('does not throw on broken or deep markup', () => {
    for (const html of ['', '<label', '<label for=', '<label><label><label>', '<label><input><input']) expect(() => auditLabels(html)).not.toThrow();
    expect(() => auditLabels('<label>'.repeat(300))).not.toThrow();
  });
});
