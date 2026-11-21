/**
 * P20E pure contract checks. DOM collection lives in p20e-browser.ts.
 * Findings are intentionally structured so the e2e runner can fail CI.
 */
export type Locale = "en" | "fr";
export type Knowledge = "PASS" | "BLOCKED" | "UNKNOWN";
export type Importance = "error" | "warning";
export interface Problem {
  readonly rule: string;
  readonly page: string;
  readonly target: string;
  readonly explanation: string;
  readonly importance: Importance;
}
export interface AuditContext {
  readonly page: string;
  readonly locale: Locale;
}
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface Interactive {
  readonly key: string;
  readonly role: string;
  readonly name: string;
  readonly tag: string;
  readonly href: string | null;
  readonly disabled: boolean;
  readonly hidden: boolean;
  readonly rect: Rect;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  readonly touchAction: string;
  readonly position: string;
  readonly zIndex: number;
  readonly hasClickHandler: boolean;
  readonly tabIndex: number;
}
export interface BilingualContent {
  readonly id: string;
  readonly locale: Locale;
  readonly text: string;
  readonly ariaLabel: string | null;
  readonly title: string | null;
}
export interface StatusRecord {
  readonly id: string;
  readonly status: string | null;
  readonly source: string | null;
  readonly licence: string | null;
  readonly observedAt: string | null;
  readonly expiresAt: string | null;
  readonly collectedAt: string | null;
  readonly text: string;
}
export interface FormControl {
  readonly id: string;
  readonly type: string;
  readonly role: string;
  readonly name: string;
  readonly label: string;
  readonly required: boolean;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly visible: boolean;
  readonly description: string;
  readonly errorId: string | null;
  readonly value: string;
  readonly autocomplete: string | null;
}
export interface LiveRegion {
  readonly id: string;
  readonly role: string;
  readonly live: string | null;
  readonly atomic: string | null;
  readonly relevant: string | null;
  readonly text: string;
  readonly hidden: boolean;
}
export interface DocumentMetadata {
  readonly url: string;
  readonly lang: string;
  readonly title: string;
  readonly direction: string;
  readonly headings: readonly { level: number; text: string; hidden: boolean }[];
  readonly mainCount: number;
  readonly landmarks: readonly { role: string; name: string }[];
  readonly viewportWidth: number;
  readonly documentWidth: number;
  readonly horizontalOverflow: number;
  readonly bodyScrollLocked: boolean;
  readonly viewportMeta: string | null;
}
export interface MediaNode {
  readonly id: string;
  readonly kind: "img" | "svg" | "canvas" | "video" | "audio";
  readonly alt: string | null;
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly describedBy: string | null;
  readonly hasCaptions: boolean;
  readonly hasTranscript: boolean;
  readonly isDecorative: boolean;
  readonly hidden: boolean;
}
export interface NavigationLink {
  readonly id: string;
  readonly href: string;
  readonly text: string;
  readonly lang: string | null;
  readonly hreflang: string | null;
  readonly current: string | null;
  readonly hidden: boolean;
}
export interface NetworkResource {
  readonly url: string;
  readonly type: string;
  readonly initiator: string;
  readonly status: number | null;
  readonly failure: string | null;
}
export interface FocusFrame {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly rect: Rect;
  readonly viewport: Rect;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  readonly ringColor: string;
  readonly isVisible: boolean;
  readonly ariaHidden: boolean;
  readonly inert: boolean;
  readonly disabled: boolean;
}
export interface LocalizedPair {
  readonly key: string;
  readonly en: string | null;
  readonly fr: string | null;
}
export interface OfflineState {
  readonly url: string;
  readonly locale: Locale;
  readonly title: string;
  readonly lang: string;
  readonly mainText: string;
  readonly links: readonly string[];
  readonly statuses: readonly StatusRecord[];
  readonly serviceWorkerControlled: boolean;
  readonly storageKeys: readonly string[];
}
const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "ODbL-1.0",
  "OGL-Canada-2.0", "OGL-Ontario-1.0", "OGL-Ontario-2.0",
]);
const BAD_STATUS = /^(?:yes|no|true|false|accessible|inaccessible|open|closed)$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RESOURCES = /(?:^|\/)(?:tiles?|mapbox|maptiler|openstreetmap|cartodb|stadiamaps|thunderforest)(?:\/|\.|$)/i;

