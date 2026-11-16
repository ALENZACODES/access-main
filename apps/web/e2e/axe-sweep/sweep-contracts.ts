/** Pure contracts shared by the Playwright route, interaction and offline sweeps. */
export type Locale = "en" | "fr";
export type Knowledge = "PASS" | "BLOCKED" | "UNKNOWN";

export interface RouteRecord {
  readonly url: string;
  readonly locale: Locale;
  readonly key: string;
  readonly title: string;
  readonly mainCount: number;
  readonly headingCount: number;
}

export interface TargetGeometry {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly area: number;
  readonly exemptInline: boolean;
}

export interface Issue {
  readonly code: string;
  readonly location: string;
  readonly detail: string;
}

export interface LocalizedText {
  readonly en: string;
  readonly fr: string;
}

export const COPY = {
  missingLocale: {
    en: "A page language is missing.",
    fr: "La langue de la page est manquante.",
  },
  offlineUnavailable: {
    en: "This page is unavailable offline.",
    fr: "Cette page n’est pas disponible hors ligne.",
  },
  unknown: { en: "Unknown", fr: "Inconnu" },
} as const satisfies Record<string, LocalizedText>;

const ASSET_EXTENSION = /\.(?:pdf|zip|json|geojson|csv|txt|jpe?g|png|gif|webp|avif|svg|ico|mjs|js|css|map|woff2?|otf|ttf|mp4|webm|mp3|wav)$/i;
const ALLOWED_PARAMS = new Set(["lang", "locale", "language"]);

export function localeFromLang(lang: string | null): Locale | null {
  if (lang === null) return null;
  const primary = lang.trim().toLowerCase().split("-")[0];
  return primary === "en" || primary === "fr" ? primary : null;
}

export function parseAbsoluteUrl(raw: string, base: string): URL | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export function isCrawlableUrl(url: URL, origin: string): boolean {
  return url.origin === origin && !ASSET_EXTENSION.test(url.pathname);
}

/** Keep meaningful language switches, discard trackers and fragment anchors. */
export function normalizeCrawlUrl(url: URL): string {
  const next = new URL(url.href);
  next.hash = "";
  for (const key of [...next.searchParams.keys()]) {
    if (!ALLOWED_PARAMS.has(key.toLowerCase())) next.searchParams.delete(key);
  }
  next.searchParams.sort();
  return next.href;
}

export function normalizeCrawlLinks(
  hrefs: readonly string[],
  current: string,
  origin: string,
): string[] {
  const output = new Set<string>();
  for (const href of hrefs) {
    const parsed = parseAbsoluteUrl(href, current);
    if (parsed && isCrawlableUrl(parsed, origin)) {
      output.add(normalizeCrawlUrl(parsed));
    }
  }
  return [...output].sort();
}

/** A query-based or path-based locale prefix gets the same logical key. */
export function routeKey(raw: string): string {
  const url = new URL(raw);
  const path = url.pathname.replace(/^\/(en|fr)(?=\/|$)/i, "") || "/";
  const normal = path.replace(/\/$/, "") || "/";
  return normal;
}

export function seedRoutes(baseURL: string, configured: Partial<Record<Locale, string>>): string[] {
  const base = new URL(baseURL);
  const candidates = [
    new URL("/", base).href,
    new URL("/en", base).href,
    new URL("/fr", base).href,
    new URL("/?lang=en", base).href,
    new URL("/?lang=fr", base).href,
    ...(["en", "fr"] as const).flatMap((lang) =>
      configured[lang] ? [new URL(configured[lang], base).href] : [],
    ),
  ];
  return [...new Set(candidates.map((url) => normalizeCrawlUrl(new URL(url))))];
}

export interface CrawlResult {
  readonly visited: readonly string[];
  readonly unavailable: readonly string[];
  readonly discovered: readonly string[];
  readonly exceeded: boolean;
}

/** Deterministic bounded queue; a hard cap must be reported, not hidden. */
export class CrawlQueue {
  private readonly pending: string[] = [];
  private readonly queued = new Set<string>();
  private readonly visited = new Set<string>();
  private readonly unavailable = new Set<string>();
  private exceeded = false;

