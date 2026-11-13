import {
  LOCAL_USER_ID,
  estimateEntryBytes,
  validateCacheEntry,
  validateOutboxNote,
  validateProfile,
  withdrawConsent,
  withinStorageLimit,
  type CacheEntry,
  type CacheKind,
  type FieldIssue,
  type OutboxItem,
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

export async function enqueueReport(note: string, basedOnRecordId: string | null, nowIso: string): Promise<OutboxItem> {
  const issues = validateOutboxNote(note);
  if (issues.length > 0) throw new StorageError(issues);
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    created_at: nowIso,
    kind: "correction-report",
    based_on_record_id: basedOnRecordId,
    note: note.trim(),
    status: "queued-on-device",
  };
  await db.outbox.put(item);
  return item;
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

function enteredLine(label: string, value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return `${label}: ${String(value)}`;
}

/** Plain text of fields the person entered. Empty fields and system keys are omitted. */
export function exportProfileText(profile: UserProfile): string {
  const lines = ["the App — preferences entered on this device"];
  const push = (label: string, value: string | number | boolean | null | undefined) => {
    const line = enteredLine(label, value);
    if (line) lines.push(line);
  };
  push("Language", profile.language_preference);
  push("Region", profile.region_preference);
  push("Equipment", profile.equipment_type_general);
  push("Chair width mm", profile.chair_width_mm);
  push("Chair length mm", profile.chair_length_mm);
  push("Transfer side", profile.transfer_side_preference);
  push("Support person travels", profile.attendant_travels);
  push("Route preference", profile.routing_preference);
  if (profile.text_size_preference !== "system") push("Text size", profile.text_size_preference);
  push("Reduced motion", profile.reduced_motion_preference);
  push("Higher contrast", profile.high_contrast_preference);
  push("Screen reader", profile.screen_reader_user);
  push("Switch or voice", profile.switch_or_voice_user);
  if (!profile.offline_pack_preferences.wifi_only) push("Wi-Fi only downloads", false);
  push("Storage cap MB", profile.offline_pack_preferences.storage_limit_mb);
  for (const record of profile.consent_records) {
    if (record.withdrawn_at) push("Consent withdrawn", record.withdrawn_at);
    else push("Consent to store on this device", record.granted_at);
  }
  if (lines.length === 1) lines.push("No preferences were entered.");
  return `${lines.join("\n")}\n`;
}

export function exportProfileJson(profile: UserProfile): string {
  return JSON.stringify(profile, null, 2);
}
