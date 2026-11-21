// The wording of each optional choice, version by version, so that a change to what a person agreed to cannot slip
// through. Each choice has a wording version. A person's answer counts only under the version it was given for, so
// changing the words without raising the version would carry an old yes over to a new meaning. This list keeps every
// version's words. The audit fails when a choice's current words differ from the newest version here, when the
// version number is not the newest version here, or when a new version says nothing about what changed.

import type { ConsentState, Purpose } from "./consent";
import { hasChange } from "./wordDiff";
import type { Bilingual } from "./inventory";

export interface WordingVersion {
  version: number;
  label: Bilingual;
  description: Bilingual;
  /** YYYY-MM-DD, or UNKNOWN when the date was not recorded */
  changedOn: string;
  /** What changed, in plain words. Required from the second version on. */
  whatChanged?: Bilingual;
}

export interface WordingHistory {
  purposeId: string;
  /** Oldest first, numbered from 1 with no gaps */
  versions: readonly WordingVersion[];
}

/** The App's own choices. The first version's date was not recorded, so it says UNKNOWN. */
export const LIVE_WORDING_HISTORY: readonly WordingHistory[] = [
  {
    purposeId: "route-reports",
    versions: [
      {
        version: 1,
        label: { en: "Keep my route reports", fr: "Conserver mes signalements de parcours" },
        description: {
          en: "Keep the route reports you write on this device so you can read them again. They are not sent anywhere.",
          fr: "Conserver sur cet appareil les signalements de parcours que vous rédigez, pour les relire. Ils ne sont envoyés nulle part.",
        },
        changedOn: "UNKNOWN",
      },
    ],
  },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Problems in a history, set beside the choices it describes. One plain line each; empty when it is sound. */
export function wordingProblems(purposes: readonly Purpose[], history: readonly WordingHistory[]): string[] {
  const out: string[] = [];
  const byId = new Map(history.map((h) => [h.purposeId, h]));
  const seen = new Set<string>();
  for (const h of history) {
    if (seen.has(h.purposeId)) out.push(`${h.purposeId}: listed twice`);
    seen.add(h.purposeId);
    if (!purposes.some((p) => p.id === h.purposeId)) out.push(`${h.purposeId}: has a history but is not a choice the App offers`);
  }
  for (const p of purposes) {
    const h = byId.get(p.id);
    if (h === undefined || h.versions.length === 0) {
      out.push(`${p.id}: has no wording history`);
      continue;
    }
    h.versions.forEach((v, i) => {
      if (v.version !== i + 1) out.push(`${p.id}: version ${v.version} is in position ${i + 1}; versions must be 1, 2, 3 with no gaps`);
      if (v.changedOn !== "UNKNOWN" && !DATE_RE.test(v.changedOn)) out.push(`${p.id}: version ${v.version} changedOn is neither YYYY-MM-DD nor UNKNOWN`);
      for (const l of ["en", "fr"] as const) {
        if (v.label[l].trim() === "" || v.description[l].trim() === "") out.push(`${p.id}: version ${v.version} has an empty ${l} label or description`);
      }
      if (i > 0) {
        const prev = h.versions[i - 1] as WordingVersion;
        if (v.whatChanged === undefined || v.whatChanged.en.trim() === "" || v.whatChanged.fr.trim() === "") out.push(`${p.id}: version ${v.version} does not say what changed in both languages`);
        const same = (["en", "fr"] as const).every((l) => !hasChange(prev.label[l], v.label[l]) && !hasChange(prev.description[l], v.description[l]));
        if (same) out.push(`${p.id}: version ${v.version} has the same words as version ${prev.version}`);
      }
    });
    const last = h.versions[h.versions.length - 1] as WordingVersion;
    if (last.version !== p.wordingVersion) out.push(`${p.id}: the choice is at wording version ${p.wordingVersion} but the history ends at version ${last.version}`);
    else {
      for (const l of ["en", "fr"] as const) {
        if (last.label[l] !== p.label[l]) out.push(`${p.id}: the ${l} label changed without a new wording version`);
        if (last.description[l] !== p.description[l]) out.push(`${p.id}: the ${l} description changed without a new wording version`);
      }
    }
  }
  return out;
}

export interface WordingChange {
  purposeId: string;
  /** The version the person answered under */
  answeredVersion: number;
  /** The version in force now */
  currentVersion: number;
  /** The date of the answer that no longer counts */
  answeredOn: string;
  answer: "granted" | "declined";
  /** The words the person answered under. Null when that version is not on record, so it is not guessed. */
  before: { label: Bilingual; description: Bilingual } | null;
  after: { label: Bilingual; description: Bilingual };
  /** What changed in each version after the one answered, oldest first. Empty when none is on record. */
  notes: Bilingual[];
}

/** The choices whose stored answer no longer counts, with what changed. Choices with no answer are not listed. */
export function wordingChanges(consent: ConsentState, purposes: readonly Purpose[], history: readonly WordingHistory[]): WordingChange[] {
  const out: WordingChange[] = [];
  for (const p of purposes) {
    const r = consent[p.id];
    if (r === undefined || r.wordingVersion === p.wordingVersion) continue;
    const versions = history.find((h) => h.purposeId === p.id)?.versions ?? [];
    const answered = versions.find((v) => v.version === r.wordingVersion);
    const notes = versions.filter((v) => v.version > r.wordingVersion && v.version <= p.wordingVersion).flatMap((v) => (v.whatChanged === undefined ? [] : [v.whatChanged]));
    out.push({
      purposeId: p.id,
      answeredVersion: r.wordingVersion,
      currentVersion: p.wordingVersion,
      answeredOn: r.decidedOn,
      answer: r.value,
      before: answered === undefined ? null : { label: answered.label, description: answered.description },
      after: { label: p.label, description: p.description },
      notes,
    });
  }
  return out;
}
