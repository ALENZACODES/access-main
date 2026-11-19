import { describe, expect, it } from 'vitest';
import {
  auditCss,
  CSS_RULE_IDS,
  drawsFocusCue,
  focusParts,
  moves,
  parseCss,
  parseDeclaration,
  parseDeclarations,
  removesOutline,
  stripCssComments,
  styleBlocks,
} from './cssrules.js';
import { noFrIssues } from './expect-fr.js';
import { SAMPLE_CSS_HTML } from './samples.js';

const style = (css: string): string => `<style>${css}</style>`;
const found = (html: string): string[] => auditCss(html).entries.map((e) => `${e.rule}`);
const decls = (text: string) => parseDeclarations(text);

describe('stripCssComments', () => {
  it('blanks comments and keeps the line breaks', () => {
    expect(stripCssComments('a{}/* x\ny */b{}')).toBe('a{}    \n    b{}');
    expect(stripCssComments('a{} /* never closed')).toBe('a{}                ');
  });
});

describe('parseDeclaration', () => {
  it('reads the property, the value and the priority', () => {
    expect(parseDeclaration(' Line-Height : 1.5 ')).toEqual({ prop: 'line-height', value: '1.5', important: false });
    expect(parseDeclaration('outline:NONE!important')).toEqual({ prop: 'outline', value: 'none', important: true });
    expect(parseDeclaration('letter-spacing: 0 ! IMPORTANT')).toEqual({ prop: 'letter-spacing', value: '0', important: true });
  });
  it('keeps the case of a custom property value', () => {
    expect(parseDeclaration('--Brand: #0B4F9C')).toEqual({ prop: '--brand', value: '#0B4F9C', important: false });
  });
  it('returns null for text that is not a declaration', () => {
    for (const x of ['', 'color', ': red', 'color:', 'a b: c', '&:hover{color', '12px: x']) expect(parseDeclaration(x), x).toBeNull();
  });
});

describe('parseDeclarations', () => {
  it('splits on semicolons outside strings and brackets', () => {
    const d = decls('background:url("a;b.png");content:";";color:red');
    expect(d.map((x) => x.prop)).toEqual(['background', 'content', 'color']);
    expect(d[0]?.value).toBe('url("a;b.png")');
  });
  it('copes with a trailing semicolon, none at all and an unclosed string', () => {
    expect(decls('color:red;').map((x) => x.prop)).toEqual(['color']);
    expect(decls('color:red').map((x) => x.prop)).toEqual(['color']);
    expect(() => decls('content:"oops;color:red')).not.toThrow();
  });
});

describe('parseCss', () => {
  it('reads selectors, declarations and line numbers', () => {
    const r = parseCss('a{color:red}\n\n.b ,\n.c{ outline:0 ; margin:0 }');
    expect(r.map((x) => [x.selector, x.line, x.declarations.map((d) => d.prop)])).toEqual([
      ['a', 1, ['color']],
      ['.b , .c', 3, ['outline', 'margin']],
    ]);
  });
  it('starts counting at the line it is given', () => {
    expect(parseCss('\na{color:red}', 10)[0]?.line).toBe(11);
  });
  it('follows media, supports and layer blocks and records them', () => {
    const r = parseCss('@media (orientation: portrait){@supports (display:grid){body{display:none}}}@layer base{a{color:red}}');
    expect(r.map((x) => [x.selector, x.context])).toEqual([
      ['body', ['@media (orientation: portrait)', '@supports (display:grid)']],
      ['a', ['@layer base']],
    ]);
  });
  it('skips keyframes, font faces and statements', () => {
    const r = parseCss('@charset "utf-8";@import url("a.css");@font-face{font-family:x;src:url(a)}@keyframes spin{from{opacity:0}to{opacity:1}}p{color:red}');
    expect(r.map((x) => x.selector)).toEqual(['p']);
  });
  it('reads nested rules and joins their selectors', () => {
    const r = parseCss('.card{color:red;&:focus{outline:none}.title{margin:0}padding:1px}');
    expect(r.map((x) => [x.selector, x.declarations.map((d) => d.prop)])).toEqual([
      ['.card', ['color', 'padding']],
      ['.card:focus', ['outline']],
      ['.card .title', ['margin']],
    ]);
  });
  it('ignores comments, even with braces in them', () => {
    expect(parseCss('/* a{outline:none} */ b{color:red} /* } */ c{margin:0}').map((x) => x.selector)).toEqual(['b', 'c']);
  });
  it('is not confused by braces and semicolons inside strings', () => {
    const r = parseCss('a::before{content:"}{;"}b{color:red}');
    expect(r.map((x) => x.selector)).toEqual(['a::before', 'b']);
    expect(r[0]?.declarations[0]?.value).toBe('"}{;"');
  });
  it.each(['', '}', '{', 'a{', 'a{color:red', '@media', '@media (x){', '}}}}a{color:red}', 'a{b{c{d{e{f{g{h{i{j{k{l{m{n{o{color:red}}}}}}}}}}}}}}}'])('does not throw on %s', (css) => {
    expect(() => parseCss(css)).not.toThrow();
  });
  it('still reads the rule after a stray closing brace', () => {
    expect(parseCss('}a{color:red}').map((x) => x.selector)).toEqual(['a']);
  });
});

