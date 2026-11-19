import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { parseHtml } from './htmllint.js';
import { SAMPLE_SYMBOLS_HTML } from './samples.js';
import { auditSymbols, EMOJI_RUN, hasIconClass, ICON_CLASS, isSymbolOnly, SYMBOL_RULES } from './symbols.js';

const PARTY = '\u{1F389}';
const GLYPH = '\uE900';
const found = (html: string): string[] => auditSymbols(html).entries.map((e) => `${e.rule}`);
const first = (html: string) => {
  const n = parseHtml(html).nodes[0];
  if (!n) throw new Error('no node');
  return n;
};

describe('isSymbolOnly', () => {
  it.each(['×', '→', '☰', '?', '+', ' … ', '>>', '✕', PARTY, '• •'])('"%s" has no letter or digit', (text) => {
    expect(isSymbolOnly(text)).toBe(true);
  });
  it.each(['', '   ', 'x', 'OK', '1', 'Next →', '× Close', 'é', '日'])('"%s" is not symbol only', (text) => {
    expect(isSymbolOnly(text)).toBe(false);
  });
});

describe('icon classes', () => {
  it.each(['fa', 'fas', 'fa-home', 'icon', 'icon-close', 'glyphicon', 'glyphicon-ok', 'material-icons', 'material-icons-outlined', 'material-symbols-rounded', 'bi', 'bi-x', 'mdi', 'mdi-menu'])('%s is an icon font class', (c) => {
    expect(ICON_CLASS.test(c)).toBe(true);
  });
  it.each(['fab-button', 'iconic', 'favicon', 'big', 'media', 'bio', 'title', 'fa_home', 'lexicon'])('%s is not', (c) => {
    expect(ICON_CLASS.test(c)).toBe(false);
  });
  it('reads any of the classes of an element', () => {
    expect(hasIconClass(first('<i class="lead fa fa-home"></i>'))).toBe(true);
    expect(hasIconClass(first('<i class="lead"></i>'))).toBe(false);
    expect(hasIconClass(first('<i></i>'))).toBe(false);
  });
});

describe('controls named by a symbol', () => {
  it('asks about a button whose only text is a symbol and shows it', () => {
    const e = auditSymbols('<button type="button">×</button>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['symbol-only-name', 'unknown', 'button@L1']]);
    expect(e[0]?.message.en).toContain('“×”');
    expect(e[0]?.message.fr).toContain('«\u202F×\u202F»');
  });
  it('reads links, summaries and elements with a control role', () => {
    expect(found('<a href="/next">→</a>')).toEqual(['symbol-only-name']);
    expect(found('<details><summary>?</summary><p>Help text</p></details>')).toEqual(['symbol-only-name']);
    expect(found('<div role="button" tabindex="0">☰</div>')).toEqual(['symbol-only-name']);
    expect(found(`<button>${PARTY}</button>`)).toEqual(['symbol-only-name']);
  });
  it('does not ask when the control has words, a name, or an image with alt text', () => {
    expect(found('<button>× Close</button><a href="/next">Next →</a>')).toEqual([]);
    expect(found('<button aria-label="Close">×</button><button title="Close">×</button>')).toEqual([]);
    expect(found('<span id="c">Close</span><button aria-labelledby="c">×</button>')).toEqual([]);
    expect(found('<button>×<img src="x.png" alt="Close"></button>')).toEqual([]);
    expect(found('<button><span aria-label="Close">×</span></button>')).toEqual([]);
  });
  it('leaves an empty control to the name rule, and symbols outside controls alone', () => {
    expect(found('<button></button>')).toEqual([]);
    expect(found('<p>→</p><span>×</span><a>→</a>')).toEqual([]);
  });
  it('skips hidden controls', () => {
    expect(found('<div hidden><button>×</button></div><button aria-hidden="true">×</button>')).toEqual([]);
  });
});

describe('private use characters', () => {
  it('asks about an icon font character written in the text', () => {
    const e = auditSymbols(`<p>Menu ${GLYPH}</p>`).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['private-use-glyph', 'unknown', 'p@L1']]);
  });
  it('reports it once, on the element that holds it, also inside a control', () => {
    expect(found(`<button><span>${GLYPH}</span></button>`)).toEqual(['private-use-glyph']);
    expect(found(`<button>${GLYPH}</button>`)).toEqual(['private-use-glyph']);
  });
  it('skips one that is hidden from assistive technology', () => {
    expect(found(`<button aria-label="Menu"><span aria-hidden="true">${GLYPH}</span></button>`)).toEqual([]);
  });
});

