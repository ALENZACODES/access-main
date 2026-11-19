import { describe, expect, it } from 'vitest';
import { noFrIssues } from './expect-fr.js';
import { auditObsolete, OBSOLETE_ELEMENTS, OBSOLETE_RULES } from './obsolete.js';
import { SAMPLE_OBSOLETE_HTML } from './samples.js';

const found = (html: string): string[] => auditObsolete(html).entries.map((e) => `${e.rule}:${e.status}`);

describe('obsolete elements', () => {
  it.each(Object.keys(OBSOLETE_ELEMENTS))('asks about %s and says what to use', (tag) => {
    const e = auditObsolete(`<${tag}>Welcome</${tag}>`).entries.filter((x) => x.rule === 'presentational-element');
    expect(e).toHaveLength(1);
    expect(e[0]?.status).toBe('unknown');
    expect(e[0]?.id).toBe(`${tag}@L1`);
    expect(e[0]?.message.en).toContain(`Use ${OBSOLETE_ELEMENTS[tag]?.en}`);
    expect(e[0]?.message.fr).toContain(`Utilisez ${OBSOLETE_ELEMENTS[tag]?.fr}`);
  });
  it('has a replacement in both languages for every element', () => {
    for (const [tag, now] of Object.entries(OBSOLETE_ELEMENTS)) {
      expect(now.en.trim(), tag).not.toBe('');
      expect(now.fr.trim(), tag).not.toBe('');
    }
  });
  it('leaves moving and blinking text to the timing check', () => {
    expect(found('<marquee>News</marquee><blink>New</blink>')).toEqual([]);
    expect('marquee' in OBSOLETE_ELEMENTS).toBe(false);
  });
  it('leaves current elements alone', () => {
    expect(found('<main><h1>Hours</h1><p><strong>Open</strong> <em>today</em> <b>9</b> <i>to</i> <small>5</small> <abbr title="Ontario">ON</abbr></p><pre><code>x</code></pre></main>')).toEqual([]);
  });
  it('asks about frame sets', () => {
    const e = auditObsolete('<frameset cols="50%,50%"><frame src="a.html"><noframes>Text</noframes></frameset>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['frameset:unknown', 'frameset:unknown', 'frameset:unknown']);
    expect(found('<iframe src="a.html" title="Map"></iframe>')).toEqual([]);
  });
});

describe('look set by attributes', () => {
  it('asks once per element and names the attributes', () => {
    const e = auditObsolete('<td align="center" bgcolor="#eee" valign="top">Open</td>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['layout-attribute:unknown']);
    expect(e[0]?.message.en).toContain('the attributes align, valign and bgcolor');
    expect(e[0]?.message.fr).toContain('les attributs align, valign et bgcolor');
  });
  it('uses the singular for one attribute', () => {
    const e = auditObsolete('<p align="center">Open</p>').entries[0];
    expect(e?.message.en).toContain('the attribute align.');
    expect(e?.message.fr).toContain('l’attribut align.');
  });
  it('warns about sideways scrolling for a fixed width or no wrapping', () => {
    const wide = auditObsolete('<table width="600"><tr><td nowrap>Open</td></tr></table>').entries;
    expect(wide.map((x) => x.id)).toEqual(['table@L1', 'td@L1']);
    for (const e of wide) {
      expect(e.message.en).toContain('sideways scrolling');
      expect(e.message.fr).toContain('défilement horizontal');
    }
    expect(auditObsolete('<p align="center">Open</p>').entries[0]?.message.en).not.toContain('sideways');
  });
  it('lets width and height reserve space on images, video, canvas and frames', () => {
    expect(found('<img src="a.png" alt="Ramp" width="64" height="64"><video width="320" height="240" controls></video><canvas width="10" height="10"></canvas><iframe title="Map" width="300" height="200"></iframe>')).toEqual([]);
  });
  it('does not read attributes inside an svg', () => {
    expect(found('<svg width="10" height="10"><rect width="5" height="5" align="x"></rect><text>u</text></svg>')).toEqual([]);
  });
});

describe('underline, struck-out and highlighted text', () => {
  it('asks about underlined text that is not a link', () => {
    const e = auditObsolete('<p>Read the <u>opening hours</u> first.</p>').entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['underline-not-link:unknown']);
    expect(e[0]?.message.en).toContain('“opening hours”');
  });
  it('does not ask inside a link or a button, or when the element is empty or hidden', () => {
    expect(found('<a href="/h"><u>Hours</u></a><button><u>S</u>ave</button><u></u><div hidden><u>x</u></div>')).toEqual([]);
  });
  it.each([
    ['del', 'removed', 'supprimé'],
    ['s', 'no longer current', 'plus à jour'],
    ['ins', 'added', 'ajouté'],
    ['mark', 'highlighted', 'surligné'],
  ])('asks whether the meaning of %s reaches a screen reader', (tag, en, fr) => {
    const e = auditObsolete(`<p>Price: <${tag}>10 dollars</${tag}></p>`).entries;
    expect(e.map((x) => `${x.rule}:${x.status}`)).toEqual(['silent-semantics:unknown']);
    expect(e[0]?.message.en).toContain(`marked as ${en} with ${tag}`);
    expect(e[0]?.message.fr).toContain(`marqué comme ${fr} avec ${tag}`);
  });
  it('skips empty and hidden ones', () => {
    expect(found('<del></del><p aria-hidden="true"><s>old</s></p>')).toEqual([]);
  });
});

describe('server-side image maps', () => {
  it('fails an image that sends click coordinates to the server', () => {
    const e = auditObsolete('<a href="/map"><img src="m.png" alt="Map" ismap></a>').entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['server-image-map', 'fail', 'img@L1']]);
  });
  it('passes a client-side map', () => {
    expect(found('<img src="m.png" alt="Map" usemap="#m"><map name="m"><area href="/a" alt="A"></map>')).toEqual([]);
  });
});

describe('the result', () => {
  it('counts every element and keeps the order of the file', () => {
    const r = auditObsolete('<center>a</center>\n<p>b</p>\n<font>c</font>\n<u>d</u>');
    expect(r.checked).toBe(4);
    expect(r.entries.map((e) => e.id)).toEqual(['center@L1', 'font@L3', 'u@L4']);
  });
  it('fails only the image map', () => {
    for (const e of auditObsolete(SAMPLE_OBSOLETE_HTML).entries) expect(e.status, e.rule).toBe(e.rule === 'server-image-map' ? 'fail' : 'unknown');
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditObsolete(SAMPLE_OBSOLETE_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...OBSOLETE_RULES].sort());
    noFrIssues(e);
  });
  it('does not throw on broken markup and is not fooled by upper case', () => {
    for (const html of ['', '<font', '<center><center>', '<td nowrap', '</u>']) expect(() => auditObsolete(html)).not.toThrow();
    expect(found('<CENTER>x</CENTER><TD NOWRAP>y</TD>')).toEqual(['presentational-element:unknown', 'layout-attribute:unknown']);
  });
});
