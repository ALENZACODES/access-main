/**
 * P16 record quality gate. All work is deterministic and runs without a network.
 * Consumers supply their own immutable records; this module never downloads,
 * persists, edits, or infers facts about a source.
 */

export type Locale = "en" | "fr";
export type EvidenceTier = "primary" | "secondary" | "community" | "unknown";
export type OfflineState = "stored" | "not-stored" | "unknown";
export type RecordKind = "place" | "service" | "guide" | "alert";

export interface BilingualText {
  readonly en: string;
  readonly fr: string;
}

export interface SourceReference {
  readonly id: string;
  readonly title: BilingualText;
  readonly url: string;
  readonly publisher: string;
  readonly licence: string;
  /** Local date of collection, ISO calendar-date format. */
  readonly collectedOn: string;
  readonly tier: EvidenceTier;
}

export interface OfflineCopy {
  readonly state: OfflineState;
  /** Absolute path within the application, not a remote location. */
  readonly path?: string;
  readonly capturedOn?: string;
}

export interface AccessibleRecord {
  readonly id: string;
  readonly kind: RecordKind;
  readonly title: BilingualText;
  readonly summary: BilingualText;
  readonly sources: readonly SourceReference[];
  readonly reviewedOn?: string;
  readonly offline: OfflineCopy;
}

export type FindingCode =
  | "invalid-record"
  | "duplicate-record"
  | "invalid-record-id"
  | "missing-language"
  | "placeholder-language"
  | "invalid-kind"
  | "missing-source"
  | "duplicate-source"
  | "invalid-source-id"
  | "invalid-source-url"
  | "missing-publisher"
  | "missing-licence"
  | "invalid-collection-date"
  | "future-collection-date"
  | "invalid-review-date"
  | "review-before-collection"
  | "invalid-tier"
  | "invalid-offline-state"
  | "missing-offline-path"
  | "unexpected-offline-path"
  | "unsafe-offline-path"
  | "invalid-offline-date"
  | "offline-before-collection"
  | "offline-after-review"
  | "conflicting-offline-path";

export interface Finding {
  readonly code: FindingCode;
  /** Only record and field locations are emitted, never untrusted values. */
  readonly path: string;
}

export interface AuditOptions {
  /** Set explicitly for reproducible results. Defaults to 1970-01-01. */
  readonly asOf?: string;
  /** Local prefixes that can hold an offline copy. */
  readonly allowedOfflinePrefixes?: readonly string[];
}

