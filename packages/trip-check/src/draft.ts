import type { Answer, Prompt, TripDraft } from "./types";

let counter = 0;

function makeId(now: Date): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  counter += 1;
  return `tc-${now.getTime().toString(36)}-${counter}`;
}

export interface DraftOptions {
  place_ref?: string;
  now?: Date;
  id?: string;
}

/**
 * Builds a local draft. Tier is always 0 here: a draft on the device is
 * never a place fact. "UNKNOWN" is stored as "UNKNOWN", never as "no".
 */
export function newDraft(prompt: Prompt, value: Answer, opts: DraftOptions = {}): TripDraft {
  const now = opts.now ?? new Date();
  const id = opts.id ?? makeId(now);
  const draft: TripDraft = {
    id,
    field_id: prompt.field_id,
    prompt_id: prompt.id,
    value,
    source_id: "trip-check-device",
    source_key: id,
    licence: "CC0",
    retrieved_at: now.toISOString(),
    tier: 0,
    observed: prompt.observed,
    state: "local",
  };
  if (opts.place_ref) draft.place_ref = opts.place_ref;
  return draft;
}
