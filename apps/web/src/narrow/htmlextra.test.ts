import { describe, expect, it } from 'vitest';
import { AUTOCOMPLETE_TOKENS, extraHtmlRules, validAutocomplete } from './htmlextra.js';
import { lintHtml, parseHtml } from './htmllint.js';

const frag = (html: string) => lintHtml(html, { fragment: true }).entries;
const rulesOf = (html: string): string[] => frag(html).flatMap((e) => (e.rule ? [e.rule] : []));

describe('validAutocomplete', () => {
  it('accepts single tokens, section prefixes and hints', () => {
    for (const v of ['email', 'on', 'off', 'given-name', 'section-a email', 'shipping postal-code', 'billing section-b cc-number', 'EMAIL']) {
      expect(validAutocomplete(v), v).toBe(true);
    }
  });
  it('rejects unknown tokens, empty values and stray words', () => {
    for (const v of ['', '  ', 'e-mail', 'email phone', 'shipping', 'section-a', 'home']) expect(validAutocomplete(v), v).toBe(false);
  });
  it('knows the contact and password tokens the App forms use', () => {
    for (const t of ['email', 'tel', 'username', 'new-password', 'current-password', 'one-time-code', 'postal-code', 'street-address']) {
      expect(AUTOCOMPLETE_TOKENS.has(t), t).toBe(true);
    }
  });
});

