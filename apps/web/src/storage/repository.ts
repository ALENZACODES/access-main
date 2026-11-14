import {
  LOCAL_USER_ID,
  estimateEntryBytes,
  validateCacheEntry,
  validateManifest,
  validateObservedAt,
  validateOutboxNote,
  validatePackContent,
  validateProfile,
  withdrawConsent,
  withinStorageLimit,
  type CacheEntry,
  type CacheKind,
  type FieldIssue,
  type OutboxItem,
  type StoredPack,
  type UserProfile,
} from "@access/shared";
import { db } from "./db.ts";

export class StorageError extends Error {
  issues: FieldIssue[];

  constructor(issues: FieldIssue[]) {
    super(issues.map((issue) => `${issue.field}:${issue.code}`).join("; ") || "storage-error");
    this.name = "StorageError";
    this.issues = issues;
  }
}

export interface StorageSummary {
  health: "ok" | "unavailable";
  profile: UserProfile | null;
  cacheCount: number;
  outboxCount: number;
  byKind: Record<CacheKind, number>;
  verifiedClaimCount: number;
  newestStoredAt: string | null;
}

const EMPTY_KINDS: Record<CacheKind, number> = {
  place: 0,
  journey: 0,
  finder: 0,
  "directory-link": 0,
  "help-article": 0,
  "activity-pack": 0,
};

async function safe<T>(action: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action();
  } catch {
    return fallback;
  }
}

export async function storageHealth(): Promise<"ok" | "unavailable"> {
  try {
    await db.open();
    await db.meta.get("health");
    return "ok";
  } catch {
    return "unavailable";
  }
}

export async function getProfile(): Promise<UserProfile | null> {
  return safe(async () => (await db.profiles.get(LOCAL_USER_ID)) ?? null, null);
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const issues = validateProfile(profile);
  if (profile.consent_records.length === 0) issues.push({ field: "consent_records", code: "consent_required" });
  if (issues.length > 0) throw new StorageError(issues);
  const stored: UserProfile = {
    ...profile,
    user_id: LOCAL_USER_ID,
    record_type: "user_profile",
    storage: "device-only",
    account_status: "anonymous",
    saved_places: [],
    saved_trips: [],
    notification_preferences: { local_only: true, remote_channels: [] },
  };
  await db.profiles.put(stored);
  return stored;
}

export async function updateProfileLanguage(language: "en" | "fr", nowIso: string): Promise<void> {
  const existing = await getProfile();
  if (!existing || existing.language_preference === language) return;
  await saveProfile({ ...existing, language_preference: language, updated_at: nowIso });
}

export async function deleteProfile(): Promise<void> {
  await db.profiles.delete(LOCAL_USER_ID);
}

export async function withdrawStoredConsent(nowIso: string): Promise<UserProfile | null> {
  const existing = await getProfile();
  if (!existing) return null;
  const withdrawn = withdrawConsent(existing, nowIso);
  const issues = validateProfile(withdrawn);
  if (issues.length > 0) throw new StorageError(issues);
  await db.profiles.put(withdrawn);
  return withdrawn;
}

export async function listCacheEntries(): Promise<CacheEntry[]> {
  return safe(async () => db.cacheEntries.orderBy("stored_at").reverse().toArray(), []);
}

export async function putCacheEntry(entry: CacheEntry): Promise<void> {
  const issues = validateCacheEntry(entry);
  if (issues.length > 0) throw new StorageError(issues);
  const profile = await getProfile();
  const limit = profile?.offline_pack_preferences.storage_limit_mb ?? null;
  const existing = await db.cacheEntries.toArray();
  const others = existing.filter((item) => item.id !== entry.id);
  const used = others.reduce((sum, item) => sum + estimateEntryBytes(item), 0);
  if (!withinStorageLimit(used, entry, limit)) {
    throw new StorageError([{ field: "payload", code: "over_storage_limit" }]);
  }
  await db.cacheEntries.put(entry);
}

export async function enqueueReport(
  note: string,
  basedOnRecordId: string | null,
  nowIso: string,
  options: { observedAt?: string; madeOffline?: boolean } = {},
): Promise<OutboxItem> {
  const observedAt = options.observedAt ?? nowIso;
  const issues = [...validateOutboxNote(note), ...validateObservedAt(observedAt, nowIso)];
  if (issues.length > 0) throw new StorageError(issues);
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    created_at: nowIso,
    kind: "correction-report",
    based_on_record_id: basedOnRecordId,
    note: note.trim(),
    observed_at: new Date(observedAt).toISOString(),
    made_offline: options.madeOffline ?? false,
    status: "queued-on-device",
  };
  await db.outbox.put(item);
  return item;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return safe(async () => db.outbox.orderBy("created_at").reverse().toArray(), []);
}

/** Stores a pack only when the manifest and every record check out. */
export async function savePack(pack: StoredPack): Promise<void> {
  const issues = [...validateManifest(pack.manifest), ...validatePackContent(pack.content, pack.manifest)];
  if (issues.length > 0) throw new StorageError(issues);
  await db.packs.put(pack);
}

