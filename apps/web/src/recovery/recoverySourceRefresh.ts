/** Manual, offline provenance review. No observation authorizes use of a pack. */
export const REFRESH_SCHEMA = "the-app.recovery-source-refresh.v1" as const;
export const REFRESH_LIMITS = Object.freeze({
  bytes: 512_000, subjects: 300, observations: 1_500, reviews: 1_500,
  identifier: 100, text: 800, reference: 300,
});
export const REFRESH_TOPICS = ["pack", "content", "licence", "integrity", "handoff", "other"] as const;
export const REFRESH_CONDITIONS = ["UNKNOWN", "available", "unavailable", "needs-review"] as const;
export const REFRESH_TIERS = ["UNKNOWN", "self-reported", "documented", "reviewed"] as const;
export const REFRESH_DECISIONS = ["review-needed", "reviewed", "reopened"] as const;
export type RefreshTopic = typeof REFRESH_TOPICS[number];
export type RefreshCondition = typeof REFRESH_CONDITIONS[number];
export type RefreshTier = typeof REFRESH_TIERS[number];
export type RefreshDecision = typeof REFRESH_DECISIONS[number];
export type RefreshIssue = "format" | "limit" | "identity" | "text" | "date" | "source" | "reference" | "duplicate" | "order" | "conflict" | "transition";
export type RefreshResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: RefreshIssue };

export interface RefreshProvenance {
  readonly name: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: RefreshTier;
  readonly reference: string;
}
export interface RefreshSubject {
  readonly id: string;
  readonly packId: string;
  readonly topic: RefreshTopic;
  readonly title: string;
  readonly startedAt: string;
}
export interface RefreshObservation {
  readonly id: string;
  readonly subjectId: string;
  readonly observedAt: string;
  readonly condition: RefreshCondition;
  readonly source: RefreshProvenance;
  readonly note: string;
}
export interface RefreshReview {
  readonly id: string;
  readonly subjectId: string;
  readonly at: string;
  readonly decision: RefreshDecision;
  readonly note: string;
}
export interface RefreshDocument {
  readonly schema: typeof REFRESH_SCHEMA;
  readonly subjects: readonly RefreshSubject[];
  readonly observations: readonly RefreshObservation[];
  readonly reviews: readonly RefreshReview[];
}
export interface RefreshFilter {
  readonly contains?: string;
  readonly topic?: RefreshTopic;
  readonly condition?: RefreshCondition;
  readonly packId?: string;
  readonly needsReview?: boolean;
}
export interface RefreshMergePreview {
  readonly addedSubjects: number;
  readonly addedObservations: number;
  readonly addedReviews: number;
  readonly sharedSubjects: number;
  readonly conflicts: number;
  readonly canMerge: boolean;
}
export interface RefreshSummary {
  readonly subjects: number;
  readonly observations: number;
  readonly reviews: number;
  readonly packs: number;
  readonly unknown: number;
  readonly unresolved: number;
}

export const emptyRefreshDocument = (): RefreshDocument => ({ schema: REFRESH_SCHEMA, subjects: [], observations: [], reviews: [] });
const ok = <T>(value: T): RefreshResult<T> => ({ ok: true, value });
const bad = <T>(issue: RefreshIssue): RefreshResult<T> => ({ ok: false, issue });
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(v).length === allowed.length && Object.keys(v).every((key) => allowed.includes(key));
const controls = (v: string): boolean => {
  for (const char of v) {
    const n = char.codePointAt(0) ?? 0;
    if (n < 32 && n !== 9 && n !== 10 && n !== 13) return true;
    if (n === 127) return true;
  }
  return false;
};
const str = (v: unknown, max: number, required = true): v is string =>
  typeof v === "string" && v.length <= max && (!required || v.trim().length > 0) &&
  !controls(v) && (required ? v.trim().length > 0 : true);
const id = (v: unknown): v is string => str(v, REFRESH_LIMITS.identifier) && /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(v);
const oneOf = <T extends string>(v: unknown, choices: readonly T[]): v is T =>
  typeof v === "string" && choices.includes(v as T);
