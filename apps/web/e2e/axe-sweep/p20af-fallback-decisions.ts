/** Read-only offline fallback policy and review trails; no eligibility or location claims. */
import { dateIsValid, normalized, safeRoute, type Locale, type Problem, type Connection } from "./p20af-transition-ledger.ts";
import { type Resource, cacheClaim } from "./p20af-resource-audit.ts";
export type View = "available" | "partial" | "unavailable" | "unknown";
export type Reason = "offline" | "missing" | "stale" | "request-failed" | "user-cancelled" | "unknown";
export type Operation = "read" | "export" | "search" | "navigate" | "review";
export interface Requirement { id: string; resourceId: string; essential: boolean; operation: Operation; }
export interface Experience { route: string; locale: Locale; connection: Connection; requested: Operation; resources: readonly Resource[]; requirements: readonly Requirement[]; }
export interface Decision { view: View; reason: Reason; availableIds: string[]; missingIds: string[]; unresolvedIds: string[]; allowLocalRead: boolean; allowExport: boolean; }
export interface Review { id: string; locale: Locale; route: string; source: string | null; licence: string | null; retrievedOn: string | null; tier: string | null; status: "KNOWN" | "UNKNOWN"; }
export interface ReviewItem { id: string; title: string; detail: string; locale: Locale; kind: "information" | "action" | "warning"; }
export interface ReviewTrail { before: readonly Review[]; after: readonly Review[]; action: string; preserve: boolean; }
export interface ReviewFinding extends Problem { id: string; }
const finding = (code: string, id: string, detail: string, severity: Problem["severity"] = "error"): ReviewFinding => ({ code, id, detail, severity, at: 0 });
export const TEXT = {
  en: {
    unknown: "UNKNOWN", offline: "Offline", partial: "Some information is unavailable.",
    missing: "This information is not saved on this device.", stale: "The saved copy may be out of date.",
    failed: "The request could not be completed.", cancel: "The action was cancelled.",
    source: "Source", licence: "Licence", date: "Retrieved on", tier: "Evidence tier",
    retry: "Try again", back: "Go back", review: "Review saved information", export: "Export local copy",
  },
  fr: {
    unknown: "UNKNOWN", offline: "Hors ligne", partial: "Certaines informations sont indisponibles.",
    missing: "Ces informations ne sont pas enregistrées sur cet appareil.", stale: "La copie enregistrée pourrait être périmée.",
    failed: "La demande n’a pas pu être terminée.", cancel: "L’action a été annulée.",
    source: "Source", licence: "Licence", date: "Date de consultation", tier: "Niveau de preuve",
    retry: "Réessayer", back: "Retour", review: "Examiner les informations enregistrées", export: "Exporter la copie locale",
  },
} as const;
export type TextKey = keyof typeof TEXT.en;
export function localized(locale: Locale, key: TextKey): string { return TEXT[locale][key]; }
export function decide(experience: Experience): Decision {
  const byId = new Map(experience.resources.map((resource) => [resource.id, resource]));
  const relevant = experience.requirements.filter((requirement) => requirement.operation === experience.requested);
  const availableIds: string[] = [];
  const missingIds: string[] = [];
  const unresolvedIds: string[] = [];
  for (const requirement of relevant) {
    const resource = byId.get(requirement.resourceId);
    const state = resource ? cacheClaim(resource) : "not-usable";
    if (state === "usable") availableIds.push(requirement.id);
    else if (state === "not-usable") missingIds.push(requirement.id);
    else unresolvedIds.push(requirement.id);
  }
  const essential = relevant.filter((item) => item.essential);
  const missingEssential = essential.some((item) => missingIds.includes(item.id));
  const unknownEssential = essential.some((item) => unresolvedIds.includes(item.id));
  let view: View = "available";
  if (missingEssential) view = availableIds.length ? "partial" : "unavailable";
  else if (unknownEssential) view = "unknown";
  else if (missingIds.length || unresolvedIds.length) view = "partial";
  if (relevant.length === 0) view = "unknown";
  const hasFailure = experience.resources.some((resource) => resource.requestState === "failed");
  const hasStale = experience.resources.some((resource) => resource.cache === "stale");
  const reason: Reason = experience.connection === "offline" ? "offline" :
    hasFailure ? "request-failed" : hasStale ? "stale" : missingIds.length ? "missing" : "unknown";
  const allowLocalRead = (view === "available" || view === "partial") && availableIds.length > 0;
  const allowExport = experience.requested === "export" && view === "available" && availableIds.length > 0;
  return { view, reason, availableIds, missingIds, unresolvedIds, allowLocalRead, allowExport };
}
export function experienceFindings(experience: Experience): ReviewFinding[] {
  const issues: ReviewFinding[] = [];
  if (!safeRoute(experience.route)) issues.push(finding("experience-route", experience.route, experience.route));
  const resources = new Set(experience.resources.map((resource) => resource.id));
  const ids = new Set<string>();
  for (const requirement of experience.requirements) {
    if (!requirement.id.trim()) issues.push(finding("requirement-id-empty", requirement.id, requirement.operation));
    if (ids.has(requirement.id)) issues.push(finding("requirement-duplicate", requirement.id, requirement.operation));
    ids.add(requirement.id);
    if (!resources.has(requirement.resourceId)) issues.push(finding("requirement-resource-missing", requirement.id, requirement.resourceId));
  }
  const decision = decide(experience);
  if (decision.view === "unknown") issues.push(finding("experience-unknown", experience.route, "Insufficient observed resource evidence", "information"));
  if (decision.view === "unavailable") issues.push(finding("experience-unavailable", experience.route, decision.reason, "warning"));
  if (decision.allowExport && experience.connection === "offline" && experience.resources.some((item) => item.sensitive === "private")) issues.push(finding("private-export-risk", experience.route, "Private resource in offline export"));
  return issues;
}
export function knownReview(review: Review): boolean {
  return review.status === "KNOWN" && normalized(review.source) !== "UNKNOWN" &&
    normalized(review.licence) !== "UNKNOWN" && normalized(review.tier) !== "UNKNOWN" && dateIsValid(review.retrievedOn);
}
export function reviewFindings(reviews: readonly Review[]): ReviewFinding[] {
  const issues: ReviewFinding[] = [];
  const ids = new Set<string>();
  for (const review of reviews) {
    if (ids.has(review.id)) issues.push(finding("review-id-duplicate", review.id, review.route));
    ids.add(review.id);
    if (!safeRoute(review.route)) issues.push(finding("review-invalid-route", review.id, review.route));
    if (!review.id.trim()) issues.push(finding("review-id-empty", review.id, review.route));
    if (review.status === "KNOWN" && !knownReview(review)) issues.push(finding("review-unsupported-known", review.id, review.route));
    if (!dateIsValid(review.retrievedOn)) issues.push(finding("review-date-unknown", review.id, review.route, "information"));
    if (normalized(review.source) === "UNKNOWN") issues.push(finding("review-source-unknown", review.id, review.route, "information"));
    if (normalized(review.licence) === "UNKNOWN") issues.push(finding("review-licence-unknown", review.id, review.route, "information"));
    if (normalized(review.tier) === "UNKNOWN") issues.push(finding("review-tier-unknown", review.id, review.route, "information"));
  }
  return issues;
}
export function trailFindings(trail: ReviewTrail): ReviewFinding[] {
  const issues = reviewFindings(trail.after);
  if (!trail.preserve) return issues;
  const after = new Map(trail.after.map((item) => [item.id, item]));
  for (const before of trail.before) {
    const current = after.get(before.id);
    if (!current) { issues.push(finding("review-lost", before.id, trail.action)); continue; }
    if (current.source !== before.source || current.licence !== before.licence ||
      current.retrievedOn !== before.retrievedOn || current.tier !== before.tier) issues.push(finding("review-provenance-drift", before.id, trail.action));
    if (current.status === "KNOWN" && before.status === "UNKNOWN") issues.push(finding("review-unknown-promoted", before.id, trail.action));
  }
  return issues;
}
export function reviewItems(experience: Experience): ReviewItem[] {
  const decision = decide(experience);
  const locale = experience.locale;
  const items: ReviewItem[] = [];
  if (experience.connection === "offline") items.push({ id: "connection", title: localized(locale, "offline"), detail: localized(locale, "partial"), locale, kind: "information" });
  if (decision.missingIds.length) items.push({ id: "missing", title: localized(locale, "unknown"), detail: localized(locale, "missing"), locale, kind: "warning" });
  if (decision.unresolvedIds.length) items.push({ id: "unresolved", title: localized(locale, "unknown"), detail: localized(locale, "partial"), locale, kind: "information" });
  if (experience.resources.some((item) => item.cache === "stale")) items.push({ id: "stale", title: localized(locale, "unknown"), detail: localized(locale, "stale"), locale, kind: "warning" });
  if (experience.resources.some((item) => item.requestState === "failed")) items.push({ id: "failed", title: localized(locale, "unknown"), detail: localized(locale, "failed"), locale, kind: "warning" });
  if (decision.allowLocalRead) items.push({ id: "review", title: localized(locale, "review"), detail: localized(locale, "review"), locale, kind: "action" });
  if (decision.allowExport) items.push({ id: "export", title: localized(locale, "export"), detail: localized(locale, "export"), locale, kind: "action" });
  return items;
}
export function reviewText(experience: Experience): string {
  const items = reviewItems(experience);
  return items.map((item) => `${item.title}: ${item.detail}`).join("\n");
}
export function distinctReviewGroups(reviews: readonly Review[]): Record<Locale, { known: number; unknown: number }> {
  const grouped = { en: { known: 0, unknown: 0 }, fr: { known: 0, unknown: 0 } };
  for (const review of reviews) {
    const group = grouped[review.locale];
    if (knownReview(review)) group.known += 1;
    else group.unknown += 1;
  }
  return grouped;
}
