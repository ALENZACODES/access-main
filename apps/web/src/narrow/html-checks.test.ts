import { describe, expect, it } from 'vitest';
import { auditHandlers } from './handlers.js';
import { auditLookalike } from './lookalike.js';

const GOOD = `<!doctype html><html lang="en"><head><title>Help</title></head><body>
<header><nav aria-label="Main"><a href="/map">Map</a> <a href="/tools">Tools</a></nav></header>
<main><h1>Getting here</h1>
<p>Take the ramp on the left side of the door.</p>
<ul><li>Ramp</li><li>Lift</li><li>Stairs</li></ul>
<button type="button" onclick="open()">Open the map</button>
<div id="root"></div>
<label for="q">Search</label><input id="q" name="q">
</main><footer><a href="/help">Help</a></footer></body></html>`;

const BAD = `<!doctype html><html lang="en"><head><title>Help</title></head><body>
<main>
<p><b>Getting here</b></p>
<p>• Ramp</p>
<p>• Lift</p>
<p>• Stairs</p>
<p>&nbsp;</p>
<div onclick="go()">Go</div>
<span onmousedown="start()" tabindex="0">Draw</span>
<div ondblclick="zoom()" onkeydown="k()" tabindex="0" role="button">Zoom</div>
</main></body></html>`;

describe('a clean page', () => {
  it('has no finding from either markup check', () => {
    expect(auditHandlers(GOOD).entries).toEqual([]);
    expect(auditLookalike(GOOD).entries).toEqual([]);
  });
  it('still reports how many things it looked at', () => {
    expect(auditHandlers(GOOD).checked).toBeGreaterThan(0);
    expect(auditLookalike(GOOD).checked).toBeGreaterThan(0);
  });
});

describe('a page with several problems', () => {
  it('names each look-alike once, with a line number', () => {
    const e = auditLookalike(BAD).entries;
    expect(e.map((x) => x.rule)).toEqual(['fake-heading', 'fake-list', 'empty-paragraph']);
    expect(e.map((x) => /@L(\d+)$/.exec(x.id)?.[1])).toEqual(['3', '4', '7']);
  });
  it('finds the handler problems and keeps their order in the file', () => {
    const e = auditHandlers(BAD).entries;
    expect(e.map((x) => x.rule)).toEqual(expect.arrayContaining(['click-not-focusable', 'down-event', 'double-click']));
    const lines = e.map((x) => Number(/@L(\d+)$/.exec(x.id)?.[1]));
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });
  it('gives every finding both languages and no “verified” wording', () => {
    for (const x of [...auditHandlers(BAD).entries, ...auditLookalike(BAD).entries]) {
      expect(x.message.en.length).toBeGreaterThan(20);
      expect(x.message.fr.length).toBeGreaterThan(20);
      expect(x.message.fr).not.toBe(x.message.en);
      expect(`${x.message.en} ${x.message.fr}`).not.toMatch(/verif|vérif|Vérifiez/iu);
      expect(x.status).toBe('unknown');
    }
  });
  it('never claims a pass or a fail, because the markup cannot show the result', () => {
    const all = [...auditHandlers(BAD).entries, ...auditLookalike(BAD).entries];
    expect(all.some((x) => x.status !== 'unknown')).toBe(false);
  });
});

describe('robustness', () => {
  it.each([
    ['unclosed tags', '<main><p><strong>Hours'],
    ['stray closing tags', '</div></p></main><p>x</p>'],
    ['attributes without values', '<div onclick tabindex>x</div>'],
    ['comments and scripts', '<!-- <p></p> --><script>var a="<p></p>"</script><p>text</p>'],
    ['only text', 'no markup at all'],
    ['empty string', ''],
  ])('does not throw on %s', (_name, html) => {
    expect(() => auditHandlers(html)).not.toThrow();
    expect(() => auditLookalike(html)).not.toThrow();
  });
  it('ignores markup that sits inside a comment or a script', () => {
    expect(auditLookalike('<!-- <p></p> --><script>var a="<p></p>"</script><p>text</p>').entries).toEqual([]);
  });
  it('gives the same answer when run twice', () => {
    expect(auditLookalike(BAD)).toEqual(auditLookalike(BAD));
    expect(auditHandlers(BAD)).toEqual(auditHandlers(BAD));
  });
  it('copes with a large page', () => {
    const big = `<main>${'<p>Some text in a paragraph of the page.</p>'.repeat(4000)}</main>`;
    const started = Date.now();
    expect(auditLookalike(big).entries).toEqual([]);
    expect(auditHandlers(big).entries).toEqual([]);
    expect(Date.now() - started).toBeLessThan(5000);
  });
  it('is not fooled by upper case tags and attributes', () => {
    expect(auditLookalike('<MAIN><P><STRONG>Getting here</STRONG></P></MAIN>').entries.map((e) => e.rule)).toEqual(['fake-heading']);
    expect(auditHandlers('<DIV ONCLICK="go()">Go</DIV>').entries.map((e) => e.rule)).toEqual(['click-not-focusable']);
  });
});
