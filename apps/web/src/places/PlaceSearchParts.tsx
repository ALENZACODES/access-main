import { useEffect, useId, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { sharedPackSource } from "./packAccess.ts";
import { say, type Locale } from "./copy.ts";

const TARGET = { minHeight: 44, display: "inline-flex", alignItems: "center" } as const;
/** The area searched until the person picks another. */
export const DEFAULT_SEARCH_REGION = "toronto";

type RegionOption = { id: string; label: string; bytes: number };

function sizeWords(locale: Locale, bytes: number): string {
  const mb = bytes / 1_000_000;
  const text = mb >= 1 ? `${mb.toFixed(1)}\u00a0MB` : `${Math.max(1, Math.round(bytes / 1000))}\u00a0KB`;
  return locale === "fr" ? text.replace(".", ",").replace("MB", "Mo").replace("KB", "ko") : text;
}

/** A plain select of the pack's regions, with the size of each region's search list. */
export function RegionPicker({ value, onChange, locale, isDisabled, purpose = "places" }: { value: string; onChange: (id: string) => void; locale: Locale; isDisabled?: boolean; purpose?: "places" | "finders" }) {
  const id = useId();
  const [options, setOptions] = useState<RegionOption[] | null>(null);
  useEffect(() => {
    let active = true;
    void sharedPackSource().then((source) => source?.manifest() ?? null).then(
      (raw) => {
        if (raw === null) { if (active) setOptions([]); return; }
        const pack = raw as { regions?: Array<{ id: string; label: { en: string; fr: string }; cells: string[] }>; search?: Record<string, { bytes: number }> };
        // Finders reads whole record files, so the all-Ontario area (every cell) is not offered there.
        const regions = (pack.regions ?? []).filter((region) => purpose === "places" || region.cells.length <= 12).map((region) => ({
          id: region.id,
          label: region.label[locale] || region.label.en || region.id,
          bytes: region.cells.reduce((sum, cell) => sum + (pack.search?.[cell]?.bytes ?? 0), 0),
        }));
        if (active) setOptions(regions);
      },
      () => { if (active) setOptions([]); },
    );
    return () => { active = false; };
  }, [locale, purpose]);
  if (!options || options.length === 0) return null;
  return (
    <div className="field">
      <label htmlFor={id}>{say(locale, "region")}</label>
      <span id={`${id}-help`} className="field-help">{say(locale, purpose === "finders" ? "finderRegionHelp" : "regionHelp")}</span>
      <select
        id={id}
        aria-describedby={`${id}-help`}
        value={value}
        disabled={isDisabled}
        style={{ minHeight: 44 }}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{purpose === "places" ? say(locale, "regionSize", { label: option.label, size: sizeWords(locale, option.bytes) }) : option.label}</option>
        ))}
      </select>
    </div>
  );
}

type Hit = {
  id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  provenance?: { source_name?: string; licence?: string; source_date?: string; tier?: number | string };
};

function words(value: string | null | undefined): string | null {
  if (!value || value.toUpperCase() === "UNKNOWN") return null;
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * "Restaurant · in Toronto · OpenStreetMap": what a hit is, where, and whose record it is,
 * so places with the same name can be told apart. Empty when none is known.
 */
export function hitDetail(
  hit: { category?: string | null; city?: string | null; tranche?: string | null; provenance?: { source_name?: string } },
  locale: Locale,
): string {
  const fallback = hit.tranche === "transit" ? say(locale, "kindTransit") : hit.tranche === "washroom" ? say(locale, "kindWashroom") : hit.tranche === "venue" ? say(locale, "kindVenue") : null;
  const kind = words(hit.category) ?? fallback;
  const city = words(hit.city);
  const source = hit.provenance?.source_name?.trim() || null;
  return [kind, city ? say(locale, "resultIn", { city }) : null, source].filter(Boolean).join(" · ");
}

/** Search results: each place's name as a link, what it is, where, and where its name came from. */
export function PlaceResults({ items, locale }: { items: readonly unknown[]; locale: Locale }) {
  const hits = items.filter((item): item is Hit => typeof item === "object" && item !== null && typeof (item as Hit).id === "string" && typeof (item as Hit).name === "string");
  if (hits.length === 0) return null;
  return (
    <section aria-labelledby="place-results" className="stack">
      <h2 id="place-results">{say(locale, "resultsHeading")}</h2>
      <ul className="stack result-items">
        {hits.map((hit) => {
          const kind = words(hit.category);
          const city = words(hit.city);
          const p = hit.provenance;
          return (
            <li key={hit.id} className="place-hit">
              <Link to={`/places/${encodeURIComponent(hit.id)}`} style={TARGET}><span lang={locale === "fr" ? "en" : undefined}>{hit.name}</span></Link>
              {kind || city ? (
                <p className="place-hit-kind">
                  {kind ? <span lang={locale === "fr" ? "en" : undefined}>{kind}</span> : null}
                  {kind && city ? " · " : null}
                  {city ? say(locale, "resultIn", { city }) : null}
                </p>
              ) : null}
              {p?.source_name ? (
                <p className="result-note">{say(locale, "resultSource", { source: p.source_name, licence: p.licence ?? "", date: (p.source_date ?? "").slice(0, 10), tier: String(p.tier ?? "") })}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