describe('styleBlocks', () => {
  it('finds every style element with its line and media', () => {
    const b = styleBlocks('<html>\n<style>a{}</style>\n<p>x</p>\n<style media="print" type="text/css">\nb{}</style>');
    expect(b).toEqual([
      { css: 'a{}', line: 2, media: '' },
      { css: '\nb{}', line: 4, media: 'print' },
    ]);
  });
  it('leaves out style text inside a comment or a script', () => {
    expect(styleBlocks('<!-- <style>a{}</style> --><script>var s = "<style>b{}</style>";</script><style>c{}</style>').map((x) => x.css)).toEqual(['c{}']);
  });
  it('reads a style element that is never closed', () => {
    expect(styleBlocks('<STYLE>a{outline:0}').map((x) => x.css)).toEqual(['a{outline:0}']);
  });
});

describe('outline helpers', () => {
  it('know when the outline is switched off', () => {
    for (const x of ['outline:none', 'outline:0', 'outline: 0px solid red', 'outline-style:none', 'outline-width:0', 'outline:1px solid;outline:none']) expect(removesOutline(decls(x)), x).toBe(true);
    for (const x of ['outline:2px solid blue', 'outline-offset:0', 'border:none', 'outline:none;outline:2px solid blue', 'outline-color:transparent']) expect(removesOutline(decls(x)), x).toBe(false);
  });
  it('know when the same rule draws another cue', () => {
    for (const x of ['box-shadow:0 0 0 3px blue', 'border:2px solid', 'border-color:blue', 'background-color:yellow', 'text-decoration:underline']) expect(drawsFocusCue(decls(x)), x).toBe(true);
    for (const x of ['box-shadow:none', 'border:0', 'color:red', 'background:none', 'outline-offset:2px']) expect(drawsFocusCue(decls(x)), x).toBe(false);
  });
  it('pick the parts of a selector that match a focused element', () => {
    expect(focusParts('a:focus, b, c:focus-visible')).toEqual(['a:focus', 'c:focus-visible']);
    expect(focusParts('a:focus:not(:focus-visible)')).toEqual([]);
    expect(focusParts('.x:focus-within')).toEqual([]);
    expect(focusParts('a:hover')).toEqual([]);
  });
});

