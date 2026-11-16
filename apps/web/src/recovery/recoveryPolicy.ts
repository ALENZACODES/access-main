import type { RecoveryLocale, RecoverySource } from "./index";
import { isSafePackId, type LocalPackRecord, type LocalPackState } from "./packInventory";
import { isOpenLicence, parseCalendarDate } from "./recoveryDiagnostics";

/** Local content policy. Physical access at a location is never assessed. */
export type RepairPriority = "blocked" | "review" | "none";
export type RepairKind = "redownload" | "inspect" | "source" | "storage" | "none";
export type PolicyFlag =
  | "absent" | "damaged" | "unknown" | "missing-source"
  | "closed-licence" | "bad-date" | "future-date"
  | "invalid-id" | "duplicate-id" | "size-unknown"
  | "size-invalid" | "capacity-limit";

export interface PolicyFinding {
  readonly packId: string;
  readonly flag: PolicyFlag;
  readonly priority: RepairPriority;
}

export interface RepairRecommendation {
  readonly id: string;
  readonly state: LocalPackState;
  readonly priority: RepairPriority;
  readonly kind: RepairKind;
  readonly flags: readonly PolicyFlag[];
  readonly source?: RecoverySource;
  readonly bytes: number | null;
  /** A local content check is not a statement about physical accessibility. */
  readonly contentReady: boolean;
}

export interface RepairPolicyResult {
  readonly recommendations: readonly RepairRecommendation[];
  readonly findings: readonly PolicyFinding[];
  readonly totals: Readonly<Record<RepairPriority, number>>;
  readonly overflow: number;
  readonly date: string | null;
}

export interface RepairPolicyOptions {
  /** Date of this explicit inspection, YYYY-MM-DD. */
  readonly date: string;
  readonly maximumPacks?: number;
  readonly maximumKnownBytes?: number;
}

const MAX_PACKS = 500;
const MAX_KNOWN_BYTES = 512 * 1024 * 1024;

function sourceFlags(source: RecoverySource | undefined, date: number | null): PolicyFlag[] {
  if (source === undefined || source.name.trim().length === 0) return ["missing-source"];
  const flags: PolicyFlag[] = [];
  if (!isOpenLicence(source.licence)) flags.push("closed-licence");
  const sourceDate = parseCalendarDate(source.date);
  if (sourceDate === null) flags.push("bad-date");
  else if (date !== null && sourceDate > date) flags.push("future-date");
  return flags;
}

function disposition(state: LocalPackState, flags: readonly PolicyFlag[]): {
  priority: RepairPriority; kind: RepairKind;
} {
  if (flags.includes("invalid-id") || flags.includes("duplicate-id")) {
    return { priority: "blocked", kind: "inspect" };
  }
  if (state === "corrupt" || state === "absent") {
    return { priority: "blocked", kind: "redownload" };
  }
  if (state === "unknown") return { priority: "blocked", kind: "inspect" };
  if (flags.includes("size-invalid") || flags.includes("capacity-limit")) {
    return { priority: "blocked", kind: "storage" };
  }
  if (flags.length > 0) return { priority: "review", kind: "source" };
  return { priority: "none", kind: "none" };
}

/**
 * A deterministic projection of the latest local inspection. Never turns
 * absent, corrupt or UNKNOWN input into a ready record. Capacity limits are
 * hard and all overflow entries are explicitly counted.
 */
