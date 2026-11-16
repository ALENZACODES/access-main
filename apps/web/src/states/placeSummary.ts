/**
 * Place summary view model. Lists each detail with its status and source.
 * There is deliberately no overall score or "accessible" badge for a place.
 */
import type { Locale } from "./stateCopy";
import { MIN_TOUCH_TARGET_PX } from "./stateCopy";
import { type FeatureReportInput, type FeatureStatus, evaluateAll, featureLabel, statusText } from "./dataStatus";
import { STALE_AFTER_DAYS, ageLabel, attributionLine, isStale } from "./provenance";
import { t } from "./typography";

export interface PlaceReport {
  readonly name: string;
  readonly features: readonly FeatureReportInput[];
}

export interface SummaryRow {
  readonly feature: FeatureStatus["feature"];
  readonly label: string;
  readonly status: FeatureStatus["status"];
  readonly statusText: string;
  readonly ariaLabel: string;
  readonly sourceLine: string | null;
  readonly ageText: string | null;
  readonly stale: boolean;
  /** Size of the "show source" control for this row. */
  readonly detailsTargetPx: number;
}

export interface PlaceSummary {
  readonly name: string;
  readonly rows: readonly SummaryRow[];
  readonly knownCount: number;
  readonly unknownCount: number;
  readonly countsText: string;
  readonly staleNotice: string | null;
  readonly sources: readonly string[];
}

export function summarizePlace(place: PlaceReport, locale: Locale, today: string): PlaceSummary {
  const statuses = evaluateAll(place.features);

  const rows: SummaryRow[] = statuses.map((s) => {
    const label = featureLabel(s.feature, locale);
    const text = statusText(s.status, locale);
    const p = s.provenance;
    return {
      feature: s.feature,
      label,
      status: s.status,
      statusText: text,
      ariaLabel: t(locale, `${label}: ${text}`, `${label} : ${text}`),
      sourceLine: p ? attributionLine(p, locale) : null,
      ageText: p ? ageLabel(p.retrievedOn, today, locale) : null,
      stale: p ? isStale(p.retrievedOn, today) : false,
      detailsTargetPx: MIN_TOUCH_TARGET_PX,
    };
  });

  const known = rows.filter((r) => r.status !== "unknown").length;
  const unknown = rows.length - known;

  const countsText = t(
    locale,
    `${known} of ${rows.length} details reported, ${unknown} UNKNOWN`,
    `${known} détail${known > 1 ? "s" : ""} sur ${rows.length} signalé${known > 1 ? "s" : ""}, ${unknown} INCONNU${unknown > 1 ? "S" : ""}`,
  );

  const anyStale = rows.some((r) => r.stale);
  const staleNotice = anyStale
    ? t(
        locale,
        `Some details were retrieved more than ${STALE_AFTER_DAYS} days ago and may be out of date.`,
        `Certains détails ont été consultés il y a plus de ${STALE_AFTER_DAYS} jours et pourraient être périmés.`,
      )
    : null;

  const sources = [...new Set(rows.map((r) => r.sourceLine).filter((s): s is string => s !== null))];

  return { name: place.name, rows, knownCount: known, unknownCount: unknown, countsText, staleNotice, sources };
}