export function refreshCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function refreshInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value.replace(/Z$/u, value.includes(".") ? "Z" : ".000Z");
}
export function checkRefreshSource(v: unknown): v is RefreshProvenance {
  return object(v) && keys(v, ["name", "licence", "retrievedOn", "tier", "reference"]) &&
    str(v.name, REFRESH_LIMITS.text) && str(v.licence, REFRESH_LIMITS.text) &&
    refreshCalendarDay(v.retrievedOn) && oneOf(v.tier, REFRESH_TIERS) && str(v.reference, REFRESH_LIMITS.reference);
}
export function checkRefreshSubject(v: unknown): v is RefreshSubject {
  return object(v) && keys(v, ["id", "packId", "topic", "title", "startedAt"]) &&
    id(v.id) && id(v.packId) && oneOf(v.topic, REFRESH_TOPICS) &&
    str(v.title, REFRESH_LIMITS.text) && refreshInstant(v.startedAt);
}
export function checkRefreshObservation(v: unknown): v is RefreshObservation {
  return object(v) && keys(v, ["id", "subjectId", "observedAt", "condition", "source", "note"]) &&
    id(v.id) && id(v.subjectId) && refreshInstant(v.observedAt) &&
    oneOf(v.condition, REFRESH_CONDITIONS) && checkRefreshSource(v.source) && str(v.note, REFRESH_LIMITS.text, false) &&
    v.source.retrievedOn <= v.observedAt.slice(0, 10);
}
export function checkRefreshReview(v: unknown): v is RefreshReview {
  return object(v) && keys(v, ["id", "subjectId", "at", "decision", "note"]) &&
    id(v.id) && id(v.subjectId) && refreshInstant(v.at) && oneOf(v.decision, REFRESH_DECISIONS) &&
    str(v.note, REFRESH_LIMITS.text, false);
}
const sortedUnique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;
const subjectObservations = (doc: RefreshDocument, subjectId: string): RefreshObservation[] =>
  doc.observations.filter((item) => item.subjectId === subjectId).sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id));
