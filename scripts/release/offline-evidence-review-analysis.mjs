/** Deterministic offline inventory diff, not a guarantee about conditions at a place. */
const TRACKED = Object.freeze(['placeId', 'type', 'label', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'note']);
export function compare(before, after) {
  const left = new Map((before?.records ?? []).map(r => [r.id, r]));
  const right = new Map(after.records.map(r => [r.id, r]));
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
  const changes = [], counts = { added: 0, removed: 0, changed: 0, unchanged: 0, unknown: 0 };
  for (const id of ids) {
    const old = left.get(id), now = right.get(id);
    let kind, fields = [];
    if (!old) kind = 'added';
    else if (!now) kind = 'removed';
    else {
      fields = TRACKED.filter(f => (old[f] ?? null) !== (now[f] ?? null));
      kind = fields.length ? 'changed' : 'unchanged';
    }
    counts[kind]++;
    if (now?.status === 'unknown') counts.unknown++;
    changes.push({ id, kind, fields, before: old ?? null, after: now ?? null });
  }
  return { counts, changes };
}
export function summary(inventory) {
  const counts = { total: inventory.records.length, unknown: 0, reported: 0, 'not-reported': 0, tiers: {} };
  const dates = [];
  for (const record of inventory.records) {
    counts[record.status]++;
    counts.tiers[record.verificationTier] = (counts.tiers[record.verificationTier] ?? 0) + 1;
    dates.push(record.retrievedOn);
  }
  return { ...counts, oldestRetrievedOn: dates.length ? dates.sort()[0] : null };
}
export function filter(records, { placeId = null, status = null, tier = null } = {}) {
  return records.filter(r => (!placeId || r.placeId === placeId) && (!status || r.status === status) && (!tier || r.verificationTier === tier));
}
export function groupByPlace(records) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.placeId)) groups.set(record.placeId, []);
    groups.get(record.placeId).push(record);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([placeId, rows]) => ({ placeId, rows: rows.sort((a, b) => a.id.localeCompare(b.id, 'en')) }));
}
export function risks(inventory, today) {
  const notes = [];
  for (const record of inventory.records) {
    if (record.status === 'unknown') notes.push({ id: record.id, code: 'UNKNOWN' });
    if (record.verificationTier === 'unknown') notes.push({ id: record.id, code: 'TIER_UNKNOWN' });
    const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${record.retrievedOn}T00:00:00Z`)) / 86400000);
    if (days > 365) notes.push({ id: record.id, code: 'OLDER_THAN_YEAR' });
  }
  return notes;
}
