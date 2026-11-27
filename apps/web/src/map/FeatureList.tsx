import { useRef } from "react";
import { useTranslation } from "react-i18next";

export type ListFeature = {
  id: string;
  name: string;
  statusCode: "yes" | "partly" | "no" | "unknown";
  status: string;
  /** "Washroom", "Transit stop": what the place is. */
  kind?: string;
  /** "City of Toronto · OGL-Toronto-1.0 · 2026-11-13": the source in one short line. */
  sourceLine?: string;
  source: string;
  licence: string;
  retrievedAt: string;
  retrievedOn: string;
  attribution: string;
};

function colon(locale: string): string {
  return locale === "fr" ? "\u00A0:" : ":";
}

function shown(value: string, unknownLabel: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "UNKNOWN") return unknownLabel;
  return trimmed;
}

export function FeatureList({
  features,
  locale,
  selectedId,
  onSelect,
  listId,
}: {
  features: ListFeature[];
  locale: "en" | "fr";
  selectedId: string | null;
  onSelect: (id: string) => void;
  listId: string;
}) {
  const { t } = useTranslation();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const mark = colon(locale);
  const unknown = t("map.unknown");

  function move(next: number) {
    const count = features.length;
    if (count === 0) return;
    const index = ((next % count) + count) % count;
    const feature = features[index];
    const button = buttons.current[index];
    if (!feature || !button) return;
    onSelect(feature.id);
    button.focus();
  }

  if (features.length === 0) {
    return (
      <p id={listId} tabIndex={-1}>
        {t("map.empty")}
      </p>
    );
  }

  return (
    <ul id={listId} className="feature-list" aria-label={t("map.list")} tabIndex={-1}>
      {features.map((feature, index) => {
        const selected = feature.id === selectedId;
        return (
          <li key={feature.id}>
            <button
              type="button"
              ref={(node) => {
                buttons.current[index] = node;
              }}
              tabIndex={selected || (selectedId === null && index === 0) ? 0 : -1}
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(feature.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  move(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  move(features.length - 1);
                }
              }}
            >
              <span className="feature-name">{feature.name}</span>
              {feature.kind ? <span className="feature-kind">{feature.kind}</span> : null}
              <span className={`status status-${feature.statusCode}`}><i aria-hidden="true" />{feature.status}</span>
              {feature.sourceLine !== undefined ? (
                <span className="feature-detail">{t("map.source")}{mark} {feature.sourceLine || unknown}</span>
              ) : (
                <span className="feature-detail">
                  {t("map.source")}{mark} {shown(feature.source, unknown)}. {t("map.licence")}{mark} {shown(feature.licence, unknown)}.{" "}
                  {feature.attribution ? `${t("map.attribution")}${mark} ${feature.attribution}. ` : ""}
                  {t("map.retrieved")}{mark} {shown(feature.retrievedOn || feature.retrievedAt, unknown)}. {feature.status}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