describe('focus outline', () => {
  it('asks when a focus rule removes the outline and draws nothing', () => {
    const e = auditCss(style('a:focus{outline:none}')).entries;
    expect(e.map((x) => [x.rule, x.status, x.id])).toEqual([['focus-outline-removed', 'unknown', 'style@L1:a:focus']]);
    expect(e[0]?.message.en).toContain('“a:focus”');
  });
  it('does not ask when the rule draws another cue', () => {
    expect(found(style('a:focus{outline:none;box-shadow:0 0 0 3px #0b4f9c}'))).toEqual([]);
    expect(found(style('input:focus-visible{outline:0;border-color:#0b4f9c}'))).toEqual([]);
  });
  it('does not ask about hiding the ring for the mouse only', () => {
    expect(found(style('a:focus:not(:focus-visible){outline:none}'))).toEqual([]);
  });
  it('asks when a rule removes the outline in every state', () => {
    expect(found(style('*{outline:0}'))).toEqual(['outline-reset']);
    expect(found(style('a,button{outline:none}'))).toEqual(['outline-reset']);
  });
  it('asks about a focusable element that removes its own outline', () => {
    const e = auditCss('<button style="outline:none">Go</button><p style="outline:none">x</p>').entries;
    expect(e.map((x) => [x.rule, x.id])).toEqual([['outline-reset', 'button@L1']]);
  });
  it('gives the line of the rule inside the file', () => {
    const e = auditCss('<html>\n<head>\n<style>\nbody{margin:0}\na:focus{outline:none}\n</style>').entries;
    expect(e[0]?.id).toBe('style@L5:a:focus');
  });
});

describe('text spacing', () => {
  it('asks about spacing properties marked important, in a sheet and in a style attribute', () => {
    const e = auditCss(`${style('p{line-height:1.2!important;letter-spacing:0 !important}')}<p style="word-spacing:0!important">x</p>`).entries;
    expect(e.map((x) => [x.rule, x.id])).toEqual([['spacing-important', 'style@L1:p'], ['spacing-important', 'p@L1']]);
    expect(e[0]?.message.en).toContain('line-height, letter-spacing');
    expect(e[1]?.message.en).toContain('word-spacing');
  });
  it('does not ask about the same properties without the priority, or other properties with it', () => {
    expect(found(style('p{line-height:1.5;letter-spacing:.02em}a{color:red!important}'))).toEqual([]);
  });
});

describe('orientation', () => {
  it('asks when the page is hidden or turned inside an orientation query', () => {
    expect(found(style('@media (orientation: portrait){body{display:none}}'))).toEqual(['orientation-lock']);
    expect(found(style('@media screen and (orientation:landscape){#root{visibility:hidden}}'))).toEqual(['orientation-lock']);
    expect(found(style('@media (orientation:portrait){.app{transform:rotate(90deg)}}'))).toEqual(['orientation-lock']);
    expect(found(style('@media (orientation:portrait){.app{rotate:-90deg}}'))).toEqual(['orientation-lock']);
  });
  it('reads the media attribute of the style element too', () => {
    expect(found('<style media="(orientation: landscape)">body{display:none}</style>')).toEqual(['orientation-lock']);
  });
  it('does not ask about one hidden control, a small turn, or the same rule outside the query', () => {
    expect(found(style('@media (orientation:landscape){#filters{display:none}}'))).toEqual([]);
    expect(found(style('@media (orientation:landscape){.icon{transform:rotate(45deg)}}'))).toEqual([]);
    expect(found(style('.app{transform:rotate(90deg)}@media (min-width:600px){body{display:none}}'))).toEqual([]);
  });
});

