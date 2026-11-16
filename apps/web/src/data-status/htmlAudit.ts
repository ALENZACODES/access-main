/**
 * Static checks for rendered HTML. Runs in tests over every page and fragment the
 * folder produces, so an accessibility or markup regression fails the build.
 * It checks structure it can see in the markup; it does not replace testing with
 * assistive technology.
 */
export type HtmlProblemCode =
  | 'missing-lang'
  | 'bad-lang'
  | 'missing-title'
  | 'missing-viewport'
  | 'missing-main'
  | 'missing-skip-link'
  | 'missing-h1'
  | 'multiple-h1'
  | 'heading-skip'
  | 'duplicate-id'
  | 'unlabelled-control'
  | 'table-without-caption'
  | 'th-without-scope'
  | 'scroll-region-not-operable'
  | 'bad-time'
  | 'small-target'
  | 'positive-tabindex'
  | 'outline-removed'
  | 'vague-link-text'
  | 'img-without-alt'
  | 'target-blank-without-noopener'
  | 'inline-event-handler'
  | 'javascript-url'
  | 'empty-button';

export interface HtmlProblem {
  code: HtmlProblemCode;
  detail: string;
}

export interface HtmlAuditOptions {
  /** Treat the input as a complete document (checks lang, title, viewport, landmarks, h1). Default: auto-detect. */
  document?: boolean;
}

const VAGUE = /^(here|click here|more|read more|link|ici|cliquez ici|lire la suite|plus|lien)$/i;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function visible(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function auditHtml(html: string, opts: HtmlAuditOptions = {}): HtmlProblem[] {
  const out: HtmlProblem[] = [];
  const add = (code: HtmlProblemCode, detail: string) => out.push({ code, detail });
  const isDoc = opts.document ?? /<html[\s>]/i.test(html);

  if (isDoc) {
    const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0] ?? '';
    const lang = /\blang="([^"]*)"/.exec(htmlTag)?.[1];
    if (lang === undefined) add('missing-lang', htmlTag);
    else if (!LANG.test(lang)) add('bad-lang', lang);
    const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    if (title === undefined || title.trim() === '') add('missing-title', '');
    if (!/<meta[^>]*name="viewport"[^>]*>/i.test(html)) add('missing-viewport', '');
    if (!/<main\b/i.test(html)) add('missing-main', '');
    const firstLink = /<a\b[^>]*>/i.exec(html)?.[0] ?? '';
    if (!/href="#[^"]+"/.test(firstLink)) add('missing-skip-link', firstLink);
    const h1 = (html.match(/<h1\b/gi) ?? []).length;
    if (h1 === 0) add('missing-h1', '');
    if (h1 > 1) add('multiple-h1', String(h1));
  }

  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! - levels[i - 1]! > 1) add('heading-skip', `h${levels[i - 1]} -> h${levels[i]}`);
  }

  const seen = new Set<string>();
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    const id = m[1] as string;
    if (seen.has(id)) add('duplicate-id', id);
    seen.add(id);
  }

  for (const m of html.matchAll(/<(select|input|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/type="(hidden|submit|button)"/.test(tag)) continue;
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const aria = /\baria-label(ledby)?="[^"]+"/.test(tag);
    const labelled =
      aria ||
      (id !== undefined && (html.includes(`for="${id}"`) || new RegExp(`<label\\b[^>]*>(?:(?!</label>)[\\s\\S])*?id="${id}"`).test(html)));
    if (!labelled) add('unlabelled-control', tag);
  }

  const tables = (html.match(/<table\b/gi) ?? []).length;
  const captions = (html.match(/<caption>/gi) ?? []).length;
  if (tables > captions) add('table-without-caption', String(tables - captions));
  for (const m of html.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/gi)) add('th-without-scope', m[0]);

  for (const m of html.matchAll(/<div class="ds-scroll"[^>]*>/g)) {
    if (!/tabindex="0"/.test(m[0]) || !/aria-label="[^"]+"/.test(m[0]) || !/role="region"/.test(m[0])) {
      add('scroll-region-not-operable', m[0]);
    }
  }
  for (const m of html.matchAll(/<time\b[^>]*>/g)) {
    if (!/datetime="\d{4}-\d{2}-\d{2}"/.test(m[0])) add('bad-time', m[0]);
  }

  for (const m of html.matchAll(/<(a|button|select|input)\b[^>]*>/gi)) {
    const tag = m[0];
    if (/class="ds-skip"/.test(tag) || /type="(checkbox|hidden)"/.test(tag)) continue;
    if (!/min-height:\s*44px/.test(tag)) add('small-target', tag);
  }
  for (const m of html.matchAll(/\btabindex="(\d+)"/g)) {
    if (Number(m[1]) > 0) add('positive-tabindex', m[0]);
  }
  if (/outline:\s*(none|0)\b/i.test(html)) add('outline-removed', '');

  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = visible(m[1] ?? '');
    if (VAGUE.test(text)) add('vague-link-text', text);
    if (/target="_blank"/.test(m[0]) && !/rel="[^"]*noopener[^"]*"/.test(m[0])) add('target-blank-without-noopener', m[0]);
    if (/href="\s*javascript:/i.test(m[0])) add('javascript-url', m[0]);
  }
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    if (visible(m[1] ?? '') === '' && !/aria-label="[^"]+"/.test(m[0])) add('empty-button', m[0]);
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt="/.test(m[0])) add('img-without-alt', m[0]);
  }
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+=/gi)) add('inline-event-handler', m[0]);

  return out;
}

/** One line per problem, for assertion messages. */
export function describeProblems(problems: readonly HtmlProblem[]): string[] {
  return problems.map((p) => (p.detail ? `${p.code}: ${p.detail}` : p.code));
}
