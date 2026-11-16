import type { RecoverySource } from "./index";
import { checkPackIntegrity, type PackManifest, type Sha256 } from "./packIntegrity";

/** The catalogue is a local view, not an assertion about place accessibility. */
export type LocalPackState = "absent" | "ready" | "corrupt" | "unknown";
export type PackProblem =
  | "not-installed"
  | "missing-manifest"
  | "invalid-manifest"
  | "size-mismatch"
  | "digest-mismatch"
  | "digest-unavailable"
  | "read-failed";

export interface LocalPackRecord {
  readonly id: string;
  readonly state: LocalPackState;
  readonly problem?: PackProblem;
  readonly source?: RecoverySource;
  readonly byteLength?: number;
}

export interface StoredPack {
  readonly id: string;
  readonly manifest: PackManifest | null;
  readonly bytes: Uint8Array | null;
}

/** Explicitly enumerated IDs: no attempt to discover private device files. */
export interface LocalPackStore {
  listIds(): Promise<readonly string[]>;
  read(id: string): Promise<StoredPack | null>;
}

export const MAX_PACK_ID_LENGTH = 128;

export function isSafePackId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 && value.length <= MAX_PACK_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) &&
    value !== "." && value !== "..";
}

export function knownPackIds(ids: readonly unknown[]): string[] {
  const unique = new Set<string>();
  for (const id of ids) {
    if (isSafePackId(id)) unique.add(id);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "en"));
}

export async function inspectPack(
  id: string,
  store: LocalPackStore,
  digest?: Sha256,
): Promise<LocalPackRecord> {
  if (!isSafePackId(id)) {
    return { id, state: "unknown", problem: "invalid-manifest" };
  }
  let item: StoredPack | null;
  try {
    item = await store.read(id);
  } catch {
    return { id, state: "unknown", problem: "read-failed" };
  }
  if (item === null) {
    return { id, state: "absent", problem: "not-installed" };
  }
  if (item.id !== id) {
    return { id, state: "unknown", problem: "invalid-manifest" };
  }
  if (item.manifest === null || item.bytes === null) {
    return { id, state: "unknown", problem: "missing-manifest" };
  }
  const check = await checkPackIntegrity(item.bytes, item.manifest, digest);
  switch (check.status) {
    case "complete":
      return {
        id,
        state: "ready",
        byteLength: item.bytes.byteLength,
        source: check.source,
      };
    case "corrupt":
      return {
        id,
        state: "corrupt",
        problem: check.reason === "size" ? "size-mismatch" : "digest-mismatch",
      };
    case "unknown":
      return {
        id,
        state: "unknown",
        problem: check.reason === "metadata" ? "invalid-manifest" : "digest-unavailable",
      };
  }
}

/** Never substitutes a checked status cached from a previous session. */
export async function inspectInstalledPacks(
  store: LocalPackStore,
  digest?: Sha256,
): Promise<LocalPackRecord[]> {
  let ids: readonly string[];
  try {
    ids = await store.listIds();
  } catch {
    throw new Error("Local inventory could not be listed");
  }
  const result: LocalPackRecord[] = [];
  for (const id of knownPackIds(ids)) {
    result.push(await inspectPack(id, store, digest));
  }
  return result;
}

/** Return the checked bytes themselves to avoid a separate unchecked read. */
export type OpenPackResult =
  | { readonly status: "ready"; readonly bytes: Uint8Array; readonly source: RecoverySource }
  | { readonly status: "absent" | "corrupt" | "unknown"; readonly reason?: PackProblem };

export async function openCheckedPack(
  id: string,
  store: LocalPackStore,
  digest?: Sha256,
): Promise<OpenPackResult> {
  if (!isSafePackId(id)) return { status: "unknown", reason: "invalid-manifest" };
  let entry: StoredPack | null;
  try {
    entry = await store.read(id);
  } catch {
    return { status: "unknown", reason: "read-failed" };
  }
  if (entry === null) return { status: "absent", reason: "not-installed" };
  if (entry.id !== id || entry.manifest === null || entry.bytes === null) {
    return { status: "unknown", reason: "invalid-manifest" };
  }
  // Work on a private snapshot in case the backing store reuses its buffer.
  const bytes = Uint8Array.from(entry.bytes);
  const check = await checkPackIntegrity(bytes, entry.manifest, digest);
  if (check.status === "complete") {
    return { status: "ready", bytes, source: check.source };
  }
  if (check.status === "corrupt") {
    return {
      status: "corrupt",
      reason: check.reason === "size" ? "size-mismatch" : "digest-mismatch",
    };
  }
  return {
    status: "unknown",
    reason: check.reason === "metadata" ? "invalid-manifest" : "digest-unavailable",
  };
}

export interface PackAvailability {
  readonly usable: boolean;
  readonly state: LocalPackState;
  readonly source?: RecoverySource;
  readonly reason?: PackProblem;
}

/** Only an actual current byte check allows use; UNKNOWN is not ready. */
export async function canOpenPack(
  id: string,
  store: LocalPackStore,
  digest?: Sha256,
): Promise<PackAvailability> {
  const record = await inspectPack(id, store, digest);
  if (record.state === "ready" && record.source !== undefined) {
    return { usable: true, state: record.state, source: record.source };
  }
  return { usable: false, state: record.state, reason: record.problem };
}

export interface InventoryCopy {
  readonly heading: string;
  readonly refresh: string;
  readonly empty: string;
  readonly pending: string;
  readonly states: Readonly<Record<LocalPackState, string>>;
  readonly problems: Readonly<Record<PackProblem, string>>;
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly size: string;
}

const EN: InventoryCopy = {
  heading: "Offline packs",
  refresh: "Check saved packs",
  empty: "No packs listed on this device.",
  pending: "Checking local packs…",
  states: {
    absent: "Not saved",
    ready: "Ready on this device",
    corrupt: "Damaged",
    unknown: "UNKNOWN",
  },
  problems: {
    "not-installed": "No local copy was found.",
    "missing-manifest": "Pack bytes or source information are missing.",
    "invalid-manifest": "Pack information is missing or unsupported.",
    "size-mismatch": "The saved size differs from the expected size.",
    "digest-mismatch": "The saved contents differ from the expected contents.",
    "digest-unavailable": "The contents could not be checked.",
    "read-failed": "The saved pack could not be read.",
  },
  source: "Source",
  licence: "Licence",
  date: "Date",
  size: "Bytes",
};

const FR: InventoryCopy = {
  heading: "Ensembles hors ligne",
  refresh: "Contrôler les ensembles enregistrés",
  empty: "Aucun ensemble répertorié sur cet appareil.",
  pending: "Contrôle des ensembles locaux…",
  states: {
    absent: "Non enregistré",
    ready: "Prêt sur cet appareil",
    corrupt: "Endommagé",
    unknown: "INCONNU",
  },
  problems: {
    "not-installed": "Aucune copie locale n’a été trouvée.",
    "missing-manifest": "Il manque les données ou les renseignements sur la source.",
    "invalid-manifest": "Les renseignements de l’ensemble sont absents ou non pris en charge.",
    "size-mismatch": "La taille enregistrée diffère de la taille attendue.",
    "digest-mismatch": "Le contenu enregistré diffère du contenu attendu.",
    "digest-unavailable": "Le contenu n’a pas pu être contrôlé.",
    "read-failed": "L’ensemble enregistré n’a pas pu être lu.",
  },
  source: "Source",
  licence: "Licence",
  date: "Date",
  size: "Octets",
};

export function inventoryCopy(locale: "en" | "fr"): InventoryCopy {
  return locale === "fr" ? FR : EN;
}
