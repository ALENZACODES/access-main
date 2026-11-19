import { describe, expect, it } from 'vitest';
import { scanCopy } from './copylint.js';
import { frTypographyIssues } from './i18n.js';
import { parseOwners } from './owners.js';
import { prioritise } from './priority.js';
import { found, nov, reportOf, route } from './report-fixtures.js';
import { DEFAULT_MAX_ROUTES, DEFAULT_MAX_TICKETS, draftTickets, renderTicketFile, renderTicketIndex, ticketFileName, ticketKey } from './tickets.js';
import { ledgerSince, triageReport } from './triage-testkit.js';

const items = prioritise(triageReport(), { now: nov(19) });
const en = draftTickets(items, 'en');
const fr = draftTickets(items, 'fr');

describe('draftTickets', () => {
  it('drafts one ticket per distinct finding, in the order given', () => {
    expect(en.map((t) => t.key)).toEqual(['name/missing|button#menu', 'contrast/low|a#nav-help', 'copy/banned-word|p[4]', 'images/alt-generic|img#logo', 'typography/justified|p[2]']);
    expect(en.map((t) => t.score)).toEqual(items.map((i) => i.score));
  });

  it('titles a draft with the status, the check and the message', () => {
    expect(en[0]?.title).toBe('[FAIL] Accessible names: The control has no accessible name.');
    expect(en[3]?.title.startsWith('[UNKNOWN] ')).toBe(true);
    expect(fr[0]?.title.startsWith('[À CORRIGER] ')).toBe(true);
    expect(fr[3]?.title.startsWith('[UNKNOWN] ')).toBe(true);
  });

  it('cuts a long title', () => {
    const long = found('contrast', 'low', 'fail', 'p', 'x'.repeat(400), 'y'.repeat(400));
    const t = draftTickets(prioritise(reportOf([route('/', { contrast: { checked: 1, entries: [long] } })]), { now: nov(19) }), 'en');
    expect(t[0]?.title.length).toBe(140);
  });

  it('says what was found, with the rule, the element and the criterion', () => {
    const body = en[0]?.body ?? '';
    expect(body).toContain('## What was found\n\nThe control has no accessible name.\n');
    expect(body).toContain('- Status: **FAIL**');
    expect(body).toContain('- Rule: `name/missing`');
    expect(body).toContain('- Element: `button#menu`');
    expect(body).toContain('- Related criterion: 4.1.2 Name, Role, Value (A)');
    expect(body).toContain('- Score: 160 (FAIL, Level A, 3 routes)');
  });

  it('says so for a check outside WCAG', () => {
    expect(en[2]?.body).toContain('- Related criterion: none, the check is outside WCAG');
    expect(fr[2]?.body).toContain('- Critère lié\u00A0: aucun, contrôle hors WCAG');
  });

  it('lists the routes and says a repeated finding is likely shared', () => {
    const body = en[0]?.body ?? '';
    expect(body).toContain('## Where (3 routes)\n\n- `/`\n- `/places`\n- `/help`\n');
    expect(body).toContain('likely to sit in a shared part of the site');
    expect(en[1]?.body).toContain('## Where (1 route)');
    expect(en[1]?.body).not.toContain('shared part of the site');
  });

  it('cuts a long list of routes and says how many are left', () => {
    const e = found('contrast', 'low', 'fail', 'a#x');
    const report = reportOf(Array.from({ length: 14 }, (_v, i) => route(`/p${String(i).padStart(2, '0')}`, { contrast: { checked: 1, entries: [e] } })));
    const many = prioritise(report, { now: nov(19) });
    const body = draftTickets(many, 'en')[0]?.body ?? '';
    expect(body.split('\n').filter((l) => l.startsWith('- `/p'))).toHaveLength(DEFAULT_MAX_ROUTES);
    expect(body).toContain('- … and 4 more, in the full report');
    expect(draftTickets(many, 'en', { maxRoutes: 2 })[0]?.body).toContain('- … and 12 more, in the full report');
  });

  it('explains what UNKNOWN means on an UNKNOWN draft only', () => {
    expect(en[3]?.body).toContain('UNKNOWN means the tool could not tell. There may be no problem at all. A person has to look.');
    expect(en[0]?.body).not.toContain('UNKNOWN means');
    expect(fr[3]?.body).toContain('UNKNOWN veut dire que l’outil n’a pas pu trancher.');
  });

  it('adds who it matters to and how to look by hand, with the step for the criterion', () => {
    const body = en[1]?.body ?? '';
    expect(body).toContain('## Who it matters to\n\n');
    expect(body).toContain('## Looking by hand\n\n');
    expect(body).toContain('For the criterion: Measure the contrast of text placed on images, gradients and maps.');
    expect(en[2]?.body).not.toContain('For the criterion:');
  });

  it('asks for two things before closing, and says the audit going quiet is not enough', () => {
    for (const t of en) {
      expect(t.body).toContain('- [ ] The audit no longer reports this finding on the routes above.');
      expect(t.body).toContain('- [ ] A person has looked at the result by hand, as described above.');
      expect(t.body).toContain('Both are needed. An audit that reports nothing more does not say the page conforms.');
    }
    expect(fr[0]?.body).toContain('Les deux sont nécessaires.');
  });

  it('adds the age and the owner when they are known', () => {
    const owners = parseOwners('* @web\n');
    if (!owners.ok) throw new Error(owners.error.en);
    const rich = draftTickets(prioritise(triageReport(), { now: nov(19), ledger: ledgerSince(5), owners: owners.value }), 'en');
    expect(rich[0]?.body).toContain('- Open for: 14 days, counted from when the tool first saw it');
    expect(rich[0]?.body).toContain('- Owner: @web');
    expect(rich[0]?.owner).toBe('@web');
    expect(en[0]?.body).not.toContain('Open for');
    expect(en[0]?.owner).toBeNull();
  });

  it('labels a draft by status, check and level', () => {
    expect(en[0]?.labels).toEqual(['accessibility', 'a11y-fail', 'check-name', 'wcag-a']);
    expect(en[2]?.labels).toEqual(['accessibility', 'a11y-fail', 'check-copy']);
    expect(en[4]?.labels).toEqual(['accessibility', 'a11y-unknown', 'check-typography', 'wcag-aaa']);
  });

  it('takes the number of drafts and the status from the options', () => {
    expect(draftTickets(items, 'en', { max: 2 })).toHaveLength(2);
    expect(draftTickets(items, 'en', { max: 0 })).toHaveLength(1);
    expect(draftTickets(items, 'en', { only: 'fail' }).map((t) => t.labels[1])).toEqual(['a11y-fail', 'a11y-fail', 'a11y-fail']);
    expect(draftTickets([], 'en')).toEqual([]);
    expect(DEFAULT_MAX_TICKETS).toBe(20);
  });

  it('follows French typography outside the quoted message', () => {
    for (const t of fr) {
      for (const l of t.body.split('\n')) expect(frTypographyIssues(l), l).toEqual([]);
      expect(frTypographyIssues(t.title), t.title).toEqual([]);
    }
  });

  it('uses none of the words the App keeps out of its copy', () => {
    for (const t of [...en, ...fr].filter((x) => !x.key.startsWith('copy/'))) {
      expect(scanCopy(t.body), t.key).toEqual([]);
      expect(t.body).not.toMatch(/\bfixed\b|\bverif|vérif|\bpass(es|ed)?\b/i);
    }
  });

  it('wraps a code value that holds a backtick', () => {
    const odd = found('contrast', 'low', 'fail', 'a[title="`x`"]');
    const t = draftTickets(prioritise(reportOf([route('/', { contrast: { checked: 1, entries: [odd] } })]), { now: nov(19) }), 'en');
    expect(t[0]?.body).toContain('- Element: `` a[title="`x`"] ``');
  });
});

