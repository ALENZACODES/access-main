import type { RecoveryLocale, RecoverySource } from "./index";
import { isSafePackId, type LocalPackRecord } from "./packInventory";

/** All classifications describe local pack health, never physical accessibility. */
export type DiagnosticSeverity = "blocked" | "attention" | "information";
export type DiagnosticCode =
  | "pack-damaged"
  | "pack-missing"
  | "pack-unknown"
  | "source-missing"
  | "licence-unknown"
  | "date-invalid"
  | "date-future"
  | "date-old"
  | "size-unavailable"
  | "size-too-large"
  | "duplicate-id"
  | "id-unsafe"
  | "capacity-exceeded";

export interface DiagnosticFinding {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly packId: string | null;
  readonly detail?: number;
}

export interface DiagnosticOptions {
  readonly today: string;
  readonly staleDays?: number;
  readonly maximumBytes?: number;
  readonly maximumPacks?: number;
}

export interface DiagnosticSummary {
  readonly status: "blocked" | "attention" | "clear" | "unknown";
  readonly findings: readonly DiagnosticFinding[];
  readonly packCount: number;
  readonly totalKnownBytes: number;
  readonly missingSizeCount: number;
  readonly checkedOn: string | null;
}

const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0",
]);
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_PACKS = 500;
const DEFAULT_STALE_DAYS = 365;

/** Rejects impossible dates rather than letting Date.parse normalise them. */
export function parseCalendarDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = Date.UTC(year, month - 1, day);
  const actual = new Date(date);
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) return null;
  return date;
}

export function isOpenLicence(value: unknown): value is string {
  return typeof value === "string" && OPEN_LICENCES.has(value);
}

export function sourceDiagnostics(
  source: RecoverySource | undefined,
  id: string,
  today: number | null,
  staleDays: number,
): DiagnosticFinding[] {
  if (!source || typeof source.name !== "string" || source.name.trim().length === 0) {
    return [{ code: "source-missing", severity: "blocked", packId: id }];
  }
  const findings: DiagnosticFinding[] = [];
  if (!isOpenLicence(source.licence)) {
    findings.push({ code: "licence-unknown", severity: "blocked", packId: id });
  }
  const date = typeof source.date === "string" ? parseCalendarDate(source.date) : null;
  if (date === null) {
    findings.push({ code: "date-invalid", severity: "blocked", packId: id });
  } else if (today !== null) {
    const age = Math.floor((today - date) / 86_400_000);
    if (age < 0) findings.push({ code: "date-future", severity: "attention", packId: id });
    else if (age > staleDays) findings.push({ code: "date-old", severity: "information", packId: id, detail: age });
  }
  return findings;
}

function safeBound(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function severitySort(a: DiagnosticFinding, b: DiagnosticFinding): number {
  const priority: Record<DiagnosticSeverity, number> = { blocked: 0, attention: 1, information: 2 };
  return priority[a.severity] - priority[b.severity] ||
    (a.packId ?? "").localeCompare(b.packId ?? "", "en") || a.code.localeCompare(b.code, "en");
}

/**
 * Inspect an explicit local inventory only. Never infer a usable pack from
 * metadata or from a missing record. Results are deterministic, bounded and
 * not stored in browser persistence.
 */
export function diagnoseInventory(
  records: readonly LocalPackRecord[],
  options: DiagnosticOptions,
): DiagnosticSummary {
  const today = parseCalendarDate(options.today);
  const staleDays = safeBound(options.staleDays, DEFAULT_STALE_DAYS);
  const maximumBytes = safeBound(options.maximumBytes, DEFAULT_MAX_BYTES);
  const maximumPacks = safeBound(options.maximumPacks, DEFAULT_MAX_PACKS);
  const findings: DiagnosticFinding[] = [];
  const seen = new Set<string>();
  let totalKnownBytes = 0;
  let missingSizeCount = 0;
  if (records.length > maximumPacks) {
    findings.push({ code: "capacity-exceeded", severity: "blocked", packId: null });
  }
  for (const record of records.slice(0, maximumPacks)) {
    if (!isSafePackId(record.id)) {
      findings.push({ code: "id-unsafe", severity: "blocked", packId: null });
      continue;
    }
    if (seen.has(record.id)) {
      findings.push({ code: "duplicate-id", severity: "blocked", packId: record.id });
      continue;
    }
    seen.add(record.id);
    if (record.state === "corrupt") {
      findings.push({ code: "pack-damaged", severity: "blocked", packId: record.id });
    } else if (record.state === "absent") {
      findings.push({ code: "pack-missing", severity: "attention", packId: record.id });
    } else if (record.state !== "ready") {
      findings.push({ code: "pack-unknown", severity: "blocked", packId: record.id });
    }
    findings.push(...sourceDiagnostics(record.source, record.id, today, staleDays));
    if (record.byteLength === undefined) {
      missingSizeCount++;
      findings.push({ code: "size-unavailable", severity: "information", packId: record.id });
    } else if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 0 || record.byteLength > maximumBytes) {
      findings.push({ code: "size-too-large", severity: "blocked", packId: record.id });
    } else if (totalKnownBytes > maximumBytes - record.byteLength) {
      findings.push({ code: "capacity-exceeded", severity: "blocked", packId: record.id });
    } else {
      totalKnownBytes += record.byteLength;
    }
  }
  findings.sort(severitySort);
  const status = today === null ? "unknown"
    : findings.some((finding) => finding.severity === "blocked") ? "blocked"
      : findings.some((finding) => finding.severity === "attention") ? "attention"
        : records.length === 0 || missingSizeCount > 0 ? "unknown"
          : findings.length > 0 ? "attention" : "clear";
  return {
    status, findings, packCount: records.length, totalKnownBytes,
    missingSizeCount, checkedOn: today === null ? null : options.today,
  };
}