export function refreshObservationsFor(doc: RefreshDocument, subjectId: string): readonly RefreshObservation[] {
  return subjectObservations(doc, subjectId);
}
export function refreshReviewsFor(doc: RefreshDocument, subjectId: string): readonly RefreshReview[] {
  return doc.reviews.filter((item) => item.subjectId === subjectId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
export function latestRefreshObservation(doc: RefreshDocument, subjectId: string): RefreshObservation | null {
  const values = subjectObservations(doc, subjectId);
  return values[values.length - 1] ?? null;
}
export function latestRefreshReview(doc: RefreshDocument, subjectId: string): RefreshReview | null {
  const values = refreshReviewsFor(doc, subjectId);
  return values[values.length - 1] ?? null;
}
/** A later observation makes a previous review insufficient, without changing history. */
export function refreshReviewCurrent(doc: RefreshDocument, subjectId: string): boolean {
  const review = latestRefreshReview(doc, subjectId);
  const observation = latestRefreshObservation(doc, subjectId);
  return review?.decision === "reviewed" && observation !== null && review.at >= observation.observedAt;
}
export function checkRefreshDocument(v: unknown): v is RefreshDocument {
  if (!object(v) || !keys(v, ["schema", "subjects", "observations", "reviews"]) ||
      v.schema !== REFRESH_SCHEMA || !Array.isArray(v.subjects) || !Array.isArray(v.observations) || !Array.isArray(v.reviews)) return false;
  if (v.subjects.length > REFRESH_LIMITS.subjects || v.observations.length > REFRESH_LIMITS.observations || v.reviews.length > REFRESH_LIMITS.reviews) return false;
  if (!v.subjects.every(checkRefreshSubject) || !v.observations.every(checkRefreshObservation) || !v.reviews.every(checkRefreshReview)) return false;
  const subjects = v.subjects as RefreshSubject[];
  const observations = v.observations as RefreshObservation[];
  const reviews = v.reviews as RefreshReview[];
  if (!sortedUnique(subjects.map((x) => x.id)) || !sortedUnique(observations.map((x) => x.id)) || !sortedUnique(reviews.map((x) => x.id))) return false;
  const bySubject = new Map(subjects.map((x) => [x.id, x]));
  for (const observation of observations) {
    const target = bySubject.get(observation.subjectId);
    if (!target || observation.observedAt < target.startedAt) return false;
  }
  for (const review of reviews) {
    const target = bySubject.get(review.subjectId);
    if (!target || review.at < target.startedAt) return false;
    const earlier = observations.some((o) => o.subjectId === review.subjectId && o.observedAt <= review.at);
    if (!earlier) return false;
  }
  for (const subject of subjects) {
    const events = reviews.filter((x) => x.subjectId === subject.id).sort((a, b) => a.at.localeCompare(b.at));
    let state: "draft" | "review-needed" | "reviewed" = "draft";
    for (const event of events) {
      if (event.decision === "review-needed") {
        if (state === "review-needed") return false;
        state = "review-needed";
      } else if (event.decision === "reviewed") {
        if (state !== "review-needed") return false;
        state = "reviewed";
      } else {
        if (state !== "reviewed") return false;
        state = "review-needed";
      }
    }
  }
  return true;
}
export function appendRefreshSubject(doc: RefreshDocument, value: RefreshSubject): RefreshResult<RefreshDocument> {
  if (!checkRefreshDocument(doc)) return bad("format");
  if (!checkRefreshSubject(value)) return bad("identity");
  if (doc.subjects.some((s) => s.id === value.id)) return bad("duplicate");
  if (doc.subjects.length >= REFRESH_LIMITS.subjects) return bad("limit");
  return ok({ ...doc, subjects: [...doc.subjects, value] });
}
export function appendRefreshObservation(doc: RefreshDocument, value: RefreshObservation): RefreshResult<RefreshDocument> {
  if (!checkRefreshDocument(doc)) return bad("format");
  if (!checkRefreshObservation(value)) return bad("source");
  const subject = doc.subjects.find((x) => x.id === value.subjectId);
  if (!subject) return bad("reference");
  if (value.observedAt < subject.startedAt) return bad("order");
  if (doc.observations.some((x) => x.id === value.id)) return bad("duplicate");
  if (doc.observations.length >= REFRESH_LIMITS.observations) return bad("limit");
  const previous = latestRefreshObservation(doc, value.subjectId);
  if (previous && value.observedAt < previous.observedAt) return bad("order");
  return ok({ ...doc, observations: [...doc.observations, value] });
}
export function appendRefreshReview(doc: RefreshDocument, value: RefreshReview): RefreshResult<RefreshDocument> {
  if (!checkRefreshDocument(doc)) return bad("format");
  if (!checkRefreshReview(value)) return bad("text");
  if (!doc.subjects.some((x) => x.id === value.subjectId)) return bad("reference");
  if (doc.reviews.some((x) => x.id === value.id)) return bad("duplicate");
  if (doc.reviews.length >= REFRESH_LIMITS.reviews) return bad("limit");
  const observation = latestRefreshObservation(doc, value.subjectId);
  if (!observation || observation.observedAt > value.at) return bad("order");
  const previous = latestRefreshReview(doc, value.subjectId);
  if (previous && previous.at > value.at) return bad("order");
  const state = previous?.decision ?? null;
  if (value.decision === "review-needed" && (state === "review-needed" || state === "reopened")) return bad("transition");
  if (value.decision === "reviewed" && state !== "review-needed" && state !== "reopened") return bad("transition");
  if (value.decision === "reopened" && state !== "reviewed") return bad("transition");
  return ok({ ...doc, reviews: [...doc.reviews, value] });
}
export function nextRefreshId(doc: RefreshDocument, kind: "subject" | "observation" | "review"): string {
  const ids = kind === "subject" ? doc.subjects.map((x) => x.id) : kind === "observation" ? doc.observations.map((x) => x.id) : doc.reviews.map((x) => x.id);
  const prefix = kind === "subject" ? "source" : kind === "observation" ? "observation" : "review";
  let n = ids.length + 1;
  while (ids.includes(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}
export function exportRefreshDocument(doc: RefreshDocument): RefreshResult<string> {
  if (!checkRefreshDocument(doc)) return bad("format");
  const text = JSON.stringify(doc, null, 2);
  return new TextEncoder().encode(text).byteLength <= REFRESH_LIMITS.bytes ? ok(text) : bad("limit");
}
export function parseRefreshDocument(text: string): RefreshResult<RefreshDocument> {
  if (new TextEncoder().encode(text).byteLength > REFRESH_LIMITS.bytes) return bad("limit");
  let value: unknown;
  try { value = JSON.parse(text); } catch { return bad("format"); }
  return checkRefreshDocument(value) ? ok(value) : bad("format");
}
const different = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);
export function previewRefreshMerge(current: RefreshDocument, incoming: RefreshDocument): RefreshMergePreview {
  if (!checkRefreshDocument(current) || !checkRefreshDocument(incoming)) return {
    addedSubjects: 0, addedObservations: 0, addedReviews: 0, sharedSubjects: 0, conflicts: 1, canMerge: false,
  };
  const find = <T extends { readonly id: string }>(items: readonly T[], key: string): T | undefined => items.find((x) => x.id === key);
  const pairs = [[current.subjects, incoming.subjects], [current.observations, incoming.observations], [current.reviews, incoming.reviews]] as const;
  let conflicts = 0;
  for (const [a, b] of pairs) for (const item of b) {
    const existing = find(a as readonly { readonly id: string }[], item.id);
    if (existing && different(existing, item)) conflicts += 1;
  }
  const addedSubjects = incoming.subjects.filter((x) => !find(current.subjects, x.id)).length;
  const addedObservations = incoming.observations.filter((x) => !find(current.observations, x.id)).length;
  const addedReviews = incoming.reviews.filter((x) => !find(current.reviews, x.id)).length;
  const merged: RefreshDocument = {
    schema: REFRESH_SCHEMA,
    subjects: [...current.subjects, ...incoming.subjects.filter((x) => !find(current.subjects, x.id))],
    observations: [...current.observations, ...incoming.observations.filter((x) => !find(current.observations, x.id))],
    reviews: [...current.reviews, ...incoming.reviews.filter((x) => !find(current.reviews, x.id))],
  };
  if (!checkRefreshDocument(merged)) conflicts += 1;
  return {
    addedSubjects, addedObservations, addedReviews,
    sharedSubjects: incoming.subjects.length - addedSubjects,
    conflicts, canMerge: conflicts === 0,
  };
}
export function mergeRefreshDocuments(current: RefreshDocument, incoming: RefreshDocument): RefreshResult<RefreshDocument> {
  const preview = previewRefreshMerge(current, incoming);
  if (!preview.canMerge) return bad("conflict");
  const has = <T extends { readonly id: string }>(items: readonly T[], key: string): boolean => items.some((x) => x.id === key);
  return ok({
    schema: REFRESH_SCHEMA,
    subjects: [...current.subjects, ...incoming.subjects.filter((x) => !has(current.subjects, x.id))],
    observations: [...current.observations, ...incoming.observations.filter((x) => !has(current.observations, x.id))],
    reviews: [...current.reviews, ...incoming.reviews.filter((x) => !has(current.reviews, x.id))],
  });
}
export function filterRefreshSubjects(doc: RefreshDocument, filter: RefreshFilter): readonly RefreshSubject[] {
  return doc.subjects.filter((subject) => {
    if (filter.packId && filter.packId !== subject.packId) return false;
    if (filter.topic && filter.topic !== subject.topic) return false;
    if (filter.contains && !`${subject.id} ${subject.title} ${subject.packId}`.toLocaleLowerCase().includes(filter.contains.toLocaleLowerCase())) return false;
    const latest = latestRefreshObservation(doc, subject.id);
    if (filter.condition && (latest?.condition ?? "UNKNOWN") !== filter.condition) return false;
    if (filter.needsReview && refreshReviewCurrent(doc, subject.id)) return false;
    return true;
  }).sort((a, b) => a.packId.localeCompare(b.packId) || a.id.localeCompare(b.id));
}
export function summarizeRefresh(doc: RefreshDocument): RefreshSummary {
  return {
    subjects: doc.subjects.length, observations: doc.observations.length, reviews: doc.reviews.length,
    packs: new Set(doc.subjects.map((x) => x.packId)).size,
    unknown: doc.subjects.filter((s) => (latestRefreshObservation(doc, s.id)?.condition ?? "UNKNOWN") === "UNKNOWN").length,
    unresolved: doc.subjects.filter((s) => !refreshReviewCurrent(doc, s.id)).length,
  };
}
/** Documentation never establishes installed pack completeness. */
export function refreshContentReady(): false { return false; }