describe('table rules', () => {
  it('lets a layout table with role presentation pass', () => {
    expect(rulesOf('<table role="presentation"><tr><td>a</td></tr></table>')).toEqual([]);
  });
  it('does not ask for headers on a table with no data cells', () => {
    expect(rulesOf('<table></table>')).toEqual([]);
  });
  it('asks for a caption only as a review item', () => {
    const e = frag('<table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
    expect(e.map((x) => [x.rule, x.status])).toEqual([['table-caption', 'unknown']]);
  });
  it('treats an empty caption as no caption', () => {
    expect(rulesOf('<table><caption> </caption><tr><th>A</th></tr><tr><td>1</td></tr></table>')).toContain('table-caption');
  });
});

describe('fieldset-legend', () => {
  it('reports one finding per ungrouped radio set, not one per button', () => {
    const n = rulesOf('<input type="radio" name="a" aria-label="1"><input type="radio" name="a" aria-label="2"><input type="radio" name="a" aria-label="3">').filter((r) => r === 'fieldset-legend');
    expect(n).toHaveLength(1);
  });
  it('lets one radio, or a role group, pass', () => {
    expect(rulesOf('<input type="radio" name="a" aria-label="1">')).toEqual([]);
    expect(rulesOf('<div role="radiogroup"><input type="radio" name="a" aria-label="1"><input type="radio" name="a" aria-label="2"></div>')).not.toContain('fieldset-legend');
  });
  it('reports a fieldset with no legend', () => {
    const e = frag('<fieldset><input aria-label="x"></fieldset>').find((x) => x.rule === 'fieldset-legend');
    expect(e?.message.en).toContain('no legend');
    expect(e?.message.fr).toContain('n’a pas de legend');
  });
});

describe('nested-interactive', () => {
  it('names the inner control', () => {
    const e = frag('<button><a href="/x">in</a></button>').find((x) => x.rule === 'nested-interactive');
    expect(e?.id).toMatch(/^a@L1$/);
  });
  it('does not count an anchor without href as a control', () => {
    expect(rulesOf('<button><a>in</a></button>')).not.toContain('nested-interactive');
  });
  it('does not count a hidden input', () => {
    expect(rulesOf('<a href="/x">go<input type="hidden"></a>')).not.toContain('nested-interactive');
  });
});

describe('svg-name', () => {
  it('asks about an unnamed svg that is not decorative, but not inside a named control', () => {
    expect(frag('<svg></svg>').map((e) => [e.rule, e.status])).toEqual([['svg-name', 'unknown']]);
    expect(rulesOf('<button aria-label="Go"><svg></svg></button>')).not.toContain('svg-name');
  });
  it('accepts a title child and aria-hidden', () => {
    expect(rulesOf('<svg role="img"><title>Map</title></svg>')).not.toContain('svg-name');
    expect(rulesOf('<div aria-hidden="true"><svg role="img"></svg></div>')).not.toContain('svg-name');
  });
});

describe('media and refresh', () => {
  it('always asks about audio', () => {
    expect(frag('<audio src="a.mp3"></audio>')[0]?.status).toBe('unknown');
  });
  it('accepts subtitles as well as captions', () => {
    expect(rulesOf('<video><track kind="subtitles" src="s.vtt"></video>')).not.toContain('media-captions');
    expect(rulesOf('<video><track kind="descriptions" src="s.vtt"></video>')).toContain('media-captions');
  });
  it('fails a delayed refresh and passes a plain reload with no number', () => {
    expect(rulesOf('<meta http-equiv="refresh" content="30">')).toContain('meta-refresh');
    expect(rulesOf('<meta http-equiv="refresh" content="x">')).not.toContain('meta-refresh');
  });
});

describe('lists, language and landmarks', () => {
  it('reports each loose list item', () => {
    expect(rulesOf('<li>a</li><li>b</li>').filter((r) => r === 'list-structure')).toHaveLength(2);
    expect(rulesOf('<menu><li>a</li></menu>')).toEqual([]);
  });
  it('checks lang on parts of a page and leaves a valid one alone', () => {
    expect(rulesOf('<span lang="fr">a</span><span lang="fr-CA">b</span><span lang="en-GB">c</span>')).toEqual([]);
    expect(rulesOf('<span lang="x">a</span>')).toEqual(['lang-part']);
  });
  it('reports every unnamed or repeated landmark name', () => {
    const e = frag('<nav aria-label="Menu"><a href="/a">A</a></nav><nav aria-label="Menu"><a href="/b">B</a></nav>');
    expect(e.filter((x) => x.rule === 'landmark-label')).toHaveLength(1);
    expect(rulesOf('<nav><a href="/a">A</a></nav>')).toEqual([]);
    expect(rulesOf('<aside></aside><aside aria-label="Tips"></aside>')).toEqual(['landmark-label']);
  });
  it('counts role=navigation as a landmark', () => {
    expect(rulesOf('<div role="navigation"></div><nav></nav>').filter((r) => r === 'landmark-label')).toHaveLength(2);
  });
});

describe('accesskey-dup', () => {
  it('ignores case and reports the second use', () => {
    const e = frag('<button accesskey="a">1</button><button accesskey="A">2</button>');
    expect(e.filter((x) => x.rule === 'accesskey-dup')).toHaveLength(1);
  });
});

describe('form, details and dialog rules', () => {
  it('aria-errormessage also counts as pointing to the error', () => {
    expect(rulesOf('<label>M <input aria-invalid="true" aria-errormessage="e" autocomplete="email"></label><p id="e">x</p>')).not.toContain('invalid-describedby');
  });
  it('aria-invalid=false needs nothing', () => {
    expect(rulesOf('<label>M <input aria-invalid="false"></label>')).not.toContain('invalid-describedby');
  });
  it('autofocus only asks for a look', () => {
    expect(frag('<label>Q <input autofocus></label>').find((x) => x.rule === 'autofocus')?.status).toBe('unknown');
  });
  it('a summary that is not the direct child does not count', () => {
    expect(rulesOf('<details><div><summary>x</summary></div></details>')).toContain('details-summary');
  });
  it('a dialog named through aria-labelledby passes, and role=dialog is covered', () => {
    expect(rulesOf('<h2 id="t">Filters</h2><div role="dialog" aria-labelledby="t"></div>')).not.toContain('dialog-name');
    expect(rulesOf('<div role="alertdialog"></div>')).toContain('dialog-name');
  });
  it('hreflang x-default is fine, and a page with no alternates is not flagged', () => {
    const page = (links: string): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title>${links}</head><body><main><h1>x</h1></main></body></html>`;
    expect(lintHtml(page('<link rel="alternate" hreflang="x-default" href="/">')).entries).toEqual([]);
    expect(lintHtml(page('')).entries).toEqual([]);
    expect(lintHtml(page('<link rel="alternate" hreflang="fr_CA" href="/f">')).entries.map((x) => x.rule)).toEqual(['hreflang-code']);
  });
});

describe('extraHtmlRules', () => {
  it('works straight on parsed nodes and leaves a clean page alone', () => {
    const nodes = parseHtml('<ul><li><a href="/a">A</a></li></ul><h2>T</h2>').nodes;
    expect(extraHtmlRules(nodes)).toEqual([]);
  });
  it('messages exist in English and French for every hit', () => {
    const nodes = parseHtml('<li>x</li><h2></h2><svg role="img"></svg><table><tr><td>a</td></tr></table>').nodes;
    const entries = lintHtml('<li>x</li><h2></h2><svg role="img"></svg><table><tr><td>a</td></tr></table>', { fragment: true }).entries;
    expect(extraHtmlRules(nodes).length).toBeGreaterThan(3);
    for (const e of entries) {
      expect(e.message.en.length).toBeGreaterThan(5);
      expect(e.message.fr.length).toBeGreaterThan(5);
    }
  });
});