export async function getPack(packId: string): Promise<StoredPack | null> {
  return safe(async () => (await db.packs.get(packId)) ?? null, null);
}

export async function deletePack(packId: string): Promise<void> {
  await db.packs.delete(packId);
}

export async function clearCachedRecords(): Promise<void> {
  await db.transaction("rw", db.cacheEntries, db.outbox, async () => {
    await db.cacheEntries.clear();
    await db.outbox.clear();
  });
}

export async function summarizeStorage(): Promise<StorageSummary> {
  const health = await storageHealth();
  if (health === "unavailable") {
    return {
      health,
      profile: null,
      cacheCount: 0,
      outboxCount: 0,
      byKind: { ...EMPTY_KINDS },
      verifiedClaimCount: 0,
      newestStoredAt: null,
    };
  }
  const [profile, entries, outboxCount] = await Promise.all([
    getProfile(),
    listCacheEntries(),
    safe(() => db.outbox.count(), 0),
  ]);
  const byKind = { ...EMPTY_KINDS };
  let verifiedClaimCount = 0;
  for (const entry of entries) {
    byKind[entry.kind] += 1;
    if (entry.provenance.prototype_label === "VERIFIED" || entry.provenance.tier === 3) verifiedClaimCount += 1;
  }
  return {
    health,
    profile,
    cacheCount: entries.length,
    outboxCount,
    byKind,
    verifiedClaimCount,
    newestStoredAt: entries[0]?.stored_at ?? null,
  };
}

function enteredLine(label: string, value: string | number | null | undefined, separator: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${label}${separator}${String(value)}`;
}

export interface ExportPhrases {
  title: string;
  empty: string;
  language: string;
  languageName: Record<"en" | "fr", string>;
  region: string;
  equipment: string;
  equipmentName: Record<string, string>;
  width: string;
  length: string;
  transfer: string;
  transferName: Record<string, string>;
  attendant: string;
  yes: string;
  no: string;
  routing: string;
  routingName: Record<string, string>;
  textSize: string;
  textSizeName: Record<string, string>;
  motion: string;
  motionReduce: string;
  motionAllow: string;
  contrast: string;
  on: string;
  off: string;
  screenReader: string;
  switchOrVoice: string;
  wifi: string;
  storage: string;
  consent: string;
  withdrawn: string;
  /** English uses ": ". French uses a narrow no-break space before the colon. */
  separator: ": " | "\u202f: ";
}

function named(names: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return names[value] || null;
}

function yesNo(phrases: ExportPhrases, value: boolean | null): string | null {
  if (value === true) return phrases.yes;
  if (value === false) return phrases.no;
  return null;
}

/**
 * Plain text of fields the person entered, in the phrases' language.
 * Empty fields, system keys, and raw enum codes are omitted.
 */
export function exportProfileText(profile: UserProfile, phrases: ExportPhrases): string {
  const lines = [phrases.title];
  const push = (label: string, value: string | number | null | undefined) => {
    const line = enteredLine(label, value, phrases.separator);
    if (line) lines.push(line);
  };
  push(phrases.language, phrases.languageName[profile.language_preference]);
  push(phrases.region, profile.region_preference);
  push(phrases.equipment, named(phrases.equipmentName, profile.equipment_type_general));
  push(phrases.width, profile.chair_width_mm);
  push(phrases.length, profile.chair_length_mm);
  push(phrases.transfer, named(phrases.transferName, profile.transfer_side_preference));
  push(phrases.attendant, yesNo(phrases, profile.attendant_travels));
  push(phrases.routing, named(phrases.routingName, profile.routing_preference));
  if (profile.text_size_preference !== "system") {
    push(phrases.textSize, named(phrases.textSizeName, profile.text_size_preference));
  }
  if (profile.reduced_motion_preference === true) push(phrases.motion, phrases.motionReduce);
  if (profile.reduced_motion_preference === false) push(phrases.motion, phrases.motionAllow);
  if (profile.high_contrast_preference === true) push(phrases.contrast, phrases.on);
  if (profile.high_contrast_preference === false) push(phrases.contrast, phrases.off);
  push(phrases.screenReader, yesNo(phrases, profile.screen_reader_user));
  push(phrases.switchOrVoice, yesNo(phrases, profile.switch_or_voice_user));
  if (!profile.offline_pack_preferences.wifi_only) push(phrases.wifi, phrases.no);
  push(phrases.storage, profile.offline_pack_preferences.storage_limit_mb);
  for (const record of profile.consent_records) {
    if (record.withdrawn_at) push(phrases.withdrawn, record.withdrawn_at);
    else push(phrases.consent, record.granted_at);
  }
  if (lines.length === 1) lines.push(phrases.empty);
  return `${lines.join("\n")}\n`;
}

export function exportProfileJson(profile: UserProfile): string {
  return JSON.stringify(profile, null, 2);
}