export interface DiagnosticsCopy {
  readonly heading: string;
  readonly explanation: string;
  readonly states: Readonly<Record<DiagnosticSummary["status"], string>>;
  readonly problems: Readonly<Record<DiagnosticCode, string>>;
  readonly labels: {
    readonly count: string;
    readonly bytes: string;
    readonly noFindings: string;
    readonly sourceNote: string;
    readonly pack: string;
    readonly global: string;
  };
}

const EN: DiagnosticsCopy = {
  heading: "Local pack health",
  explanation: "These checks describe saved files only. They do not assess entrances, routes or services. UNKNOWN remains UNKNOWN.",
  states: {
    blocked: "Some packs need attention before use",
    attention: "Some packs are missing or need attention",
    clear: "No issues found in the listed pack metadata",
    unknown: "UNKNOWN",
  },
  problems: {
    "pack-damaged": "Saved file differs from its expected contents.",
    "pack-missing": "No saved file is available.",
    "pack-unknown": "Saved file status is UNKNOWN.",
    "source-missing": "Source name is missing.",
    "licence-unknown": "An accepted open licence was not supplied.",
    "date-invalid": "Source date is missing or invalid.",
    "date-future": "Source date is later than the inspection date.",
    "date-old": "Source date is more than one year old.",
    "size-unavailable": "Local file size is UNKNOWN.",
    "size-too-large": "File size exceeds the inspection limit or is invalid.",
    "duplicate-id": "A pack identifier appears more than once.",
    "id-unsafe": "An unsupported pack identifier was omitted.",
    "capacity-exceeded": "The local inspection limit was exceeded.",
  },
  labels: {
    count: "Packs listed", bytes: "Known bytes", noFindings: "No findings for the listed files.",
    sourceNote: "Dates refer to supplied sources, not the time a location was assessed.",
    pack: "Pack", global: "Inventory",
  },
};

const FR: DiagnosticsCopy = {
  heading: "État des ensembles locaux",
  explanation: "Ces contrôles concernent uniquement les fichiers enregistrés. Ils n’évaluent ni les entrées, ni les trajets, ni les services. INCONNU reste INCONNU.",
  states: {
    blocked: "Certains ensembles demandent une intervention avant utilisation",
    attention: "Certains ensembles sont absents ou demandent une intervention",
    clear: "Aucun problème relevé dans les renseignements des ensembles répertoriés",
    unknown: "INCONNU",
  },
  problems: {
    "pack-damaged": "Le fichier enregistré ne correspond pas au contenu attendu.",
    "pack-missing": "Aucun fichier enregistré n’est disponible.",
    "pack-unknown": "L’état du fichier enregistré est INCONNU.",
    "source-missing": "Le nom de la source manque.",
    "licence-unknown": "Aucune licence ouverte acceptée n’a été fournie.",
    "date-invalid": "La date de la source est absente ou invalide.",
    "date-future": "La date de la source est postérieure à celle du contrôle.",
    "date-old": "La source date de plus d’un an.",
    "size-unavailable": "La taille du fichier local est INCONNUE.",
    "size-too-large": "La taille du fichier dépasse la limite ou est invalide.",
    "duplicate-id": "Un identifiant d’ensemble apparaît plusieurs fois.",
    "id-unsafe": "Un identifiant d’ensemble non pris en charge a été omis.",
    "capacity-exceeded": "La limite du contrôle local a été dépassée.",
  },
  labels: {
    count: "Ensembles répertoriés", bytes: "Octets connus", noFindings: "Aucun problème pour les fichiers répertoriés.",
    sourceNote: "Les dates concernent les sources fournies, et non l’évaluation d’un lieu.",
    pack: "Ensemble", global: "Inventaire",
  },
};

export function diagnosticsCopy(locale: RecoveryLocale): DiagnosticsCopy {
  return locale === "fr" ? FR : EN;
}
