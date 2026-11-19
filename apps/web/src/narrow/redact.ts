import type { AuditReport, RouteAudit } from './report.js';
import type { Entry } from './types.js';

/**
 * A copy of a report with page text taken out, for sharing outside the team:
 * in an issue, a chat or a public job log. Findings quote the page (a label,
 * a link text, a search term in the address), and that text can hold a
 * person's name or what they searched for. Redaction removes the quoted text
 * from messages, the query and fragment from routes, and the id values from
 * element ids, and keeps the check, the rule, the status, the line and every
 * count. It reduces what is exposed. It is not a promise that nothing
 * personal is left: a route path can still name a person or a place.
 */

export const REDACTED = '[…]';

/** Text between English curly quotes or French guillemets, which is how messages quote the page. */
const QUOTED_EN = /“[^”]*”/g;
const QUOTED_FR = /«[^»]*»/g;

export function redactMessage(text: string): string {
  return text.replace(QUOTED_EN, `“${REDACTED}”`).replace(QUOTED_FR, `«\u202F${REDACTED}\u202F»`);
}

/** Drops the query and the fragment of a route, and says that something was there. `html:` and `data:` routes name a file and are kept. */
export function redactRoute(route: string): string {
  if (route.startsWith('html:') || route.startsWith('data:')) return route;
  const cut = route.search(/[?#]/);
  return cut === -1 ? route : `${route.slice(0, cut)}${route[cut]}${REDACTED}`;
}

/** Keeps the tag, the position and the line of an element id and drops id values, which authors choose and which can hold names: `input#jane-doe@L12` becomes `input@L12`. */
export function redactElementId(id: string): string {
  const line = /@L\d+(?::.*)?$/.exec(id);
  const head = line ? id.slice(0, line.index) : id;
  const tail = line ? line[0].replace(/:.*$/, '') : '';
  const tag = /^[a-z][a-z0-9-]*(?:\[\d+\])?/i.exec(head);
  if (!tag) return `${REDACTED}${tail}`;
  const rest = head.slice(tag[0].length);
  return `${tag[0]}${rest === '' || /^::(?:before|after)$/.test(rest) ? rest : ''}${tail}`;
}

function redactEntry(e: Entry): Entry {
  return { ...e, id: redactElementId(e.id), message: { en: redactMessage(e.message.en), fr: redactMessage(e.message.fr) } };
}

function redactRouteAudit(r: RouteAudit): RouteAudit {
  return { ...r, route: redactRoute(r.route), entries: r.entries.map(redactEntry) };
}

/** The redacted copy. The report given is not changed. */
export function redactReport(report: AuditReport): AuditReport {
  return {
    ...report,
    routes: report.routes.map(redactRouteAudit),
    ...(report.waived ? { waived: report.waived.map((w) => ({ ...w, route: redactRoute(w.route), entry: redactEntry(w.entry) })) } : {}),
  };
}

export interface RedactionCount {
  readonly messages: number;
  readonly routes: number;
  readonly ids: number;
}

/** How many messages, routes and element ids redaction changes. */
export function countRedactions(report: AuditReport): RedactionCount {
  let messages = 0;
  let ids = 0;
  let routes = 0;
  for (const r of report.routes) {
    if (redactRoute(r.route) !== r.route) routes++;
    for (const e of r.entries) {
      if (redactMessage(e.message.en) !== e.message.en || redactMessage(e.message.fr) !== e.message.fr) messages++;
      if (redactElementId(e.id) !== e.id) ids++;
    }
  }
  return { messages, routes, ids };
}

/** A note to put with a redacted report. */
export function describeRedaction(c: RedactionCount): { en: string; fr: string } {
  return {
    en: `Redacted for sharing: quoted page text removed from ${c.messages} ${c.messages === 1 ? 'message' : 'messages'}, the query or fragment removed from ${c.routes} ${c.routes === 1 ? 'route' : 'routes'}, id values removed from ${c.ids} ${c.ids === 1 ? 'element' : 'elements'}. Counts and statuses are unchanged. Route paths are kept, so read them before sharing.`,
    fr: `Expurgé pour le partage\u00A0: texte de page cité retiré de ${c.messages} ${c.messages < 2 ? 'message' : 'messages'}, requête ou fragment retiré de ${c.routes} ${c.routes < 2 ? 'route' : 'routes'}, valeurs d’identifiant retirées de ${c.ids} ${c.ids < 2 ? 'élément' : 'éléments'}. Les décomptes et les statuts sont inchangés. Les chemins des routes sont conservés\u00A0: relisez-les avant de partager.`,
  };
}