export interface RecordAudit {
  readonly findings: readonly Finding[];
  readonly recordCount: number;
  readonly sourceCount: number;
  readonly storedCount: number;
  readonly locales: readonly Locale[];
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KINDS: readonly RecordKind[] = ["place", "service", "guide", "alert"];
const TIERS: readonly EvidenceTier[] = ["primary", "secondary", "community", "unknown"];
const OFFLINE_STATES: readonly OfflineState[] = ["stored", "not-stored", "unknown"];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCALES: readonly Locale[] = ["en", "fr"];
const PLACEHOLDERS = /^(?:n\/a|todo|tbd|coming soon|à venir|sans objet|\.\.\.|—|-|\?)$/i;

/** ASCII control characters are rejected using character codes, not a regexp. */
function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function dateOrdinal(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const when = new Date(Date.UTC(year, month - 1, day));
  if (when.getUTCFullYear() !== year || when.getUTCMonth() + 1 !== month || when.getUTCDate() !== day) return null;
  return Math.floor(when.getTime() / 86_400_000);
}

function safeUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() !== value || containsAsciiControl(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return false;
    if (url.hash.length > 0) return false;
    if (/^(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function safeOfflinePath(value: unknown, prefixes: readonly string[]): boolean {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || (containsAsciiControl(value) || value.includes("?") || value.includes("#") || value.includes("%"))) return false;
  const segments = value.split("/").slice(1);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return prefixes.some((prefix) => value.startsWith(prefix + "/") && value.length > prefix.length + 1);
}

function bilingual(value: unknown, path: string, report: (code: FindingCode, path: string) => void): void {
  const text = isObject(value) ? value : {};
  for (const locale of LOCALES) {
    const content = text[locale];
    if (!nonempty(content)) {
      report("missing-language", `${path}.${locale}`);
    } else if (PLACEHOLDERS.test(content.trim())) {
      report("placeholder-language", `${path}.${locale}`);
    }
  }
}

/** Audit a dataset without altering or normalizing its original source records. */
export function auditRecords(input: unknown, options: AuditOptions = {}): RecordAudit {
  const findings: Finding[] = [];
  const report = (code: FindingCode, path: string): void => { findings.push({ code, path }); };
  const asOf = dateOrdinal(options.asOf ?? "1970-01-01");
  if (asOf === null) throw new TypeError("asOf must be an ISO calendar date");
  const prefixes = options.allowedOfflinePrefixes ?? ["/offline", "/cache/records"];
  if (prefixes.some((prefix) => !/^\/[a-z][a-z0-9/-]*[a-z0-9]$/.test(prefix) || prefix.includes("//"))) {
    throw new TypeError("Offline prefixes must be canonical local paths");
  }
  if (!Array.isArray(input)) {
    report("invalid-record", "records");
    return { findings, recordCount: 0, sourceCount: 0, storedCount: 0, locales: LOCALES };
  }
  const records = input as readonly unknown[];
  const recordIds = new Set<string>();
  const offlinePaths = new Map<string, string>();
  let sourceCount = 0;
  let storedCount = 0;

  records.forEach((item, index) => {
    const at = `records[${index}]`;
    if (!isObject(item)) {
      report("invalid-record", at);
      return;
    }
    const id = item.id;
    if (!nonempty(id) || !IDENTIFIER.test(id)) report("invalid-record-id", `${at}.id`);
    else if (recordIds.has(id)) report("duplicate-record", `${at}.id`);
    else recordIds.add(id);
    if (!KINDS.includes(item.kind as RecordKind)) report("invalid-kind", `${at}.kind`);
    bilingual(item.title, `${at}.title`, report);
    bilingual(item.summary, `${at}.summary`, report);

    const sourceList = item.sources;
    const seenSources = new Set<string>();
    let mostRecentCollection: number | null = null;
    if (!Array.isArray(sourceList) || sourceList.length === 0) {
      report("missing-source", `${at}.sources`);
    } else {
      for (const [sourceIndex, candidate] of sourceList.entries()) {
        const sourceAt = `${at}.sources[${sourceIndex}]`;
        sourceCount += 1;
        if (!isObject(candidate)) {
          report("missing-source", sourceAt);
          continue;
        }
        if (!nonempty(candidate.id) || !IDENTIFIER.test(candidate.id)) report("invalid-source-id", `${sourceAt}.id`);
        else if (seenSources.has(candidate.id)) report("duplicate-source", `${sourceAt}.id`);
        else seenSources.add(candidate.id);
        bilingual(candidate.title, `${sourceAt}.title`, report);
        if (!safeUrl(candidate.url)) report("invalid-source-url", `${sourceAt}.url`);
        if (!nonempty(candidate.publisher)) report("missing-publisher", `${sourceAt}.publisher`);
        if (!nonempty(candidate.licence)) report("missing-licence", `${sourceAt}.licence`);
        if (!TIERS.includes(candidate.tier as EvidenceTier)) report("invalid-tier", `${sourceAt}.tier`);
        const collected = dateOrdinal(candidate.collectedOn);
        if (collected === null) report("invalid-collection-date", `${sourceAt}.collectedOn`);
        else {
          if (collected > asOf) report("future-collection-date", `${sourceAt}.collectedOn`);
          mostRecentCollection = Math.max(mostRecentCollection ?? collected, collected);
        }
      }
    }

    const reviewed = item.reviewedOn === undefined ? null : dateOrdinal(item.reviewedOn);
    if (item.reviewedOn !== undefined && reviewed === null) report("invalid-review-date", `${at}.reviewedOn`);
    if (reviewed !== null && mostRecentCollection !== null && reviewed < mostRecentCollection) {
      report("review-before-collection", `${at}.reviewedOn`);
    }

    const offline = isObject(item.offline) ? item.offline : {};
    if (!OFFLINE_STATES.includes(offline.state as OfflineState)) {
      report("invalid-offline-state", `${at}.offline.state`);
    } else if (offline.state === "stored") {
      storedCount += 1;
      if (!nonempty(offline.path)) report("missing-offline-path", `${at}.offline.path`);
      else if (!safeOfflinePath(offline.path, prefixes)) report("unsafe-offline-path", `${at}.offline.path`);
      else {
        const prior = offlinePaths.get(offline.path);
        if (prior !== undefined && prior !== id) report("conflicting-offline-path", `${at}.offline.path`);
        offlinePaths.set(offline.path, typeof id === "string" ? id : at);
      }
      const capture = dateOrdinal(offline.capturedOn);
      if (capture === null) report("invalid-offline-date", `${at}.offline.capturedOn`);
      else {
        if (mostRecentCollection !== null && capture < mostRecentCollection) {
          report("offline-before-collection", `${at}.offline.capturedOn`);
        }
        if (reviewed !== null && capture > reviewed) report("offline-after-review", `${at}.offline.capturedOn`);
      }
    } else if (offline.path !== undefined || offline.capturedOn !== undefined) {
      report("unexpected-offline-path", `${at}.offline`);
    }
  });

  findings.sort((a, b) => a.path.localeCompare(b.path, "en") || a.code.localeCompare(b.code, "en"));
  return { findings, recordCount: records.length, sourceCount, storedCount, locales: LOCALES };
}

/** Safe summary for CI logs; never echo private or third-party record values. */
export function formatAudit(audit: RecordAudit): string {
  const lines = [
    `records=${audit.recordCount}`,
    `sources=${audit.sourceCount}`,
    `stored=${audit.storedCount}`,
    `findings=${audit.findings.length}`,
  ];
  for (const finding of audit.findings) lines.push(`${finding.code} ${finding.path}`);
  return lines.join("\n");
}