  constructor(private readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("Crawl limit must be a positive integer");
    }
  }

  add(urls: readonly string[]): void {
    for (const url of urls) {
      if (this.queued.has(url)) continue;
      if (this.queued.size >= this.limit) {
        this.exceeded = true;
        continue;
      }
      this.queued.add(url);
      this.pending.push(url);
    }
  }

  next(): string | null {
    const next = this.pending.shift();
    if (next === undefined) return null;
    this.visited.add(next);
    return next;
  }

  markUnavailable(url: string): void {
    this.unavailable.add(url);
  }

  summary(): CrawlResult {
    return {
      visited: [...this.visited],
      unavailable: [...this.unavailable],
      discovered: [...this.queued],
      exceeded: this.exceeded,
    };
  }
}

export function accessibleTarget(geometry: TargetGeometry): boolean {
  if (geometry.exemptInline) return true;
  return geometry.width >= 44 && geometry.height >= 44;
}

/** WCAG 2.2 AA target-size floor is 24px; this project enforces 44px. */
export function targetIssues(
  targets: readonly TargetGeometry[],
  location: string,
): Issue[] {
  return targets.flatMap((target) =>
    accessibleTarget(target)
      ? []
      : [{
          code: "target-44",
          location,
          detail: `${target.label}: ${target.width.toFixed(1)} × ${target.height.toFixed(1)} px`,
        }],
  );
}

export interface FocusStep {
  readonly identifier: string;
  readonly inDocument: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
}

export function focusIssues(steps: readonly FocusStep[], location: string): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.inDocument || !step.visible || step.disabled) {
      issues.push({ code: "focus-hidden", location, detail: step.identifier });
    }
    if (seen.has(step.identifier)) {
      issues.push({ code: "focus-cycle", location, detail: step.identifier });
    }
    seen.add(step.identifier);
  }
  return issues;
}

export function routeRecordIssues(records: readonly RouteRecord[]): Issue[] {
  const issues: Issue[] = [];
  const locales = new Set(records.map((record) => record.locale));
  for (const locale of ["en", "fr"] as const) {
    if (!locales.has(locale)) {
      issues.push({ code: "locale-absent", location: "/", detail: locale });
    }
  }
  for (const record of records) {
    if (record.mainCount !== 1) {
      issues.push({
        code: "main-landmark",
        location: record.url,
        detail: `Expected one main landmark, received ${record.mainCount}`,
      });
    }
    if (record.headingCount === 0) {
      issues.push({ code: "heading-missing", location: record.url, detail: record.locale });
    }
    if (!record.title.trim()) {
      issues.push({ code: "title-missing", location: record.url, detail: record.locale });
    }
  }
  return issues;
}

/** Only compare route identities; text translations cannot be judged by equality. */
export function routeParityIssues(records: readonly RouteRecord[]): Issue[] {
  const byKey = new Map<string, Set<Locale>>();
  for (const record of records) {
    const present = byKey.get(record.key) ?? new Set<Locale>();
    present.add(record.locale);
    byKey.set(record.key, present);
  }
  const issues: Issue[] = [];
  for (const [key, locales] of byKey) {
    // A route may intentionally exist only in one locale. Its counterpart
    // is UNKNOWN, never fabricated or silently declared missing content.
    if (locales.size < 2) {
      issues.push({ code: "parity-unknown", location: key, detail: [...locales][0] ?? "none" });
    }
  }
  return issues;
}

export interface Provenance {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_LICENCES = new Set(["CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-Ontario-1.0"]);

export function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= (days[month - 1] ?? 0);
}

export function provenanceStatus(value: Partial<Provenance> | null): Knowledge {
  if (!value || !value.source?.trim() || !value.licence || !value.date) return "UNKNOWN";
  if (!OPEN_LICENCES.has(value.licence) || !isCalendarDate(value.date)) return "UNKNOWN";
  return "PASS";
}

export function mergeKnowledge(items: readonly Knowledge[]): Knowledge {
  if (items.length === 0) return "UNKNOWN";
  if (items.includes("BLOCKED")) return "BLOCKED";
  if (items.includes("UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function compactIssues(issues: readonly Issue[], cap = 30): string {
  const unique = new Set(issues.map((issue) =>
    `${issue.code} @ ${issue.location}: ${issue.detail}`,
  ));
  const lines = [...unique];
  return [
    ...lines.slice(0, cap),
    ...(lines.length > cap ? [`… ${lines.length - cap} additional issue(s)`] : []),
  ].join("\n");
}
