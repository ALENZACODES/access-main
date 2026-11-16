// Repository rules as code. Each rule scans file text and reports where it
// breaks. Exceptions must be listed with a reason and a date, and an exception
// that no longer matches a file is itself reported, so the list cannot rot.

import { auditCsp } from "../panel/csp";
import { lintCopy } from "../panel/copyLint";
import { NAME_HASHES, type NameHash } from "./nameHashes";
import { sha256Hex } from "./sha256";

export type RuleId =
  | "forbidden-name"
  | "third-party-tiles"
  | "tracker-host"
  | "secret"
  | "insecure-url"
  | "scheduled-workflow"
  | "claim-wording"
  | "weak-csp"
  | "stale-exemption"
  | "bad-exemption";

export interface SourceFile {
  /** Path relative to the repo root, with forward slashes. */
  path: string;
  text: string;
}

export interface Finding {
  rule: RuleId;
  path: string;
  line: number;
  detail: string;
}

export interface Exemption {
  /** Exact repo-relative path. */
  path: string;
  rule: Exclude<RuleId, "stale-exemption" | "bad-exemption">;
  reason: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

/** Lines where a listed name appears, found by hashing words rather than matching text. */
export function nameFindings(text: string, names: readonly NameHash[] = NAME_HASHES): Array<{ line: number; token: string }> {
  const found: Array<{ line: number; token: string }> = [];
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ value: m[0].toLowerCase(), index: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const add = (index: number, token: string): void => {
    found.push({ line: lineOf(text, index), token });
  };
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === undefined) continue;
    for (const n of names) {
      if (n.words === 1 && w.value.length === n.length && sha256Hex(w.value) === n.hash) add(w.index, w.value);
      if (n.insideWord === true && w.value.length > n.length) {
        for (let k = 0; k + n.length <= w.value.length; k += 1) {
          if (sha256Hex(w.value.slice(k, k + n.length)) === n.hash) add(w.index + k, w.value);
        }
      }
      if (n.words > 1 && i + n.words <= words.length) {
        const run = words.slice(i, i + n.words);
        const spaced = run.every((x, k) => k === 0 || /^\s+$/.test(text.slice((run[k - 1] as { end: number }).end, x.index)));
        const joined = run.map((x) => x.value).join(" ");
        if (spaced && joined.length === n.length && sha256Hex(joined) === n.hash) add(w.index, "name of an outside organisation");
      }
    }
  }
  return found;
}

const TILE_HOSTS: readonly RegExp[] = [
  /(?:^|[./])tile\.openstreetmap\.(?:org|fr)\b/i,
  /\btile\.thunderforest\.com\b/i,
  /\bapi\.mapbox\.com\b/i,
  /\bapi\.maptiler\.com\b/i,
  /\btiles\.stadiamaps\.com\b/i,
  /\bbasemaps\.cartocdn\.com\b/i,
  /\bmaps\.googleapis\.com\b/i,
  /\bmt[0-3]\.google\.com\b/i,
  /\bserver\.arcgisonline\.com\b/i,
  /\bapi\.here\.com\b/i,
];

const TRACKER_HOSTS: readonly RegExp[] = [
  /\bgoogle-analytics\.com\b/i,
  /\bgoogletagmanager\.com\b/i,
  /\bdoubleclick\.net\b/i,
  /\bconnect\.facebook\.net\b/i,
  /\bhotjar\.com\b/i,
  /\bmixpanel\.com\b/i,
  /\bsegment\.io\b/i,
  /\bfullstory\.com\b/i,
  /\bclarity\.ms\b/i,
  /\bamplitude\.com\b/i,
];

const SECRET_PATTERNS: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /AKIA[0-9A-Z]{16}/, why: "AWS access key id" },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, why: "private key block" },
  { re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}/, why: "live payment key" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}/, why: "GitHub token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, why: "Slack token" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, why: "Google API key" },
  {
    re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{20,}["']/i,
    why: "credential assigned to a literal",
  },
];

// Hosts that appear in plain http:// only as XML namespace identifiers, never fetched.
const HTTP_OK = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|www\.w3\.org\/|www\.sitemaps\.org\/)/i;

/** The Content-Security-Policy a file sets, if it sets one: an HTML meta tag, a _headers line, JSON or TOML. */
export function extractCsp(f: SourceFile): { policy: string; delivery: "header" | "meta" } | null {
  if (/\.html?$/i.test(f.path)) {
    const m = /<meta\s+[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i.exec(f.text);
    const c = m === null ? null : /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(m[0]);
    const v = c?.[1] ?? c?.[2];
    return v === undefined ? null : { policy: v.replace(/&amp;/g, "&").replace(/&quot;/g, '"'), delivery: "meta" };
  }
  const line = /^[ \t]*Content-Security-Policy[ \t]*[:=][ \t]*"?([^"\n]+)"?[ \t]*,?[ \t]*$/im.exec(f.text);
  if (line?.[1] !== undefined) return { policy: line[1].trim(), delivery: "header" };
  const json = /"Content-Security-Policy"\s*,?\s*"value"\s*:\s*"([^"]+)"|"Content-Security-Policy"\s*:\s*"([^"]+)"/i.exec(f.text);
  const j = json?.[1] ?? json?.[2];
  return j === undefined ? null : { policy: j, delivery: "header" };
}

const COPY_FILE = /(?:^|\/)(?:[^/]*\.)?(?:copy|strings|messages|locales?|i18n|translations?)(?:\.[^/]*)?\.(?:ts|tsx|js|jsx|json)$/i;
const SCRIPT_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|html|css|md|ya?ml)$/i;
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/i;
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

