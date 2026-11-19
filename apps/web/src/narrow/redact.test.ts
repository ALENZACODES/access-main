import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { countRedactions, describeRedaction, REDACTED, redactElementId, redactMessage, redactReport, redactRoute } from './redact.js';
import { found, reportOf, route, smallSite } from './report-fixtures.js';
import { totals, type AuditReport } from './report.js';

const private_ = (): AuditReport =>
  reportOf([
    route('/search?q=jane+doe#results', {
      links: { checked: 3, entries: [found('links', 'url-as-text', 'unknown', 'a#jane-doe-profile@L12', 'The link “Jane Doe, 12 Main Street” is an address.', 'Le lien «\u202FJane Doe, 12 Main Street\u202F» est une adresse.')] },
      contrast: { checked: 5, entries: [found('contrast', 'low', 'fail', 'p[2]', 'The ratio is 2.1.', 'Le rapport est de 2,1.')] },
    }),
    route('html:dist/index.html', { 'static-html': { checked: 9, entries: [found('static-html', 'img-alt', 'fail', 'img#portrait@L9')] } }, null),
  ]);

describe('redactMessage', () => {
  it('removes text quoted in English and in French, and keeps the quote marks', () => {
    expect(redactMessage('The link “Jane Doe” is vague.')).toBe(`The link “${REDACTED}” is vague.`);
    expect(redactMessage('Le lien «\u202FJane Doe\u202F» est vague.')).toBe(`Le lien «\u202F${REDACTED}\u202F» est vague.`);
  });
  it('removes every quoted part', () => {
    expect(redactMessage('“a” and “b” differ.')).toBe(`“${REDACTED}” and “${REDACTED}” differ.`);
  });
  it('leaves a message with no quote as it is', () => {
    expect(redactMessage('The image has no alt.')).toBe('The image has no alt.');
    expect(redactMessage('')).toBe('');
  });
  it('keeps the French typography of a redacted message clean', () => {
    expect(frTypographyIssues(redactMessage('Le lien «\u202FJane\u202F» est vague.'))).toEqual([]);
  });
});

describe('redactRoute', () => {
  it('drops the query and the fragment and shows that something was there', () => {
    expect(redactRoute('/search?q=jane+doe')).toBe(`/search?${REDACTED}`);
    expect(redactRoute('/help#jane')).toBe(`/help#${REDACTED}`);
    expect(redactRoute('/search?q=a#b')).toBe(`/search?${REDACTED}`);
  });
  it('keeps a plain path and file routes', () => {
    expect(redactRoute('/help/faq')).toBe('/help/faq');
    expect(redactRoute('html:dist/index.html')).toBe('html:dist/index.html');
    expect(redactRoute('data:places.json')).toBe('data:places.json');
  });
});

describe('redactElementId', () => {
  it.each([
    ['input#jane-doe@L12', 'input@L12'],
    ['a#jane-doe-profile', 'a'],
    ['p[2]', 'p[2]'],
    ['span[0]::before', 'span[0]::before'],
    ['img@L9', 'img@L9'],
    ['style@L5:a.jane:focus', 'style@L5'],
    ['fancy-card#x@L3', 'fancy-card@L3'],
    ['hero.title', 'hero'],
    ['html', 'html'],
  ])('%s becomes %s', (id, out) => {
    expect(redactElementId(id)).toBe(out);
  });
  it('replaces an id that does not start with a tag', () => {
    expect(redactElementId('#jane')).toBe(REDACTED);
    expect(redactElementId('')).toBe(REDACTED);
  });
  it('gives the same result when applied twice', () => {
    for (const id of ['input#jane@L12', 'p[2]', 'style@L5:a:focus', '#x']) expect(redactElementId(redactElementId(id))).toBe(redactElementId(id));
  });
});

describe('redactReport', () => {
  const out = redactReport(private_());
  it('takes the quoted text, the query and the id values out', () => {
    const text = JSON.stringify(out);
    expect(text).not.toContain('Jane');
    expect(text).not.toContain('jane');
    expect(text).not.toContain('Main Street');
    expect(text).not.toContain('portrait');
    expect(out.routes[0]?.route).toBe(`/search?${REDACTED}`);
    expect(out.routes[0]?.entries.map((e) => e.id)).toEqual(['p[2]', 'a@L12']);
  });
  it('keeps checks, rules, statuses, lines and every count', () => {
    expect(totals(out.routes)).toEqual(totals(private_().routes));
    expect(out.routes.map((r) => r.checks)).toEqual(private_().routes.map((r) => r.checks));
    expect(out.routes.flatMap((r) => r.entries.map((e) => `${e.check}/${e.rule}:${e.status}`))).toEqual(private_().routes.flatMap((r) => r.entries.map((e) => `${e.check}/${e.rule}:${e.status}`)));
    expect(out.routes[1]?.entries[0]?.id).toBe('img@L9');
    expect(out.generatedAt).toBe(private_().generatedAt);
  });
  it('keeps messages that quote nothing', () => {
    expect(out.routes[0]?.entries[0]?.message).toEqual({ en: 'The ratio is 2.1.', fr: 'Le rapport est de 2,1.' });
  });
  it('redacts waived failures too', () => {
    const report: AuditReport = { ...private_(), waived: [{ route: '/u?id=7', entry: found('contrast', 'low', 'fail', 'p#jane', 'Text “Jane” is faint.'), reason: 'Redesign', expires: '2027-01-31' }] };
    const w = redactReport(report).waived?.[0];
    expect(w?.route).toBe(`/u?${REDACTED}`);
    expect(w?.entry.id).toBe('p');
    expect(w?.entry.message.en).toBe(`Text “${REDACTED}” is faint.`);
    expect(w?.reason).toBe('Redesign');
    expect(redactReport(private_()).waived).toBeUndefined();
  });
  it('does not change the report it is given, and is the same when applied twice', () => {
    const report = private_();
    const before = JSON.stringify(report);
    const once = redactReport(report);
    expect(JSON.stringify(report)).toBe(before);
    expect(redactReport(once)).toEqual(once);
  });
});

describe('countRedactions and describeRedaction', () => {
  it('counts what redaction changes', () => {
    expect(countRedactions(private_())).toEqual({ messages: 1, routes: 1, ids: 2 });
    expect(countRedactions(redactReport(private_()))).toEqual({ messages: 0, routes: 0, ids: 0 });
    expect(countRedactions(smallSite())).toEqual({ messages: 0, routes: 0, ids: 2 });
  });
  it('writes a note that says what was removed and what was kept', () => {
    const d = describeRedaction({ messages: 1, routes: 1, ids: 2 });
    expect(d.en).toBe('Redacted for sharing: quoted page text removed from 1 message, the query or fragment removed from 1 route, id values removed from 2 elements. Counts and statuses are unchanged. Route paths are kept, so read them before sharing.');
    expect(d.fr).toContain('texte de page cité retiré de 1 message, requête ou fragment retiré de 1 route, valeurs d’identifiant retirées de 2 éléments.');
    expect(d.fr).toContain('relisez-les avant de partager.');
    expect(frTypographyIssues(d.fr)).toEqual([]);
  });
  it('does not promise that nothing personal is left', () => {
    const d = describeRedaction({ messages: 0, routes: 0, ids: 0 });
    expect(d.en).toContain('Route paths are kept, so read them before sharing.');
    expect(d.en).not.toMatch(/anonym|safe to share|no personal/i);
    expect(d.en).toContain('0 messages');
    expect(d.fr).toContain('0 message,');
  });
});
