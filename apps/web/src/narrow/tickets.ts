import { ruleIdOf } from './ci.js';
import { criterionLabel } from './criteria.js';
import { guidanceFor } from './guidance.js';
import { manualStep } from './manual-steps.js';
import { describeWhy, type PriorityItem } from './priority.js';
import { CHECK_LABELS, NBSP, type Lang } from './types.js';

/**
 * Drafts of work items, one per distinct finding, written as Markdown so
 * they can be pasted into whatever tracker a team uses. Nothing is sent
 * anywhere: the drafts are text.
 *
 * A draft says what was found and where, which criterion the check relates
 * to, who it matters to, and how a person can look at it by hand. Its last
 * part says when the item can be closed, and that takes two things: the
 * audit no longer reports the finding, and a person has looked. The audit
 * going quiet is not enough.
 */

export interface Ticket {
  /** Stable for one finding across runs, so a tracker can tell a known draft from a new one. */
  readonly key: string;
  readonly title: string;
  /** Markdown. */
  readonly body: string;
  readonly labels: readonly string[];
  readonly owner: string | null;
  readonly score: number;
}

export interface TicketOptions {
  /** Drafts to write, from the top of the order. */
  readonly max?: number;
  /** `fail` drafts only the failures. The default drafts UNKNOWN findings too. */
  readonly only?: 'fail' | 'all';
  /** Routes listed in a draft before the list is cut. */
  readonly maxRoutes?: number;
}

export const DEFAULT_MAX_TICKETS = 20;
export const DEFAULT_MAX_ROUTES = 10;

const colon = (lang: Lang): string => (lang === 'fr' ? `${NBSP}:` : ':');
const code = (text: string): string => (text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``);
const line = (text: string): string => text.replace(/\s*\n\s*/g, ' ').trim();

/** The key of a finding for a tracker: the rule and the element, with no route, so one finding on many routes is one item. */
export function ticketKey(item: PriorityItem): string {
  const e = item.cluster.entry;
  return `${ruleIdOf(e)}|${e.id}`;
}

/** A file name for a draft: lower case, digits and dashes, at most 80 characters, and never empty. */
export function ticketFileName(ticket: Pick<Ticket, 'key'>, index: number): string {
  const slug = ticket.key
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '');
  return `${String(index + 1).padStart(3, '0')}-${slug === '' ? 'finding' : slug}.md`;
}

function draft(item: PriorityItem, lang: Lang, maxRoutes: number): Ticket {
  const fr = lang === 'fr';
  const e = item.cluster.entry;
  const label = (CHECK_LABELS as Readonly<Record<string, { en: string; fr: string } | undefined>>)[e.check]?.[lang] ?? e.check;
  const status = e.status === 'fail' ? (fr ? 'À CORRIGER' : 'FAIL') : 'UNKNOWN';
  const title = `[${status}] ${label}${colon(lang)} ${line(e.message[lang])}`.slice(0, 140);
  const g = guidanceFor(e.check);
  const step = item.sc ? manualStep(item.sc) : null;
  const routes = item.cluster.routes;
  const out: string[] = [];

  out.push(fr ? '## Ce qui a été trouvé' : '## What was found', '');
  out.push(line(e.message[lang]), '');
  out.push(`- ${fr ? 'Statut' : 'Status'}${colon(lang)} **${status}**`);
  out.push(`- ${fr ? 'Règle' : 'Rule'}${colon(lang)} ${code(ruleIdOf(e))}`);
  out.push(`- ${fr ? 'Élément' : 'Element'}${colon(lang)} ${code(e.id)}`);
  out.push(`- ${fr ? 'Critère lié' : 'Related criterion'}${colon(lang)} ${item.sc ? criterionLabel(item.sc, lang) : fr ? 'aucun, contrôle hors WCAG' : 'none, the check is outside WCAG'}`);
  if (item.daysOpen !== null) {
    out.push(
      fr
        ? `- En cours depuis${colon(lang)} ${item.daysOpen} ${item.daysOpen < 2 ? 'jour' : 'jours'}, à compter de la première observation par l’outil`
        : `- Open for${colon(lang)} ${item.daysOpen} ${item.daysOpen === 1 ? 'day' : 'days'}, counted from when the tool first saw it`,
    );
  }
  if (item.owner) out.push(`- ${fr ? 'Responsable' : 'Owner'}${colon(lang)} ${item.owner}`);
  out.push(`- Score${colon(lang)} ${item.score} (${describeWhy(item, lang)})`);
  if (e.status === 'unknown') {
    out.push(
      '',
      fr
        ? 'UNKNOWN veut dire que l’outil n’a pas pu trancher. Il se peut qu’il n’y ait aucun problème. Une personne doit regarder.'
        : 'UNKNOWN means the tool could not tell. There may be no problem at all. A person has to look.',
    );
  }

  out.push('', fr ? `## Où (${routes.length} ${routes.length < 2 ? 'route' : 'routes'})` : `## Where (${routes.length} ${routes.length === 1 ? 'route' : 'routes'})`, '');
  for (const r of routes.slice(0, maxRoutes)) out.push(`- ${code(r)}`);
  if (routes.length > maxRoutes) out.push(fr ? `- … et ${routes.length - maxRoutes} de plus, dans le rapport complet` : `- … and ${routes.length - maxRoutes} more, in the full report`);
  if (routes.length > 1) {
    out.push(
      '',
      fr
        ? 'La même anomalie sur plusieurs routes se trouve sans doute dans une partie commune du site.'
        : 'The same finding on several routes is likely to sit in a shared part of the site.',
    );
  }

  out.push('', fr ? '## Qui est concerné' : '## Who it matters to', '', g.who[lang]);
  out.push('', fr ? '## Regarder à la main' : '## Looking by hand', '', g.byHand[lang]);
  if (step) out.push('', `${fr ? 'Pour le critère' : 'For the criterion'}${colon(lang)} ${step.action[lang]} ${step.look[lang]}`);

  out.push('', fr ? '## Quand fermer' : '## When to close', '');
  out.push(
    fr
      ? '- [ ] L’audit ne signale plus cette anomalie sur les routes ci-dessus.'
      : '- [ ] The audit no longer reports this finding on the routes above.',
    fr ? '- [ ] Une personne a regardé le résultat à la main, comme indiqué ci-dessus.' : '- [ ] A person has looked at the result by hand, as described above.',
    '',
    fr
      ? 'Les deux sont nécessaires. Un audit qui ne signale plus rien ne dit pas que la page est conforme.'
      : 'Both are needed. An audit that reports nothing more does not say the page conforms.',
  );

  const labels = ['accessibility', e.status === 'fail' ? 'a11y-fail' : 'a11y-unknown', `check-${e.check}`];
  if (item.level) labels.push(`wcag-${item.level.toLowerCase()}`);
  return { key: ticketKey(item), title, body: `${out.join('\n')}\n`, labels, owner: item.owner, score: item.score };
}