function lineOf(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

function scanPatterns(
  out: Finding[],
  f: SourceFile,
  rule: RuleId,
  patterns: ReadonlyArray<{ re: RegExp; why: string }>,
): void {
  for (const { re, why } of patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of f.text.matchAll(g)) {
      out.push({ rule, path: f.path, line: lineOf(f.text, m.index ?? 0), detail: `${why}: ${m[0].slice(0, 60)}` });
    }
  }
}

export function scanFile(f: SourceFile): Finding[] {
  const out: Finding[] = [];
  if (SCRIPT_FILE.test(f.path)) {
    for (const n of nameFindings(f.text)) out.push({ rule: "forbidden-name", path: f.path, line: n.line, detail: `outside organisation name: ${n.token.slice(0, 60)}` });
    scanPatterns(out, f, "third-party-tiles", TILE_HOSTS.map((re) => ({ re, why: "third-party tile or map host" })));
    scanPatterns(out, f, "tracker-host", TRACKER_HOSTS.map((re) => ({ re, why: "analytics or tracking host" })));
    scanPatterns(out, f, "secret", SECRET_PATTERNS);
    for (const m of f.text.matchAll(/http:\/\/[^\s"'`)<>]+/gi)) {
      if (!HTTP_OK.test(m[0])) {
        out.push({ rule: "insecure-url", path: f.path, line: lineOf(f.text, m.index ?? 0), detail: `plain http: ${m[0].slice(0, 60)}` });
      }
    }
  }
  if (/\.(?:html?|json|toml)$/i.test(f.path) || /(?:^|\/)_headers$/.test(f.path)) {
    const csp = extractCsp(f);
    if (csp !== null) {
      for (const p of auditCsp(csp.policy, { delivery: csp.delivery })) {
        out.push({ rule: "weak-csp", path: f.path, line: 1, detail: `${p.code}: ${p.detail}` });
      }
    }
  }
  if (WORKFLOW_FILE.test(f.path)) {
    for (const m of f.text.matchAll(/^[ \t]*(?:-[ \t]*)?(?:cron|schedule)[ \t]*:/gm)) {
      out.push({ rule: "scheduled-workflow", path: f.path, line: lineOf(f.text, m.index ?? 0), detail: "workflows must not run on a schedule" });
    }
  }
  if (COPY_FILE.test(f.path) && !/\.(?:test|spec)\./.test(f.path)) {
    for (const m of f.text.matchAll(STRING_LITERAL)) {
      const body = m[2] ?? "";
      if (body.length < 3) continue;
      for (const loc of ["en", "fr"] as const) {
        for (const i of lintCopy(loc, body)) {
          if (i.code !== "banned-term") continue;
          out.push({ rule: "claim-wording", path: f.path, line: lineOf(f.text, m.index ?? 0), detail: `${i.message} (${loc})` });
        }
      }
    }
  }
  return out;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function auditFiles(files: readonly SourceFile[], exemptions: readonly Exemption[] = []): Finding[] {
  const out: Finding[] = [];
  const paths = new Set(files.map((f) => f.path));
  const seen = new Set<string>();
  const used = new Set<string>();

  for (const e of exemptions) {
    const key = `${e.path}|${e.rule}`;
    if (e.reason.trim().length < 10 || !validDate(e.recordedOn) || seen.has(key)) {
      out.push({
        rule: "bad-exemption",
        path: e.path,
        line: 0,
        detail: seen.has(key) ? "listed twice" : "needs a reason of at least 10 characters and a YYYY-MM-DD date",
      });
    }
    seen.add(key);
    if (!paths.has(e.path)) {
      out.push({ rule: "stale-exemption", path: e.path, line: 0, detail: `no scanned file at this path (rule ${e.rule})` });
    }
  }

  for (const f of files) {
    for (const finding of scanFile(f)) {
      const hit = exemptions.find((e) => e.path === f.path && e.rule === finding.rule);
      if (hit === undefined) out.push(finding);
      else used.add(`${hit.path}|${hit.rule}`);
    }
  }
  for (const e of exemptions) {
    if (paths.has(e.path) && !used.has(`${e.path}|${e.rule}`)) {
      out.push({ rule: "stale-exemption", path: e.path, line: 0, detail: `file no longer breaks rule ${e.rule}; remove the exemption` });
    }
  }
  return out;
}

export function formatFindings(findings: readonly Finding[]): string {
  return findings.map((f) => `${f.rule} ${f.path}${f.line > 0 ? `:${f.line}` : ""} ${f.detail}`).join("\n");
}
