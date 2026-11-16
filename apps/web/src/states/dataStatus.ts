/**
 * Accessibility detail status. Unknown stays UNKNOWN: a detail is only shown as
 * known when it carries valid provenance. "Reported" is deliberately weaker than
 * "verified": the App records who reported a detail, it does not certify it.
 */
import type { Locale } from "./stateCopy";
import { type Provenance, validateProvenance } from "./provenance";
import { t } from "./typography";

export const FEATURE_IDS = [
  "step-free-entrance",
  "automatic-door",
  "elevator",
  "accessible-washroom",
  "accessible-parking",
  "level-path",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type Reported = "yes" | "no" | "partial";
export type Status = Reported | "unknown";

export type UnknownReason = "not-recorded" | "missing-provenance" | "unrecognised-value";

/** Raw input as it may arrive from a data file. Nothing here is trusted. */
export interface FeatureReportInput {
  readonly feature: FeatureId;
  readonly value?: unknown;
  readonly provenance?: unknown;
}

export interface FeatureStatus {
  readonly feature: FeatureId;
  readonly status: Status;
  readonly provenance: Provenance | null;
  readonly unknownReason: UnknownReason | null;
}

const FEATURE_LABELS: Record<FeatureId, { en: string; fr: string }> = {
  "step-free-entrance": { en: "Step-free entrance", fr: "Entrée sans marche" },
  "automatic-door": { en: "Automatic door", fr: "Porte automatique" },
  elevator: { en: "Elevator", fr: "Ascenseur" },
  "accessible-washroom": { en: "Accessible washroom", fr: "Toilettes accessibles" },
  "accessible-parking": { en: "Accessible parking", fr: "Stationnement accessible" },
  "level-path": { en: "Level path to the entrance", fr: "Chemin de niveau jusqu'à l'entrée" },
};

export function featureLabel(id: FeatureId, locale: Locale): string {
  return t(locale, FEATURE_LABELS[id].en, FEATURE_LABELS[id].fr);
}

/** Text for each status. UNKNOWN is never softened into "maybe" or "likely". */
export function statusText(status: Status, locale: Locale): string {
  switch (status) {
    case "yes":
      return t(locale, "Yes (reported)", "Oui (signalé)");
    case "no":
      return t(locale, "No (reported)", "Non (signalé)");
    case "partial":
      return t(locale, "Partly (reported)", "En partie (signalé)");
    case "unknown":
      return t(locale, "UNKNOWN", "INCONNU");
  }
}

function isReported(v: unknown): v is Reported {
  return v === "yes" || v === "no" || v === "partial";
}

/** Turn one raw report into a safe status. Never infers; never upgrades. */
export function evaluateFeature(input: FeatureReportInput): FeatureStatus {
  const unknown = (reason: UnknownReason): FeatureStatus => ({
    feature: input.feature,
    status: "unknown",
    provenance: null,
    unknownReason: reason,
  });
  if (input.value === undefined || input.value === null || input.value === "unknown") {
    return unknown("not-recorded");
  }
  if (!isReported(input.value)) return unknown("unrecognised-value");
  const p = validateProvenance(input.provenance);
  if (!p.ok) return unknown("missing-provenance");
  return { feature: input.feature, status: input.value, provenance: p.value, unknownReason: null };
}

/** One status per known feature id, in fixed order; unlisted features are UNKNOWN. */
export function evaluateAll(inputs: readonly FeatureReportInput[]): FeatureStatus[] {
  const byId = new Map<FeatureId, FeatureReportInput>();
  for (const i of inputs) if (!byId.has(i.feature)) byId.set(i.feature, i);
  return FEATURE_IDS.map((id) => evaluateFeature(byId.get(id) ?? { feature: id }));
}
