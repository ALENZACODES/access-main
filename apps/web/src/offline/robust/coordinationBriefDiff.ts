import { assertCoordinationBrief, type CoordinationBrief } from "./coordinationBrief";
export type BriefChangeKind = "added" | "removed" | "moved" | "wording" | "status" | "source" | "unchanged";
export interface BriefChange {
  readonly id: string;
  readonly kinds: readonly BriefChangeKind[];
  readonly previousLabel: string | null;
  readonly incomingLabel: string | null;
}
export interface BriefDiff {
  readonly status: "ready" | "UNKNOWN";
  readonly currentCount: number;
  readonly incomingCount: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly moved: number;
  readonly newReplies: number;
  readonly sourceChanges: number;
  readonly unchanged: number;
  readonly rows: readonly BriefChange[];
}
/**
 * Compares two user-authored offline briefs. It does not infer changes to any real place.
 * A region mismatch is UNKNOWN, never a claim that one brief supersedes another.
 */
export function compareCoordinationBrief(current: CoordinationBrief, incoming: CoordinationBrief): BriefDiff {
  assertCoordinationBrief(current);
  assertCoordinationBrief(incoming);
  if (current.regionId !== incoming.regionId) {
    return { status: "UNKNOWN", currentCount: current.steps.length, incomingCount: incoming.steps.length,
      added: 0, removed: 0, changed: 0, moved: 0, newReplies: 0, sourceChanges: 0,
      unchanged: 0, rows: [] };
  }
  const before = new Map(current.steps.map((step) => [step.id, step]));
  const after = new Map(incoming.steps.map((step) => [step.id, step]));
  const allIds = [...new Set([...current.steps.map((item) => item.id), ...incoming.steps.map((item) => item.id)])];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let moved = 0;
  let newReplies = 0;
  let sourceChanges = 0;
  let unchanged = 0;
  const rows: BriefChange[] = [];
  for (const id of allIds) {
    const a = before.get(id);
    const b = after.get(id);
    if (!a) {
      added += 1;
      rows.push({ id, kinds: ["added"], previousLabel: null, incomingLabel: b?.label ?? null });
      continue;
    }
    if (!b) {
      removed += 1;
      rows.push({ id, kinds: ["removed"], previousLabel: a.label, incomingLabel: null });
      continue;
    }
    const kinds: BriefChangeKind[] = [];
    if (a.order !== b.order) { kinds.push("moved"); moved += 1; }
    if (a.status !== b.status) {
      kinds.push("status");
      if (b.status === "reply-recorded" && a.status !== "reply-recorded") newReplies += 1;
    }
    if ((a.provenance === null) !== (b.provenance === null) ||
      (a.provenance !== null && b.provenance !== null &&
        (a.provenance.source !== b.provenance.source || a.provenance.licence !== b.provenance.licence ||
          a.provenance.date !== b.provenance.date))) {
      kinds.push("source");
      sourceChanges += 1;
    }
    if (a.label !== b.label || a.topic !== b.topic || a.priority !== b.priority ||
      a.question !== b.question || a.fallbackQuestion !== b.fallbackQuestion ||
      a.contactMethod !== b.contactMethod || a.note !== b.note) kinds.push("wording");
    if (kinds.length > 0) changed += 1;
    else { unchanged += 1; kinds.push("unchanged"); }
    rows.push({ id, kinds, previousLabel: a.label, incomingLabel: b.label });
  }
  return { status: "ready", currentCount: current.steps.length, incomingCount: incoming.steps.length,
    added, removed, changed, moved, newReplies, sourceChanges, unchanged, rows };
}
/** Human-readable preview, explicitly about user-authored notes rather than accessibility. */
export function coordinationDiffText(diff: BriefDiff, language: "en" | "fr"): string {
  if (diff.status === "UNKNOWN") return language === "fr"
    ? "UNKNOWN\u00A0: les régions des deux fiches sont différentes."
    : "UNKNOWN: the two briefs use different regions.";
  const values = language === "fr"
    ? [`Ajoutés\u00A0: ${diff.added}`, `Retirés\u00A0: ${diff.removed}`, `Modifiés\u00A0: ${diff.changed}`,
      `Déplacés\u00A0: ${diff.moved}`, `Nouvelles réponses notées\u00A0: ${diff.newReplies}`, `Sources modifiées\u00A0: ${diff.sourceChanges}`]
    : [`Added: ${diff.added}`, `Removed: ${diff.removed}`, `Changed: ${diff.changed}`,
      `Moved: ${diff.moved}`, `New recorded replies: ${diff.newReplies}`, `Source metadata changes: ${diff.sourceChanges}`];
  return values.join(". ") + ".";
}