export function problem(rule: string, ctx: AuditContext, target: string, explanation: string): Problem {
  return { rule, page: ctx.page, target, explanation, importance: "error" };
}
export function isDay(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const primary = value.toLowerCase().trim().split("-")[0];
  return primary === "en" || primary === "fr" ? primary : null;
}
export function knowledge(value: string | null | undefined): Knowledge {
  return value === "PASS" || value === "BLOCKED" ? value : "UNKNOWN";
}
export function joinKnowledge(values: readonly Knowledge[]): Knowledge {
  if (values.length === 0) return "UNKNOWN";
  if (values.includes("BLOCKED")) return "BLOCKED";
  if (values.includes("UNKNOWN")) return "UNKNOWN";
  return "PASS";
}
export function safeStatus(record: StatusRecord, asOf: string): Knowledge {
  const current = knowledge(record.status);
  if (current === "UNKNOWN") return current;
  if (!isDay(record.observedAt) || !isDay(asOf)) return "UNKNOWN";
  if (!record.source?.trim() || !OPEN_LICENCES.has(record.licence ?? "")) return "UNKNOWN";
  if (record.observedAt > asOf) return "UNKNOWN";
  if (record.expiresAt !== null) {
    if (!isDay(record.expiresAt) || record.expiresAt < asOf) return "UNKNOWN";
    if (record.expiresAt < record.observedAt) return "UNKNOWN";
  }
  return current;
}
export function evidenceProblems(rows: readonly StatusRecord[], ctx: AuditContext, asOf: string): Problem[] {
  const result: Problem[] = [];
  for (const item of rows) {
    const id = item.id || "unnamed-evidence";
    if (BAD_STATUS.test(item.status ?? "")) {
      result.push(problem("evidence-enum", ctx, id, "A supported state must use PASS, BLOCKED or UNKNOWN."));
    }
    if (item.status !== null && !["PASS", "BLOCKED", "UNKNOWN"].includes(item.status)) {
      result.push(problem("evidence-status", ctx, id, "An unrecognized state must be presented as UNKNOWN."));
    }
    if (knowledge(item.status) !== "UNKNOWN" && safeStatus(item, asOf) === "UNKNOWN") {
      result.push(problem("evidence-provenance", ctx, id, "A stated outcome lacks a usable open-licence source and date."));
    }
    if (item.observedAt !== null && !isDay(item.observedAt)) {
      result.push(problem("evidence-date", ctx, id, "The observation date is not a valid ISO calendar day."));
    }
    if (item.collectedAt !== null && !isDay(item.collectedAt)) {
      result.push(problem("evidence-collected", ctx, id, "The collection date is invalid."));
    }
    if (item.expiresAt !== null && !isDay(item.expiresAt)) {
      result.push(problem("evidence-expiry", ctx, id, "The expiry date is invalid."));
    }
    if (item.observedAt && item.collectedAt && item.observedAt > item.collectedAt) {
      result.push(problem("evidence-chronology", ctx, id, "Observation follows collection date."));
    }
    if (item.status === "UNKNOWN" && /\b(?:accessible|step.free|sans marche|accessible aux fauteuils)\b/i.test(item.text)) {
      result.push(problem("evidence-unknown-copy", ctx, id, "Unknown evidence is accompanied by an unconditional accessibility assertion."));
    }
  }
  return result;
}
export function targetProblems(items: readonly Interactive[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  for (const item of items) {
    if (item.hidden || item.disabled) continue;
    if (!item.name.trim() && item.role !== "presentation") {
      result.push(problem("control-name", ctx, item.key, "Visible interactive element has no accessible name."));
    }
    if (item.rect.width < 44 || item.rect.height < 44) {
      result.push(problem("control-size", ctx, item.key, `Target ${item.rect.width}×${item.rect.height}px is smaller than 44×44px.`));
    }
    if (item.tabIndex < 0 && item.tag !== "a" && item.hasClickHandler) {
      result.push(problem("control-keyboard", ctx, item.key, "A custom click target cannot be reached by Tab."));
    }
    if (item.fontSize > 0 && item.fontSize < 12) {
      result.push(problem("control-text-size", ctx, item.key, "Interactive text is smaller than the 12px audit floor."));
    }
  }
  return result;
}
export function intersects(a: Rect, b: Rect): boolean {
  return Math.max(a.x, b.x) < Math.min(a.x + a.width, b.x + b.width) &&
    Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height);
}
export function overlappingTargets(items: readonly Interactive[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const left = items[i];
    if (!left || left.hidden || left.disabled) continue;
    for (let j = i + 1; j < items.length; j += 1) {
      const right = items[j];
      if (!right || right.hidden || right.disabled) continue;
      if (intersects(left.rect, right.rect)) {
        const area = Math.max(0, Math.min(left.rect.x + left.rect.width, right.rect.x + right.rect.width) - Math.max(left.rect.x, right.rect.x)) *
          Math.max(0, Math.min(left.rect.y + left.rect.height, right.rect.y + right.rect.height) - Math.max(left.rect.y, right.rect.y));
        const minArea = Math.min(left.rect.width * left.rect.height, right.rect.width * right.rect.height);
        if (minArea > 0 && area / minArea > 0.3) {
          result.push(problem("control-overlap", ctx, `${left.key}/${right.key}`, "Two independently operable targets significantly overlap."));
        }
      }
    }
  }
  return result;
}
export function documentProblems(doc: DocumentMetadata, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (normalizeLocale(doc.lang) !== ctx.locale) {
    result.push(problem("document-language", ctx, "html", "Document language does not match the current locale."));
  }
  if (!doc.title.trim()) result.push(problem("document-title", ctx, "title", "Missing document title."));
  if (doc.mainCount !== 1) result.push(problem("main-landmark", ctx, "main", `Expected one main landmark, found ${doc.mainCount}.`));
  const visible = doc.headings.filter((heading) => !heading.hidden);
  if (visible.filter((heading) => heading.level === 1).length !== 1) {
    result.push(problem("page-heading", ctx, "h1", "Each page needs one visible first-level heading."));
  }
  if (visible.length > 0) {
    let previous = visible[0]?.level ?? 1;
    for (const heading of visible.slice(1)) {
      if (heading.level > previous + 1) {
        result.push(problem("heading-order", ctx, `h${heading.level}`, "Heading levels skip a hierarchy level."));
      }
      previous = heading.level;
    }
  }
  if (doc.horizontalOverflow > 1 && doc.documentWidth > doc.viewportWidth + 1) {
    result.push(problem("reflow", ctx, "document", "Content overflows horizontally at the selected viewport."));
  }
  if (/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0+)?(?:,|$)/i.test(doc.viewportMeta ?? "")) {
    result.push(problem("viewport-zoom", ctx, "meta[viewport]", "The viewport metadata restricts browser zoom."));
  }
  if (doc.bodyScrollLocked && doc.documentWidth > doc.viewportWidth) {
    result.push(problem("scroll-locked", ctx, "body", "Scrollable overflow is hidden from the user."));
  }
  return result;
}
export function formProblems(controls: readonly FormControl[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  for (const field of controls) {
    if (!field.visible || field.disabled || field.type === "hidden") continue;
    if (!field.label.trim()) result.push(problem("form-name", ctx, field.id, "Input lacks a programmatic label."));
    if (field.invalid && !field.description.trim()) {
      result.push(problem("form-error", ctx, field.id, "Invalid input is missing an associated error explanation."));
    }
    if (field.required && !field.name.trim()) {
      result.push(problem("form-identity", ctx, field.id, "Required form control has no name attribute."));
    }
    if (["email", "tel", "name", "street-address", "postal-code"].includes(field.name) && !field.autocomplete) {
      result.push(problem("form-autocomplete", ctx, field.id, "A personal-information field lacks an autocomplete purpose."));
    }
  }
  return result;
}
export function mediaProblems(nodes: readonly MediaNode[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  for (const node of nodes) {
    if (node.hidden || node.isDecorative) continue;
    const described = Boolean(node.alt?.trim() || node.ariaLabel?.trim() || node.describedBy?.trim());
    if (["img", "svg", "canvas"].includes(node.kind) && !described) {
      result.push(problem("media-name", ctx, node.id, "Meaningful visual content lacks a text alternative."));
    }
    if (node.kind === "video" && !node.hasCaptions) {
      result.push(problem("video-captions", ctx, node.id, "Video does not expose a captions track."));
    }
    if (node.kind === "audio" && !node.hasTranscript) {
      result.push(problem("audio-transcript", ctx, node.id, "Audio does not expose a text transcript reference."));
    }
  }
  return result;
}
export function liveProblems(regions: readonly LiveRegion[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  for (const region of regions) {
    if (region.hidden || !region.text.trim()) continue;
    if (region.role === "alert" && region.live === "off") {
      result.push(problem("alert-disabled", ctx, region.id, "An active alert has announcements disabled."));
    }
    if (region.live && !["polite", "assertive", "off"].includes(region.live)) {
      result.push(problem("live-value", ctx, region.id, "The live-region setting is not supported."));
    }
    if (region.live === "off" && region.role === "status") {
      result.push(problem("status-disabled", ctx, region.id, "A status update has announcements disabled."));
    }
  }
  return result;
}
export function focusProblems(steps: readonly FocusFrame[], ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  const counts = new Map<string, number>();
  for (const step of steps) {
    counts.set(step.id, (counts.get(step.id) ?? 0) + 1);
    if (step.disabled || step.inert || step.ariaHidden) {
      result.push(problem("focus-hidden", ctx, step.id, "Keyboard focus entered an unavailable or hidden control."));
    }
    if (!step.isVisible) {
      result.push(problem("focus-invisible", ctx, step.id, "Keyboard focus is not visually observable."));
    }
    if (!intersects(step.rect, step.viewport)) {
      result.push(problem("focus-offscreen", ctx, step.id, "Focused control is outside the current viewport."));
    }
    if (!step.name.trim()) result.push(problem("focus-name", ctx, step.id, "Focused control has no accessible name."));
  }
  if (steps.length >= 8 && counts.size === 1) {
    result.push(problem("focus-trap", ctx, steps[0]?.id ?? "document", "Tab remained on one control through eight attempts."));
  }
  return result;
}
export function isLocalRoute(raw: string, base: string): boolean {
  try {
    const candidate = new URL(raw, base);
    const root = new URL(base);
    if (candidate.origin !== root.origin) return false;
    if (!/^https?:$/.test(candidate.protocol)) return false;
    if (/\.(?:pdf|json|zip|csv|txt|svg|png|webp|jpg|jpeg|css|js|woff2?|mp4)$/i.test(candidate.pathname)) return false;
    return true;
  } catch { return false; }
}
export function canonicalRoute(raw: string, base: string): string | null {
  if (!isLocalRoute(raw, base)) return null;
  const url = new URL(raw, base);
  url.hash = "";
  url.searchParams.sort();
  return url.href;
}
export function localeRouteKey(raw: string): string {
  const url = new URL(raw);
  const segments = url.pathname.split("/");
  if (segments[1] === "en" || segments[1] === "fr") segments.splice(1, 1);
  url.pathname = segments.join("/") || "/";
  url.searchParams.delete("lang");
  url.searchParams.delete("locale");
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}
export function routeLocale(raw: string): Locale | null {
  const url = new URL(raw);
  const first = url.pathname.split("/")[1];
  if (first === "en" || first === "fr") return first;
  return normalizeLocale(url.searchParams.get("lang") ?? url.searchParams.get("locale"));
}
export function routeParityProblems(urls: readonly string[], ctx: AuditContext): Problem[] {
  const grouped = new Map<string, Set<Locale>>();
  for (const url of urls) {
    const locale = routeLocale(url);
    if (!locale) continue;
    const key = localeRouteKey(url);
    const locales = grouped.get(key) ?? new Set<Locale>();
    locales.add(locale);
    grouped.set(key, locales);
  }
  return [...grouped.entries()].filter(([, locales]) => locales.size === 1).map(([key, locales]) =>
    problem("locale-parity", ctx, key, `The ${[...locales][0]} route has no discovered counterpart.`));
}
export function linkProblems(links: readonly NavigationLink[], ctx: AuditContext, base: string): Problem[] {
  const result: Problem[] = [];
  for (const link of links) {
    if (link.hidden) continue;
    if (!link.text.trim()) result.push(problem("link-name", ctx, link.id, "Link lacks a readable name."));
    const protocol = link.href.trim().toLowerCase();
    if (protocol.startsWith("javascript:")) result.push(problem("link-script", ctx, link.id, "Script URL should not be a navigation target."));
    if (link.hreflang && normalizeLocale(link.hreflang) === null) {
      result.push(problem("link-hreflang", ctx, link.id, "Language alternative lacks an EN or FR locale."));
    }
    if (link.current && !["page", "step", "location", "date", "time", "true", "false"].includes(link.current)) {
      result.push(problem("link-current", ctx, link.id, "Current-state annotation has an unsupported value."));
    }
    if (isLocalRoute(link.href, base) && /\/fr(?:\/|$)/.test(new URL(link.href, base).pathname) && link.hreflang === "en") {
      result.push(problem("link-locale", ctx, link.id, "Link path and language annotation disagree."));
    }
  }
  return result;
}
export function resourceProblems(resources: readonly NetworkResource[], ctx: AuditContext, base: string): Problem[] {
  const result: Problem[] = [];
  const origin = new URL(base).origin;
  for (const resource of resources) {
    let parsed: URL;
    try { parsed = new URL(resource.url); } catch { continue; }
    if (parsed.origin !== origin && (RESOURCES.test(parsed.hostname) || RESOURCES.test(parsed.pathname))) {
      result.push(problem("remote-map-service", ctx, resource.url, "Map resources must not be loaded from an external tile service."));
    }
    if (resource.type === "document" && resource.status !== null && resource.status >= 400) {
      result.push(problem("document-response", ctx, resource.url, `Document returned HTTP ${resource.status}.`));
    }
    if (resource.type === "document" && resource.failure) {
      result.push(problem("document-network", ctx, resource.url, `Document failed to load: ${resource.failure}.`));
    }
  }
  return result;
}
export function offlineProblems(state: OfflineState, ctx: AuditContext): Problem[] {
  const result: Problem[] = [];
  if (normalizeLocale(state.lang) !== state.locale) result.push(problem("offline-language", ctx, "html", "Offline content changed or lost its language."));
  if (!state.title.trim()) result.push(problem("offline-title", ctx, "title", "Offline page lacks a title."));
  if (!state.mainText.trim()) result.push(problem("offline-content", ctx, "main", "Offline page has no usable content."));
  if (!state.serviceWorkerControlled) result.push(problem("offline-service-worker", ctx, "document", "Page is not controlled by a service worker."));
  for (const record of state.statuses) {
    if (knowledge(record.status) !== "UNKNOWN" && !record.source?.trim()) {
      result.push(problem("offline-source", ctx, record.id, "Offline evidence lost its source."));
    }
    if (knowledge(record.status) === "UNKNOWN" && /\b(?:accessible|sans marche|step.free)\b/i.test(record.text)) {
      result.push(problem("offline-unknown", ctx, record.id, "Offline copy implies a known accessibility result without supporting data."));
    }
  }
  return result;
}
export function formatProblems(problems: readonly Problem[], max = 60): string {
  if (problems.length === 0) return "No audit problems.";
  const lines = problems.slice(0, max).map((item, index) =>
    `${index + 1}. [${item.rule}] ${item.page} ${item.target}: ${item.explanation}`);
  if (problems.length > max) lines.push(`... ${problems.length - max} further problems`);
  return lines.join("\n");
}
