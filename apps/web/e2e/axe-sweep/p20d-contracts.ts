/** Deterministic policies shared by the Playwright entrypoints and their tests. */
export type Language = "en" | "fr";
export type Confidence = "PASS" | "BLOCKED" | "UNKNOWN";
export type Severity = "error" | "warning";

export interface Finding {
  readonly rule: string;
  readonly url: string;
  readonly detail: string;
  readonly severity: Severity;
}

export interface EvidenceRow {
  readonly source: string | null;
  readonly licence: string | null;
  readonly date: string | null;
  readonly status: string | null;
  readonly label: string;
}

export interface LocaleRoute {
  readonly url: string;
  readonly language: Language;
  readonly key: string;
}

export interface FormField {
  readonly id: string;
  readonly kind: string;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly name: string;
  readonly label: string;
  readonly describedBy: readonly string[];
  readonly invalid: boolean;
  readonly hasError: boolean;
  readonly visible: boolean;
}

export interface ButtonInfo {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly role: string;
}

export interface AccessibleImage {
  readonly source: string;
  readonly decorative: boolean;
  readonly alternative: string | null;
  readonly hidden: boolean;
}

export interface LiveMessage {
  readonly role: string;
  readonly text: string;
  readonly polite: string | null;
  readonly relevant: string | null;
}

export interface LanguageLink {
  readonly href: string;
  readonly hreflang: string | null;
  readonly label: string;
  readonly rel: string;
}

const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0",
  "OGL-Canada-2.0", "OGL-Ontario-1.0",
]);

const DOWNLOAD = /\.(?:pdf|csv|json|geojson|gpx|zip|png|jpe?g|webp|avif|svg|woff2?|css|m?js|mp[34]|webm)$/i;
const TRACKING_KEYS = /^(?:utm_.+|gclid|fbclid|msclkid|ref|source)$/i;

export function finding(rule: string, url: string, detail: string): Finding {
  return { rule, url, detail, severity: "error" };
}

export function report(findings: readonly Finding[], max = 45): string {
  const unique = [...new Set(findings.map((f) =>
    `${f.rule} | ${f.url} | ${f.detail}`,
  ))];
  return [
    ...unique.slice(0, max),
    ...(unique.length > max ? [`${unique.length - max} more findings`] : []),
  ].join("\n");
}

export function languageOf(value: string | null): Language | null {
  const first = value?.trim().toLowerCase().split("-")[0];
  return first === "en" || first === "fr" ? first : null;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined || y < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d >= 1 && d <= (lengths[m - 1] ?? 0);
}

export function evidenceConfidence(value: EvidenceRow): Confidence {
  if (!value.source?.trim() || !value.licence?.trim() || !value.date?.trim()) return "UNKNOWN";
  if (!OPEN_LICENCES.has(value.licence) || !isCalendarDate(value.date)) return "UNKNOWN";
  if (value.status === "BLOCKED") return "BLOCKED";
  if (value.status === "PASS") return "PASS";
  return "UNKNOWN";
}

export function evidenceFindings(rows: readonly EvidenceRow[], url: string): Finding[] {
  const problems: Finding[] = [];
  for (const row of rows) {
    const result = evidenceConfidence(row);
    if (result === "UNKNOWN" && row.status === "PASS") {
      problems.push(finding("unsupported-positive-evidence", url, row.label));
    }
    if (result === "UNKNOWN" && row.status === "BLOCKED") {
      problems.push(finding("unsupported-barrier-evidence", url, row.label));
    }
    if (row.status !== null && !["PASS", "BLOCKED", "UNKNOWN"].includes(row.status)) {
      problems.push(finding("noncanonical-evidence-state", url, `${row.label}: ${row.status}`));
    }
  }
  return problems;
}