describe('icon font elements', () => {
  it('asks about an empty icon that is not hidden', () => {
    const e = auditSymbols('<i class="fa fa-home"></i>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['icon-not-hidden', 'unknown', 'i@L1']]);
    expect(e[0]?.message.en).toContain('reads nothing or a stray character');
  });
  it('says the word is read aloud for a ligature icon', () => {
    const e = auditSymbols('<span class="material-icons">menu</span>').entries;
    expect(e.map((x) => x.rule)).toEqual(['icon-not-hidden']);
    expect(e[0]?.message.en).toContain('drawn from the word “menu”');
    expect(e[0]?.message.fr).toContain('à partir du mot «\u202Fmenu\u202F»');
  });
  it('adds where it is read when the icon sits in a control', () => {
    const inButton = auditSymbols('<button>Open <i class="material-icons">menu</i></button>').entries[0];
    expect(inButton?.message.en).toContain('next to the name of the control');
    const empty = auditSymbols('<a href="/home"><i class="bi bi-house"></i> Home</a>').entries[0];
    expect(empty?.message.en).toContain('inside the control');
    expect(auditSymbols('<i class="fa fa-home"></i>').entries[0]?.message.en).not.toContain('control');
  });
  it('does not ask when the icon is hidden, named, an image, or not an icon', () => {
    expect(found('<i class="fa fa-home" aria-hidden="true"></i>')).toEqual([]);
    expect(found('<span aria-hidden="true"><i class="material-icons">menu</i></span>')).toEqual([]);
    expect(found('<i class="fa fa-home" role="img" aria-label="Home"></i>')).toEqual([]);
    expect(found('<i class="fa fa-home" title="Home"></i>')).toEqual([]);
    expect(found('<i>emphasis</i><span class="lead">text</span><div class="fa fa-home"></div>')).toEqual([]);
  });
  it('leaves an icon element that holds a private use character to that rule', () => {
    expect(found(`<i class="icon">${GLYPH}</i>`)).toEqual(['private-use-glyph']);
  });
});

describe('emoji in a row', () => {
  it(`asks from ${EMOJI_RUN} in a row and counts all of them`, () => {
    const e = auditSymbols(`<p>Open today ${PARTY}${PARTY}${PARTY} and ${PARTY}</p>`).entries;
    expect(e.map((x) => [x.rule, x.status])).toEqual([['emoji-run', 'unknown']]);
    expect(e[0]?.message.en).toContain('has 4 emoji');
    expect(e[0]?.message.fr).toContain('compte 4 émojis');
  });
  it('counts emoji separated by spaces as a row', () => {
    expect(found(`<p>${PARTY} ${PARTY} ${PARTY}</p>`)).toEqual(['emoji-run']);
  });
  it('does not ask for one or two, or for several spread through the text', () => {
    expect(found(`<p>Open today ${PARTY}</p><p>${PARTY}${PARTY} Welcome</p>`)).toEqual([]);
    expect(found(`<p>${PARTY} Ramp ${PARTY} Lift ${PARTY} Stairs</p>`)).toEqual([]);
  });
});

describe('the result', () => {
  it('never claims a failure', () => {
    expect(auditSymbols(SAMPLE_SYMBOLS_HTML).entries.every((e) => e.status === 'unknown')).toBe(true);
  });
  it('does not read scripts, styles or the page title', () => {
    expect(auditSymbols(`<html><head><title>${PARTY}${PARTY}${PARTY}</title><style>a::before{content:"${GLYPH}"}</style></head><body><script>var s = "${GLYPH}";</script></body></html>`)).toEqual({ checked: 0, entries: [] });
  });
  it('counts controls, text holders and icons', () => {
    expect(auditSymbols('<button>Go</button><p>Text</p><i class="fa fa-x" aria-hidden="true"></i><div></div>').checked).toBe(3);
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditSymbols(SAMPLE_SYMBOLS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...SYMBOL_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup', () => {
    for (const html of ['', '<button', '<i class=', '<p>\uD83C</p>', '<a href>']) expect(() => auditSymbols(html)).not.toThrow();
  });
});
