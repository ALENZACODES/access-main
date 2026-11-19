import type { RegionInventory } from "./regionInventory";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";

/** Browser storage estimates are advisory and are not a promise of retention. */
export interface BrowserStorage {
  estimate?: () => Promise<StorageEstimate>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

export type RetentionState = "enabled" | "not-enabled" | "UNKNOWN";
export type CapacityState = "known" | "UNKNOWN";
export interface StorageReading {
  readonly retention: RetentionState;
  readonly capacity: CapacityState;
  readonly usedBytes: number | null;
  readonly quotaBytes: number | null;
  readonly freeBytes: number | null;
  readonly canRequest: boolean;
  readonly readError: boolean;
}

export type RequestOutcome = "not-requested" | "enabled" | "not-enabled" | "unavailable" | "error";
export type ReadPhase = "idle" | "checking" | "requesting" | "ready";
export interface DurabilityState {
  readonly phase: ReadPhase;
  readonly reading: StorageReading;
  readonly outcome: RequestOutcome;
}

export interface DurabilityController {
  getState(): DurabilityState;
  subscribe(listener: (state: DurabilityState) => void): () => void;
  refresh(): Promise<void>;
  request(): Promise<void>;
  dispose(): void;
}

const EMPTY_READING: StorageReading = {
  retention: "UNKNOWN", capacity: "UNKNOWN", usedBytes: null,
  quotaBytes: null, freeBytes: null, canRequest: false, readError: false,
};

function safeCapacity(estimate: StorageEstimate): {
  readonly used: number;
  readonly quota: number;
  readonly free: number;
} | null {
  const used = estimate.usage;
  const quota = estimate.quota;
  if (used === undefined || quota === undefined ||
    !Number.isSafeInteger(used) || !Number.isSafeInteger(quota) ||
    used < 0 || quota < 0 || used > quota) return null;
  return { used, quota, free: quota - used };
}

/** Reading does not request persistence, access a pack or make network calls. */
export async function readStorageDurability(storage: BrowserStorage | undefined): Promise<StorageReading> {
  if (storage === undefined) return EMPTY_READING;
  let readError = false;
  let retention: RetentionState = "UNKNOWN";
  let values: ReturnType<typeof safeCapacity> = null;
  if (typeof storage.persisted === "function") {
    try {
      const result: unknown = await storage.persisted();
      retention = result === true ? "enabled" : result === false ? "not-enabled" : "UNKNOWN";
    } catch { readError = true; }
  }
  if (typeof storage.estimate === "function") {
    try { values = safeCapacity(await storage.estimate()); }
    catch { readError = true; }
  }
  return {
    retention,
    capacity: values === null ? "UNKNOWN" : "known",
    usedBytes: values?.used ?? null,
    quotaBytes: values?.quota ?? null,
    freeBytes: values?.free ?? null,
    canRequest: typeof storage.persist === "function",
    readError,
  };
}

/**
 * Each call is serialised. Only request() invokes the browser's persist API;
 * the host must call request() directly in response to a user's action.
 */
export function createDurabilityController(storage: BrowserStorage | undefined): DurabilityController {
  let state: DurabilityState = { phase: "idle", reading: EMPTY_READING, outcome: "not-requested" };
  let disposed = false;
  let pending: Promise<void> | null = null;
  const subscribers = new Set<(state: DurabilityState) => void>();
  const publish = (next: DurabilityState): void => {
    if (disposed) return;
    state = next;
    for (const subscriber of subscribers) subscriber(next);
  };
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    publish({ ...state, phase: "checking" });
    const task = readStorageDurability(storage).then((reading) => {
      publish({ ...state, reading, phase: "ready" });
    }).finally(() => { pending = null; });
    pending = task;
    return task;
  };
  const request = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    if (typeof storage?.persist !== "function") {
      publish({ ...state, outcome: "unavailable", phase: "ready" });
      return Promise.resolve();
    }
    publish({ ...state, phase: "requesting" });
    const task = (async (): Promise<void> => {
      let outcome: RequestOutcome;
      try {
        const accepted: unknown = await storage.persist?.();
        outcome = accepted === true ? "enabled" : accepted === false ? "not-enabled" : "error";
      } catch { outcome = "error"; }
      const reading = await readStorageDurability(storage);
      publish({ reading, outcome, phase: "ready" });
    })().finally(() => { pending = null; });
    pending = task;
    return task;
  };
  return {
    getState: () => state,
    subscribe(subscriber) {
      if (!disposed) subscribers.add(subscriber);
      return () => { subscribers.delete(subscriber); };
    },
    refresh,
    request,
    dispose() { disposed = true; subscribers.clear(); },
  };
}

