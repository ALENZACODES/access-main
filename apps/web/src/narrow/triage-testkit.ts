import { updateLedger, EMPTY_LEDGER, type Ledger } from './ledger.js';
import { found, reportOf, route } from './report-fixtures.js';
import type { AuditReport } from './report.js';

/** Test support for the triage tools: a report with findings of every kind, and a ledger that has seen it before. */

/**
 * Four routes. A Level A failure on three of them (`name`), a Level AA
 * failure on one (`contrast`), a Level AAA UNKNOWN (`typography`), a failure
 * outside WCAG (`copy`) and a Level A UNKNOWN (`images`).
 */
export function triageReport(day = 19): AuditReport {
  const nameless = found('name', 'missing', 'fail', 'button#menu', 'The control has no accessible name.', 'Le contrôle n’a pas de nom accessible.');
  return reportOf(
    [
      route('/', {
        name: { checked: 12, entries: [nameless] },
        contrast: { checked: 30, entries: [found('contrast', 'low', 'fail', 'a#nav-help', 'Contrast is 2.1 to 1. It needs 4.5 to 1.', 'Le contraste est de 2,1 pour 1. Il faut 4,5 pour 1.')] },
        images: { checked: 4, entries: [found('images', 'alt-generic', 'unknown', 'img#logo', 'The alt text reads “image”.', 'Le texte de remplacement indique «\u202Fimage\u202F».')] },
      }),
      route('/places', { name: { checked: 9, entries: [nameless] }, typography: { checked: 5, entries: [found('typography', 'justified', 'unknown', 'p[2]', 'The paragraph is justified.', 'Le paragraphe est justifié.')] } }),
      route('/help', { name: { checked: 7, entries: [nameless] }, copy: { checked: 20, entries: [found('copy', 'banned-word', 'fail', 'p[4]', 'The text uses a word the App keeps out of its copy.', 'Le texte emploie un mot que l’App écarte de ses textes.')] } }),
      route('/about', { contrast: { checked: 6, entries: [] } }),
    ],
    day,
  );
}

/** A ledger that first saw the report of `firstDay` (a day of November 2026) and then the one of `lastDay`. */
export function ledgerSince(firstDay: number, lastDay = 19): Ledger {
  return updateLedger(updateLedger(EMPTY_LEDGER, triageReport(firstDay)), triageReport(lastDay));
}

export const DEC = (day: number): Date => new Date(Date.UTC(2026, 11, day, 10, 0, 0));
