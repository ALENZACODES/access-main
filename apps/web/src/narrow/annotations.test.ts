import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_ANNOTATIONS, escapeData, escapeProperty, formatAnnotation, renderAnnotations, sourceOf, toAnnotations } from './annotations.js';
import { at, finding, routeOf, siteReport } from './findings-testkit.js';
import { makeReport } from './report.js';

const fileReport = () =>
  makeReport(
    [
      routeOf(
        'html:dist/index.html',
        {
          'static-html': { checked: 30, entries: [finding('static-html', 'link-text', 'unknown', 'a@L14', 'The link text is vague.', 'Le texte du lien est vague.'), finding('static-html', 'img-alt', 'fail', 'img#logo@L9', 'The image has no alt.', 'L’image n’a pas de alt.')] },
          css: { checked: 4, entries: [finding('css', 'outline-reset', 'unknown', 'style@L5:a:focus, b')] },
        },
        null,
      ),
    ],
    at(19),
  );

describe('escaping', () => {
  it('escapes percent signs and line breaks in a message', () => {
    expect(escapeData('100% done\nnext\r\nlast')).toBe('100%25 done%0Anext%0D%0Alast');
    expect(escapeData('a: b, c')).toBe('a: b, c');
  });
  it('also escapes colons and commas in a property', () => {
    expect(escapeProperty('html:a,b 50%')).toBe('html%3Aa%2Cb 50%25');
  });
  it('escapes the percent sign first, so an escape is never escaped twice', () => {
    expect(escapeData('%0A')).toBe('%250A');
    expect(escapeProperty(':')).toBe('%3A');
  });
});

describe('sourceOf', () => {
  it('gives the file and line for a finding from an HTML file', () => {
    expect(sourceOf('html:dist/index.html', finding('static-html', 'img-alt', 'fail', 'img#logo@L9'))).toEqual({ file: 'dist/index.html', line: 9 });
    expect(sourceOf('html:a.html', finding('css', 'outline-reset', 'unknown', 'style@L5:a:focus'))).toEqual({ file: 'a.html', line: 5 });
  });
  it('gives the file alone when the id has no line', () => {
    expect(sourceOf('html:a.html', finding('static-html', 'title', 'fail', 'html'))).toEqual({ file: 'a.html' });
    expect(sourceOf('html:a.html', finding('static-html', 'title', 'fail', 'x@L0'))).toEqual({ file: 'a.html' });
  });
  it('gives nothing for a live route or an empty file name', () => {
    expect(sourceOf('/help', finding('contrast', 'low', 'fail', 'p@L3'))).toBeNull();
    expect(sourceOf('html:', finding('contrast', 'low', 'fail', 'p@L3'))).toBeNull();
    expect(sourceOf('data:places.json', finding('provenance', 'no-source', 'fail', 'r1'))).toBeNull();
  });
});

describe('toAnnotations', () => {
  it('turns a failure into an error and an unknown into a notice, never a warning', () => {
    const levels = new Set(toAnnotations(siteReport(), 'en').map((a) => a.level));
    expect([...levels].sort()).toEqual(['error', 'notice']);
    expect(toAnnotations(siteReport(), 'en').filter((a) => a.level === 'error')).toHaveLength(4);
  });
  it('puts failures first and keeps the order of the report inside each level', () => {
    const a = toAnnotations(fileReport(), 'en');
    expect(a.map((x) => [x.level, x.line])).toEqual([['error', 9], ['notice', 14], ['notice', 5]]);
  });
  it('carries the file and line for file findings, and the route in the title for live ones', () => {
    expect(toAnnotations(fileReport(), 'en')[0]).toEqual({ level: 'error', title: 'static-html/img-alt img#logo@L9', message: 'The image has no alt.', file: 'dist/index.html', line: 9 });
    const live = toAnnotations(siteReport(), 'en')[0];
    expect(live?.title).toBe('contrast/low / a#nav-help');
    expect(live?.file).toBeUndefined();
    expect(live?.line).toBeUndefined();
  });
  it('uses the message of the language asked for', () => {
    expect(toAnnotations(fileReport(), 'fr')[0]?.message).toBe('L’image n’a pas de alt.');
  });
});

describe('formatAnnotation', () => {
  it('writes a workflow command', () => {
    expect(formatAnnotation({ level: 'error', title: 'static-html/img-alt img@L9', message: 'The image has no alt.', file: 'dist/index.html', line: 9 })).toBe(
      '::error file=dist/index.html,line=9,title=static-html/img-alt img@L9::The image has no alt.',
    );
    expect(formatAnnotation({ level: 'notice', title: 't', message: 'm' })).toBe('::notice title=t::m');
  });
  it('escapes what page text could break', () => {
    const line = formatAnnotation({ level: 'notice', title: 'css/outline-reset style@L5:a:focus, b', message: 'Line one\nLine two 100%::end', file: 'a,b.html', line: 5 });
    expect(line).toBe('::notice file=a%2Cb.html,line=5,title=css/outline-reset style@L5%3Aa%3Afocus%2C b::Line one%0ALine two 100%25::end');
    expect(line.split('\n')).toHaveLength(1);
  });
});

describe('renderAnnotations', () => {
  it('is empty for a report with no finding', () => {
    expect(renderAnnotations(makeReport([routeOf('/', { contrast: { checked: 3, entries: [] } })], at(19)), 'en')).toBe('');
  });
  it('writes one line per finding and ends with a line break', () => {
    const text = renderAnnotations(fileReport(), 'en');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trimEnd().split('\n')).toEqual([
      '::error file=dist/index.html,line=9,title=static-html/img-alt img#logo@L9::The image has no alt.',
      '::notice file=dist/index.html,line=14,title=static-html/link-text a@L14::The link text is vague.',
      '::notice file=dist/index.html,line=5,title=css/outline-reset style@L5%3Aa%3Afocus%2C b::English text for outline-reset.',
    ]);
  });
  it('cuts at the limit, keeps the failures, and says how many were left out', () => {
    const lines = renderAnnotations(siteReport(), 'en', 3).trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines.slice(0, 3).every((l) => l.startsWith('::error '))).toBe(true);
    expect(lines[3]).toBe('::notice title=narrow-audit::3 more findings are not annotated here, 1 of them to fix. The full report holds all of them.');
    const fr = renderAnnotations(siteReport(), 'fr', 5).trimEnd().split('\n');
    expect(fr[5]).toBe('::notice title=narrow-audit::1 autre anomalie n’est pas annotée ici, dont 0 à corriger. Le rapport complet les contient toutes.');
  });
  it('adds no closing line when everything fits, and treats a limit under one as one', () => {
    expect(renderAnnotations(siteReport(), 'en', 6).trimEnd().split('\n')).toHaveLength(6);
    expect(renderAnnotations(siteReport(), 'en', 0).trimEnd().split('\n')).toHaveLength(2);
    expect(DEFAULT_MAX_ANNOTATIONS).toBe(10);
  });
  it('never writes a warning or an error for an unknown', () => {
    const unknownOnly = makeReport([routeOf('/', { images: { checked: 1, entries: [finding('images', 'alt-generic', 'unknown', 'img')] } })], at(19));
    const text = renderAnnotations(unknownOnly, 'en');
    expect(text).toMatch(/^::notice /);
    expect(text).not.toContain('::error');
    expect(text).not.toContain('::warning');
  });
});