describe('ticketKey and ticketFileName', () => {
  it('keeps one key for one finding, whatever the routes and the run', () => {
    const later = prioritise(triageReport(25), { now: nov(25) });
    expect(later.map(ticketKey).sort()).toEqual(items.map(ticketKey).sort());
    expect(ticketKey(items[0]!)).not.toContain('/places');
  });

  it.each([
    ['name/missing|button#menu', 0, '001-name-missing-button-menu.md'],
    ['contrast/low|a[title="Été"]', 11, '012-contrast-low-a-title-ete.md'],
    ['|||', 2, '003-finding.md'],
  ])('%s gives %s', (key, index, want) => {
    expect(ticketFileName({ key }, index)).toBe(want);
  });

  it('keeps file names short and free of trailing dashes', () => {
    const name = ticketFileName({ key: `contrast/low|${'div > '.repeat(40)}p` }, 0);
    expect(name.length).toBeLessThanOrEqual(78);
    expect(name).toMatch(/^[0-9]{3}-[a-z0-9-]*[a-z0-9]\.md$/);
  });
});

describe('renderTicketFile and renderTicketIndex', () => {
  it('writes a draft as a file with its key and labels', () => {
    const file = renderTicketFile(en[0]!, 'en');
    expect(file.startsWith('# [FAIL] Accessible names: The control has no accessible name.\n\nKey: `name/missing|button#menu`\nLabels: accessibility, a11y-fail, check-name, wcag-a\n\n## What was found')).toBe(true);
    expect(renderTicketFile(fr[0]!, 'fr')).toContain('Clé\u00A0: `name/missing|button#menu`\nÉtiquettes\u00A0: accessibility');
  });

  it('indexes the drafts with links to their files, and says nothing was sent', () => {
    const index = renderTicketIndex(en, 'en', 3);
    expect(index).toContain('Nothing was sent to a tracker.');
    expect(index).toContain('1. [\\[FAIL\\] Accessible names: The control has no accessible name.](001-name-missing-button-menu.md)');
    expect(index.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(5);
    expect(index).toContain('3 more distinct findings have no draft. They are in the full report.');
    expect(renderTicketIndex(en, 'en')).not.toContain('have no draft');
  });

  it('says so when there is nothing to draft', () => {
    expect(renderTicketIndex([], 'en')).toBe('# Ticket drafts\n\nNo finding to draft a ticket for.\n');
    expect(renderTicketIndex([], 'fr')).toContain('Aucune anomalie à transformer en ticket.');
  });

  it('writes the index in French with French typography', () => {
    const index = renderTicketIndex(fr, 'fr', 2);
    expect(index).toContain('# Brouillons de tickets');
    expect(index).toContain('2 autres anomalies distinctes n’ont pas de brouillon.');
    for (const l of index.split('\n').filter((x) => !/^\d+\. /.test(x))) expect(frTypographyIssues(l), l).toEqual([]);
  });
});
