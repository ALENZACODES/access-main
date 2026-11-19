import { type Lang } from './types.js';

/**
 * Reads a robots.txt that is already in hand, to learn two things before an
 * audit: where the sitemaps are, and which paths the site asks automated
 * visitors to stay out of. It follows the Robots Exclusion Protocol
 * (RFC 9309, September 2022): groups of user-agent lines, allow and disallow
 * rules, the longest matching rule wins, and allow wins a tie. Nothing is
 * fetched here.
 */

export const ROBOTS_REFERENCE = {
  id: 'rfc9309',
  title: 'RFC 9309: Robots Exclusion Protocol',
  url: 'https://www.rfc-editor.org/rfc/rfc9309',
  date: '2022-09',
  licence: 'IETF Trust Legal Provisions',
} as const;

export interface RobotsRule {
  readonly allow: boolean;
  readonly path: string;
}

export interface RobotsGroup {
  /** Product tokens in lower case. `*` is the group for everyone else. */
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
}

export interface Robots {
  readonly groups: readonly RobotsGroup[];
  /** Sitemap addresses, as written. */
  readonly sitemaps: readonly string[];
  /** Lines that are neither a known field nor a comment. They are ignored, as the protocol asks. */
  readonly ignored: number;
}

export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  const sitemaps: string[] = [];
  let ignored = 0;
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;

  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n|\r/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon < 1) {
      ignored++;
      continue;
    }
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false;
      if (!current) {
        ignored++;
        continue;
      }
      // An empty path matches nothing, so the rule has no effect.
      if (value !== '') current.rules.push({ allow: field === 'allow', path: value });
      continue;
    }
    if (field === 'sitemap') {
      if (value !== '') sitemaps.push(value);
      continue;
    }
    lastWasAgent = false;
    ignored++;
  }
  return { groups, sitemaps: [...new Set(sitemaps)], ignored };
}

/** The rules that apply to one user agent: every group that names it, or else every `*` group. */
export function rulesFor(robots: Robots, agent: string): RobotsRule[] {
  const token = agent.trim().toLowerCase();
  const named = robots.groups.filter((g) => token !== '' && token !== '*' && g.agents.includes(token));
  const use = named.length > 0 ? named : robots.groups.filter((g) => g.agents.includes('*'));
  return use.flatMap((g) => [...g.rules]);
}

/** True when a rule path matches a route. `*` stands for any characters and a final `$` for the end of the route. */
export function ruleMatches(rulePath: string, route: string): boolean {
  const anchored = rulePath.endsWith('$');
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(route);
}

/**
 * True when the route may be visited by the agent. The longest matching rule
 * decides, an allow rule wins against a disallow rule of the same length, and
 * a route no rule matches may be visited. `/robots.txt` itself always may.
 * The fragment of a hash route is not part of the match.
 */
export function isAllowed(robots: Robots, agent: string, route: string): boolean {
  const target = route.split('#')[0] ?? '';
  if (target === '/robots.txt') return true;
  let best: RobotsRule | null = null;
  for (const rule of rulesFor(robots, agent)) {
    if (!ruleMatches(rule.path, target)) continue;
    if (best === null || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow && !best.allow)) best = rule;
  }
  return best === null || best.allow;
}

export interface RobotsSplit {
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
}

/** Sorts routes into those the agent may visit and those the site asks it to leave alone. */
export function splitByRobots(robots: Robots, agent: string, routes: readonly string[]): RobotsSplit {
  const allowed: string[] = [];
  const disallowed: string[] = [];
  for (const r of routes) (isAllowed(robots, agent, r) ? allowed : disallowed).push(r);
  return { allowed, disallowed };
}

/** One or two sentences on what the file asks of the agent for a list of routes. */
export function describeRobots(robots: Robots, agent: string, routes: readonly string[], lang: Lang): string {
  const { disallowed } = splitByRobots(robots, agent, routes);
  const fr = lang === 'fr';
  const maps = robots.sitemaps.length;
  const first = fr ? `Le fichier robots.txt nomme ${maps} plan(s) du site.` : `The robots.txt file names ${maps} sitemap(s).`;
  if (disallowed.length === 0) {
    return `${first} ${fr ? `Aucune des ${routes.length} route(s) n’est exclue pour l’agent ${agent}.` : `None of the ${routes.length} route(s) is excluded for the agent ${agent}.`}`;
  }
  return `${first} ${
    fr
      ? `${disallowed.length} route(s) sur ${routes.length} sont exclues pour l’agent ${agent}. Le fichier exprime une demande du site${'\u00A0'}: il ne bloque rien par lui-même.`
      : `${disallowed.length} of ${routes.length} route(s) are excluded for the agent ${agent}. The file states what the site asks: it blocks nothing by itself.`
  }`;
}