export interface DurabilityCell {
  readonly id: string;
  readonly offline: "saved" | "UNKNOWN";
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly tier: "UNKNOWN";
  readonly expectedBytes: number;
}

export interface DurabilityReport {
  readonly schema: "offline-storage-durability-v1";
  readonly region: string;
  readonly recordedOn: string;
  readonly retention: RetentionState;
  readonly usedBytes: number | null;
  readonly quotaBytes: number | null;
  readonly freeBytes: number | null;
  readonly capacity: CapacityState;
  readonly cells: readonly DurabilityCell[];
}

/**
 * Match every ID and provenance field before showing a cell as saved.
 * An invalid, partial or mismatched inventory fails closed for every cell.
 */
export function createDurabilityReport(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  reading: StorageReading,
  recordedOn: string,
): DurabilityReport {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(recordedOn) &&
    Number.isFinite(Date.parse(`${recordedOn}T00:00:00Z`)) &&
    new Date(`${recordedOn}T00:00:00Z`).toISOString().slice(0, 10) === recordedOn;
  if (!validDate) throw new RangeError("Invalid report date");
  const expected = new Set<string>();
  let manifestUsable = Boolean(manifest.regionId.trim());
  for (const cell of manifest.cells) {
    if (!cell.id.trim() || expected.has(cell.id) ||
      !Number.isSafeInteger(cell.bytes) || cell.bytes < 0 ||
      !cell.provenance.source.trim() || !cell.provenance.licence.trim() ||
      !cell.provenance.date.trim()) manifestUsable = false;
    expected.add(cell.id);
  }
  const observed = new Map<string, RegionInventory["cells"][number]>();
  let inventoryUsable = inventory !== null && inventory.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length;
  if (inventory !== null) {
    for (const cell of inventory.cells) {
      if (observed.has(cell.id) || !expected.has(cell.id)) inventoryUsable = false;
      observed.set(cell.id, cell);
    }
  }
  const cells = manifest.cells.map((cell): DurabilityCell => {
    const local = observed.get(cell.id);
    const match = manifestUsable && inventoryUsable && local !== undefined &&
      local.id === cell.id && local.expectedBytes === cell.bytes &&
      local.provenance.source === cell.provenance.source &&
      local.provenance.licence === cell.provenance.licence &&
      local.provenance.date === cell.provenance.date &&
      local.state === "saved" && local.cause === "present";
    return {
      id: cell.id,
      offline: match ? "saved" : "UNKNOWN",
      source: cell.provenance.source,
      licence: cell.provenance.licence,
      date: cell.provenance.date,
      expectedBytes: cell.bytes,
      tier: "UNKNOWN",
    };
  });
  return {
    schema: "offline-storage-durability-v1", region: manifest.regionId,
    recordedOn, retention: reading.retention,
    usedBytes: reading.usedBytes, quotaBytes: reading.quotaBytes,
    freeBytes: reading.freeBytes, capacity: reading.capacity, cells,
  };
}