export function planPackRepairs(
  records: readonly LocalPackRecord[], options: RepairPolicyOptions,
): RepairPolicyResult {
  const date = parseCalendarDate(options.date);
  const maxPacks = Number.isSafeInteger(options.maximumPacks) &&
    (options.maximumPacks ?? 0) > 0 && (options.maximumPacks ?? 0) <= MAX_PACKS
    ? options.maximumPacks! : MAX_PACKS;
  const maxBytes = Number.isSafeInteger(options.maximumKnownBytes) &&
    (options.maximumKnownBytes ?? 0) > 0 && (options.maximumKnownBytes ?? 0) <= MAX_KNOWN_BYTES
    ? options.maximumKnownBytes! : MAX_KNOWN_BYTES;
  const seen = new Set<string>();
  const recommendations: RepairRecommendation[] = [];
  const findings: PolicyFinding[] = [];
  let consumed = 0;
  for (const record of records.slice(0, maxPacks)) {
    const flags: PolicyFlag[] = [];
    if (!isSafePackId(record.id)) flags.push("invalid-id");
    if (seen.has(record.id)) flags.push("duplicate-id");
    seen.add(record.id);
    if (record.state === "corrupt") flags.push("damaged");
    else if (record.state === "absent") flags.push("absent");
    else if (record.state === "unknown") flags.push("unknown");
    if (record.byteLength === undefined) flags.push("size-unknown");
    else if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 0) flags.push("size-invalid");
    else if (consumed + record.byteLength > maxBytes) flags.push("capacity-limit");
    else consumed += record.byteLength;
    flags.push(...sourceFlags(record.source, date));
    const decision = disposition(record.state, flags);
    const contentReady = record.state === "ready" &&
      !flags.some((flag) => ["invalid-id", "duplicate-id", "size-invalid", "capacity-limit"].includes(flag));
    const recommendation: RepairRecommendation = {
      id: record.id, state: record.state, priority: decision.priority,
      kind: decision.kind, flags, bytes: record.byteLength ?? null,
      contentReady,
      ...(record.source === undefined ? {} : { source: record.source }),
    };
    recommendations.push(recommendation);
    for (const flag of flags) findings.push({ packId: record.id, flag, priority: decision.priority });
  }
  const totals = { blocked: 0, review: 0, none: 0 };
  for (const item of recommendations) totals[item.priority] += 1;
  return {
    recommendations, findings, totals,
    overflow: Math.max(0, records.length - maxPacks),
    date: date === null ? null : options.date,
  };
}

export interface RepairPolicyCopy {
  readonly heading: string;
  readonly intro: string;
  readonly categories: Readonly<Record<RepairPriority, string>>;
  readonly kinds: Readonly<Record<RepairKind, string>>;
  readonly flags: Readonly<Record<PolicyFlag, string>>;
  readonly overflow: string;
  readonly notInspected: string;
  readonly noItems: string;
  readonly source: string;
  readonly date: string;
  readonly licence: string;
}

const EN: RepairPolicyCopy = {
  heading: "Pack recovery priorities",
  intro: "This review describes saved files only. It does not assess access to any place. Check each file before use.",
  categories: { blocked: "Needs action", review: "Review source", none: "No local issue shown" },
  kinds: {
    redownload: "Download a fresh copy when connected", inspect: "Inspect this pack again",
    source: "Review the supplied source details", storage: "Review local storage",
    none: "No action proposed",
  },
  flags: {
    absent: "Local file missing", damaged: "File damaged", unknown: "UNKNOWN file state",
    "missing-source": "Source missing", "closed-licence": "Open licence not supplied",
    "bad-date": "Source date missing or invalid", "future-date": "Source date is in the future",
    "invalid-id": "Unsupported pack identifier", "duplicate-id": "Repeated pack identifier",
    "size-unknown": "File size UNKNOWN", "size-invalid": "File size invalid",
    "capacity-limit": "Local review size limit reached",
  },
  overflow: "Additional packs are outside this local review limit.",
  notInspected: "Run a local pack check to see priorities.",
  noItems: "No packs are listed in this local review.",
  source: "Source", date: "Date", licence: "Licence",
};

const FR: RepairPolicyCopy = {
  heading: "Priorités de récupération des ensembles",
  intro: "Ce contrôle porte uniquement sur les fichiers enregistrés. Il n’évalue pas l’accès aux lieux. Examinez chaque fichier avant utilisation.",
  categories: { blocked: "Intervention nécessaire", review: "Examiner la source", none: "Aucun problème local signalé" },
  kinds: {
    redownload: "Télécharger une nouvelle copie une fois connecté", inspect: "Examiner de nouveau cet ensemble",
    source: "Examiner les renseignements sur la source", storage: "Examiner le stockage local",
    none: "Aucune intervention proposée",
  },
  flags: {
    absent: "Fichier local absent", damaged: "Fichier endommagé", unknown: "État du fichier INCONNU",
    "missing-source": "Source manquante", "closed-licence": "Licence ouverte non fournie",
    "bad-date": "Date de la source absente ou invalide", "future-date": "Date de la source future",
    "invalid-id": "Identifiant d’ensemble non pris en charge", "duplicate-id": "Identifiant d’ensemble répété",
    "size-unknown": "Taille du fichier INCONNUE", "size-invalid": "Taille du fichier invalide",
    "capacity-limit": "Limite de taille du contrôle local atteinte",
  },
  overflow: "D’autres ensembles dépassent la limite du contrôle local.",
  notInspected: "Contrôlez les ensembles locaux pour connaître les priorités.",
  noItems: "Aucun ensemble n’est répertorié dans ce contrôle local.",
  source: "Source", date: "Date", licence: "Licence",
};

export function repairPolicyCopy(locale: RecoveryLocale): RepairPolicyCopy {
  return locale === "fr" ? FR : EN;
}