export function canonicalUrl(raw: string, base: string, origin: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return null;
    if (DOWNLOAD.test(url.pathname)) return null;
    if (/\/(?:logout|signout|delete|remove)(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_KEYS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}

export function logicalRoute(raw: string): string {
  const url = new URL(raw);
  const withoutLocale = url.pathname.replace(/^\/(?:en|fr)(?=\/|$)/i, "") || "/";
  const path = withoutLocale.replace(/\/$/, "") || "/";
  const search = new URLSearchParams(url.search);
  for (const key of [...search.keys()]) {
    if (["lang", "locale", "language"].includes(key.toLowerCase())) search.delete(key);
  }
  search.sort();
  return `${path}${search.size ? `?${search.toString()}` : ""}`;
}

export function localeParity(routes: readonly LocaleRoute[]): Finding[] {
  const byKey = new Map<string, Set<Language>>();
  for (const route of routes) {
    const bucket = byKey.get(route.key) ?? new Set<Language>();
    bucket.add(route.language);
    byKey.set(route.key, bucket);
  }
  const issues: Finding[] = [];
  for (const [key, languages] of byKey) {
    for (const language of ["en", "fr"] as const) {
      if (!languages.has(language)) {
        issues.push(finding("locale-route-missing", key, `${language} counterpart not discovered`));
      }
    }
  }
  return issues;
}

export function counterpartIssues(
  source: LocaleRoute,
  links: readonly LanguageLink[],
  origin: string,
): Finding[] {
  const target: Language = source.language === "en" ? "fr" : "en";
  const candidates = links.filter((item) => languageOf(item.hreflang) === target);
  if (candidates.length === 0) {
    return [finding("missing-language-alternate", source.url, target)];
  }
  const issues: Finding[] = [];
  for (const link of candidates) {
    const normalized = canonicalUrl(link.href, source.url, origin);
    if (!normalized) {
      issues.push(finding("invalid-language-alternate", source.url, link.href));
      continue;
    }
    if (logicalRoute(normalized) !== source.key) {
      issues.push(finding("language-alternate-route", source.url, normalized));
    }
  }
  return issues;
}

export function buttonFindings(buttons: readonly ButtonInfo[], url: string): Finding[] {
  const issues: Finding[] = [];
  for (const button of buttons) {
    if (!button.visible || !button.enabled) continue;
    if (!button.label.trim()) issues.push(finding("unnamed-control", url, button.role));
    if (button.width < 44 || button.height < 44) {
      issues.push(finding("touch-44", url,
        `${button.role} ${button.label}: ${button.width.toFixed(1)}x${button.height.toFixed(1)}`));
    }
  }
  return issues;
}

export function formFindings(fields: readonly FormField[], url: string): Finding[] {
  const issues: Finding[] = [];
  for (const field of fields) {
    if (!field.visible || field.disabled) continue;
    if (!field.label.trim()) issues.push(finding("field-label", url, field.id || field.kind));
    if (field.required && !field.name.trim()) {
      issues.push(finding("required-field-name", url, field.id || field.kind));
    }
    if (field.invalid && !field.hasError) {
      issues.push(finding("invalid-field-description", url, field.id || field.kind));
    }
  }
  return issues;
}

export function imageFindings(images: readonly AccessibleImage[], url: string): Finding[] {
  const problems: Finding[] = [];
  for (const image of images) {
    if (image.hidden || image.decorative) continue;
    if (image.alternative === null || !image.alternative.trim()) {
      problems.push(finding("image-alternative", url, image.source));
    }
  }
  return problems;
}

export function liveMessageFindings(messages: readonly LiveMessage[], url: string): Finding[] {
  const issues: Finding[] = [];
  for (const message of messages) {
    if (message.polite && !["polite", "assertive", "off"].includes(message.polite)) {
      issues.push(finding("invalid-live-priority", url, message.role));
    }
    if (message.role === "alert" && message.polite === "off") {
      issues.push(finding("silent-alert", url, message.text.slice(0, 60)));
    }
  }
  return issues;
}

export function ratio(foreground: readonly [number, number, number], background: readonly [number, number, number]): number {
  const luminance = (rgb: readonly number[]): number => {
    const linear = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function parseRgb(value: string): [number, number, number] | null {
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/.exec(value);
  if (!match) return null;
  const channels = match.slice(1).map(Number);
  if (channels.some((n) => n < 0 || n > 255)) return null;
  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0];
}

export interface MotionElement {
  readonly label: string;
  readonly animationSeconds: number;
  readonly transitionSeconds: number;
  readonly visible: boolean;
}

export function motionFindings(elements: readonly MotionElement[], url: string): Finding[] {
  return elements.filter((e) => e.visible && (e.animationSeconds > 0.1 || e.transitionSeconds > 0.1))
    .map((e) => finding("reduced-motion-not-respected", url,
      `${e.label}: ${e.animationSeconds}s animation; ${e.transitionSeconds}s transition`));
}

export interface NetworkAttempt {
  readonly url: string;
  readonly method: string;
  readonly type: string;
}

const TILE_HOST = /(?:^|\.)(?:tile\.openstreetmap\.org|tile\.openstreetmap\.fr|basemaps\.cartocdn\.com|api\.mapbox\.com|tiles\.stadiamaps\.com|tile\.thunderforest\.com|maps\.googleapis\.com)$/i;

export function externalTileFindings(attempts: readonly NetworkAttempt[], origin: string): Finding[] {
  const problems: Finding[] = [];
  for (const attempt of attempts) {
    try {
      const uri = new URL(attempt.url);
      if (uri.origin !== origin && TILE_HOST.test(uri.hostname)) {
        problems.push(finding("external-tile-request", attempt.url, attempt.type));
      }
    } catch {
      problems.push(finding("invalid-network-url", origin, attempt.url));
    }
  }
  return problems;
}

export interface TabStep {
  readonly key: string;
  readonly visible: boolean;
  readonly outline: string;
  readonly inViewport: boolean;
  readonly disabled: boolean;
}

export function tabFindings(steps: readonly TabStep[], url: string): Finding[] {
  const errors: Finding[] = [];
  const visited = new Set<string>();
  for (const step of steps) {
    if (step.disabled || !step.visible || !step.inViewport) {
      errors.push(finding("tab-hidden", url, step.key));
    }
    if (step.outline === "none") {
      errors.push(finding("tab-indicator-missing", url, step.key));
    }
    if (visited.has(step.key)) {
      errors.push(finding("tab-cycle", url, step.key));
    }
    visited.add(step.key);
  }
  return errors;
}

export function frenchTypographyFindings(text: string, url: string): Finding[] {
  const problems: Finding[] = [];
  const colon = /\S :(?!\/)/g;
  const narrow = /\S[;!?]/g;
  const quotes = /«(?!\u202f)|(?<!\u202f)»/g;
  if (colon.test(text)) problems.push(finding("fr-colon-spacing", url, "Use U+00A0 before colon"));
  if (narrow.test(text)) problems.push(finding("fr-punctuation-spacing", url, "Use U+202F before ; ! ?"));
  if (quotes.test(text)) problems.push(finding("fr-guillemet-spacing", url, "Use U+202F inside guillemets"));
  return problems;
}