export function jsonDurabilityReport(report: DurabilityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Text exports do not preserve untrusted newline or direction-control metadata. */
function safeText(value: string): string {
  return value.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ");
}

export function textDurabilityReport(report: DurabilityReport, language: Language): string {
  const copy = DURABILITY_COPY[language];
  const colon = language === "fr" ? "\u00a0:" : ":";
  const metric = (value: number | null) => value === null ? copy.unknown : `${value} B`;
  const lines = [
    copy.title,
    `${copy.region}${colon} ${safeText(report.region)}`,
    `${copy.date}${colon} ${safeText(report.recordedOn)}`,
    `${copy.retention}${colon} ${copy[report.retention]}`,
    `${copy.capacity}${colon} ${report.capacity === "known" ? copy.capacityKnown : copy.unknown}`,
    `${copy.used}${colon} ${metric(report.usedBytes)}`,
    `${copy.free}${colon} ${metric(report.freeBytes)}`,
    copy.localOnly,
  ];
  for (const cell of report.cells) {
    lines.push("", safeText(cell.id),
      `${copy.offline}${colon} ${cell.offline === "saved" ? copy.saved : copy.unknown}`,
      `${copy.source}${colon} ${safeText(cell.source)}`,
      `${copy.licence}${colon} ${safeText(cell.licence)}`,
      `${copy.date}${colon} ${safeText(cell.date)}`,
      `${copy.tier}${colon} ${copy.unknown}`,
      `${copy.expected}${colon} ${metric(cell.expectedBytes)}`);
  }
  return `${lines.join("\n")}\n`;
}

export const DURABILITY_COPY = {
  en: {
    title: "Offline storage retention",
    description: "Review browser storage and request stronger retention on this device.",
    inspect: "Check storage again",
    request: "Request storage retention",
    busy: "Checking browser storage…",
    requesting: "Requesting storage retention…",
    enabled: "Browser reports that retention is enabled. Data can still be removed.",
    "not-enabled": "Browser reports that retention is not enabled.",
    UNKNOWN: "UNKNOWN",
    unavailable: "This browser does not offer a retention request.",
    error: "The retention request could not be completed.",
    retention: "Retention preference",
    capacity: "Storage estimate",
    capacityKnown: "Available estimate",
    free: "Estimated free bytes",
    used: "Estimated used bytes",
    region: "Region",
    date: "Date",
    offline: "Offline cell copy",
    source: "Source",
    licence: "Licence",
    tier: "Evidence tier",
    expected: "Listed bytes",
    unknown: "UNKNOWN",
    saved: "Saved",
    localOnly: "This report contains metadata only. It does not establish physical accessibility.",
    exportText: "Save storage report as text",
    exportJson: "Save storage report as JSON",
    readError: "Some browser storage details could not be read.",
  },
  fr: {
    title: "Conservation du stockage hors ligne",
    description: "Examinez le stockage du navigateur et demandez une conservation renforcée sur cet appareil.",
    inspect: "Examiner le stockage de nouveau",
    request: "Demander la conservation du stockage",
    busy: "Examen du stockage du navigateur…",
    requesting: "Demande de conservation du stockage…",
    enabled: "Le navigateur indique que la conservation est activée. Les données peuvent toujours être supprimées.",
    "not-enabled": "Le navigateur indique que la conservation n’est pas activée.",
    UNKNOWN: "UNKNOWN",
    unavailable: "Ce navigateur ne propose pas de demande de conservation.",
    error: "La demande de conservation n’a pas pu aboutir.",
    retention: "Préférence de conservation",
    capacity: "Estimation du stockage",
    capacityKnown: "Estimation disponible",
    free: "Octets libres estimés",
    used: "Octets utilisés estimés",
    region: "Région",
    date: "Date",
    offline: "Copie de cellule hors ligne",
    source: "Source",
    licence: "Licence",
    tier: "Niveau de documentation",
    expected: "Octets indiqués",
    unknown: "UNKNOWN",
    saved: "Enregistrée",
    localOnly: "Ce rapport contient uniquement des métadonnées. Il ne décrit pas l’accessibilité physique.",
    exportText: "Enregistrer le rapport en texte",
    exportJson: "Enregistrer le rapport en JSON",
    readError: "Certains renseignements du stockage du navigateur n’ont pas pu être lus.",
  },
} as const;