describe('motion', () => {
  it('knows which values move', () => {
    const d = (x: string) => decls(x)[0] ?? { prop: '', value: '', important: false };
    for (const x of ['animation:spin 1s linear infinite', 'animation-name:spin', 'transition:color .2s', 'transition:all 200ms ease', 'transition-duration:1s', 'animation:spin']) expect(moves(d(x)), x).toBe(true);
    for (const x of ['animation:none', 'transition:none', 'transition:color 0s', 'transition-duration:0s', 'animation-duration:0ms', 'color:red', 'transition:inherit']) expect(moves(d(x)), x).toBe(false);
  });
  it('asks once, at the first moving rule, when nothing answers reduced motion', () => {
    const e = auditCss(style('a{color:red}\n.spin{animation:spin 1s infinite}\n.fade{transition:opacity .3s}')).entries;
    expect(e.map((x) => [x.rule, x.id])).toEqual([['motion-no-reduce', 'style@L2:.spin']]);
  });
  it('does not ask when a reduced motion block exists, in any style element', () => {
    expect(found(`${style('.spin{animation:spin 1s infinite}')}${style('@media (prefers-reduced-motion: reduce){.spin{animation:none}}')}`)).toEqual([]);
    expect(found(`${style('.spin{animation:spin 1s infinite}')}<style media="(prefers-reduced-motion: reduce)">.spin{animation:none}</style>`)).toEqual([]);
  });
  it('does not ask when the page links a style sheet it cannot read', () => {
    expect(found(`<link rel="stylesheet" href="/app.css">${style('.spin{animation:spin 1s infinite}')}`)).toEqual([]);
  });
  it('does not count motion that only exists inside a no-preference block', () => {
    expect(found(style('@media (prefers-reduced-motion: no-preference){.spin{animation:spin 1s infinite}}'))).toEqual([]);
  });
});

describe('scrolling and zoom', () => {
  it('asks when the whole page cannot scroll', () => {
    const e = auditCss(style('html,body{overflow:hidden}')).entries;
    expect(e.map((x) => x.rule)).toEqual(['root-scroll-locked']);
    expect(e[0]?.message.fr).toContain('320\u00A0px');
    expect(found(style('body{overflow-x:hidden}'))).toEqual(['root-scroll-locked']);
    expect(found(style(':root{overflow:clip}'))).toEqual(['root-scroll-locked']);
  });
  it('does not ask about a scroll lock on a class or on a part of the page', () => {
    expect(found(style('body.modal-open{overflow:hidden}.panel{overflow:hidden}body{overflow:auto}'))).toEqual([]);
  });
  it('asks when pinch zoom or text enlargement is switched off', () => {
    expect(found(style('body{touch-action:none}'))).toEqual(['zoom-blocked']);
    expect(found(style('html{touch-action:pan-x pan-y}'))).toEqual(['zoom-blocked']);
    const e = auditCss(style('html{-webkit-text-size-adjust:none}')).entries[0];
    expect(e?.rule).toBe('zoom-blocked');
    expect(e?.message.en).toContain('text-size-adjust');
  });
  it('does not ask about values that keep zoom, or touch-action on one control', () => {
    expect(found(style('body{touch-action:manipulation}html{touch-action:pan-x pan-y pinch-zoom}html{-webkit-text-size-adjust:100%}.map{touch-action:none}'))).toEqual([]);
  });
});

describe('the result', () => {
  it('never claims a failure, because it does not apply the CSS', () => {
    expect(auditCss(SAMPLE_CSS_HTML).entries.every((e) => e.status === 'unknown')).toBe(true);
  });
  it('counts rules and style attributes', () => {
    expect(auditCss(`${style('a{color:red}b{color:blue}')}<p style="margin:0">x</p><p style="">y</p>`)).toEqual({ checked: 3, entries: [] });
    expect(auditCss('<p>no styles</p>')).toEqual({ checked: 0, entries: [] });
  });
  it('has a sample for every rule, in clean French', () => {
    const e = auditCss(SAMPLE_CSS_HTML).entries;
    expect([...new Set(e.map((x) => x.rule))].sort()).toEqual([...CSS_RULE_IDS].sort());
    noFrIssues(e);
  });
  it('gives the same answer twice and does not throw on broken input', () => {
    expect(auditCss(SAMPLE_CSS_HTML)).toEqual(auditCss(SAMPLE_CSS_HTML));
    for (const html of ['', '<style>', '<style>a{', '<style>}}}</style>', '<p style=";;;:">x</p>', '<style>/*</style>']) expect(() => auditCss(html)).not.toThrow();
  });
  it('copes with a large style sheet', () => {
    const big = style(Array.from({ length: 5000 }, (_, i) => `.c${i}{color:red;margin:${i}px}`).join('\n'));
    const started = Date.now();
    expect(auditCss(big)).toEqual({ checked: 5000, entries: [] });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