/** Drafts for the items at the top of an order. */
export function draftTickets(items: readonly PriorityItem[], lang: Lang, options: TicketOptions = {}): Ticket[] {
  const max = Math.max(1, Math.floor(options.max ?? DEFAULT_MAX_TICKETS));
  const maxRoutes = Math.max(1, Math.floor(options.maxRoutes ?? DEFAULT_MAX_ROUTES));
  return items
    .filter((item) => options.only !== 'fail' || item.cluster.entry.status === 'fail')
    .slice(0, max)
    .map((item) => draft(item, lang, maxRoutes));
}

/** One draft as a file: the title as a heading, the key and labels, then the body. */
export function renderTicketFile(ticket: Ticket, lang: Lang): string {
  const fr = lang === 'fr';
  return [`# ${ticket.title}`, '', `${fr ? 'Clé' : 'Key'}${colon(lang)} ${code(ticket.key)}`, `${fr ? 'Étiquettes' : 'Labels'}${colon(lang)} ${ticket.labels.join(', ')}`, '', ticket.body].join('\n');
}

/** An index of the drafts, in order, with the file of each. `left` is how many findings got no draft. */
export function renderTicketIndex(tickets: readonly Ticket[], lang: Lang, left = 0): string {
  const fr = lang === 'fr';
  const out: string[] = [fr ? '# Brouillons de tickets' : '# Ticket drafts', ''];
  if (tickets.length === 0) {
    out.push(fr ? 'Aucune anomalie à transformer en ticket.' : 'No finding to draft a ticket for.');
    return `${out.join('\n')}\n`;
  }
  out.push(
    fr
      ? 'Ces fichiers sont des brouillons. Rien n’a été envoyé à un outil de suivi. La clé de chaque brouillon reste la même d’une exécution à l’autre pour une même anomalie.'
      : 'These files are drafts. Nothing was sent to a tracker. The key of each draft stays the same from one run to the next for the same finding.',
    '',
  );
  tickets.forEach((ticket, i) => {
    out.push(`${i + 1}. [${ticket.title.replace(/([[\]])/g, '\\$1')}](${ticketFileName(ticket, i)})${ticket.owner ? ` ${ticket.owner}` : ''}`);
  });
  if (left > 0) out.push('', fr ? `${left} autres anomalies distinctes n’ont pas de brouillon. Elles sont dans le rapport complet.` : `${left} more distinct findings have no draft. They are in the full report.`);
  return `${out.join('\n')}\n`;
}
