import { useState } from "react";
import { en } from "./catalogs/en.ts";
import { fr } from "./catalogs/fr.ts";
import { projectRegister } from "./project.ts";
import type { Count, SourceEntry, TierCount } from "./types.ts";
import "./dashboard.css";

export interface DashboardProps {
  register: readonly SourceEntry[];
  initialLanguage?: "en" | "fr";
}

export function Dashboard({ register, initialLanguage = "en" }: DashboardProps) {
  const [language, setLanguage] = useState<"en" | "fr">(initialLanguage);
  const copy: Record<keyof typeof en, string> = language === "fr" ? fr : en;
  const { rows, totals } = projectRegister(register);
  const fmt = (value: Count | undefined) =>
    value === undefined || value === "Unknown" ? copy.unknown : new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA").format(value);
  const kinds: Record<SourceEntry["kind"], string> = {
    places: copy.kindPlaces,
    "directory links": copy.kindDirectory,
    help: copy.kindHelp,
    tiles: copy.kindTiles,
    other: copy.kindOther,
  };
  const tiers = (items: readonly TierCount[]) => items.length === 0 ? copy.emptyTier : items.map((item) =>
    `${item.tier} (${item.prototype_label})${copy.tierCountSeparator}${fmt(item.count)}`,
  ).join(copy.listSeparator);

  return (
    <main className="source-dashboard" lang={language}>
      <header>
        <div className="language-picker">
          <label htmlFor="source-language">{copy.language}</label>
          <select id="source-language" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "fr")}>
            <option value="en">{copy.english}</option>
            <option value="fr">{copy.french}</option>
          </select>
        </div>
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
        <p>{copy.disclaimer}</p>
      </header>
      <section aria-labelledby="source-summary">
        <h2 id="source-summary">{copy.summary}</h2>
        <dl className="summary-grid">
          <div><dt>{copy.sources}</dt><dd>{fmt(totals.source_count)}</dd></div>
          <div><dt>{copy.demoSources}</dt><dd>{fmt(totals.demonstration_source_count)}</dd></div>
          <div><dt>{copy.demoRecords}</dt><dd>{fmt(totals.demonstration_records)}</dd></div>
          <div><dt>{copy.otherRecords}</dt><dd>{fmt(totals.non_demonstration_records)}</dd></div>
          <div><dt>{copy.unknownFields}</dt><dd>{fmt(totals.known_unknown_fields)}</dd></div>
          <div><dt>{copy.unknownCounts}</dt><dd>{fmt(totals.unknown_record_count_sources)}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="source-list">
        <h2 id="source-list">{copy.sourceList}</h2>
        {rows.length === 0 ? <p>{copy.noSources}</p> : (
          <ul className="source-list">
            {rows.map((row) => (
              <li key={row.id}>
                <article aria-labelledby={`entry-${row.id}`}>
                  <h3 id={`entry-${row.id}`}>{row.display_name}</h3>
                  {row.excluded_from_headline ? <p className="demo-label">{copy.demo}</p> : null}
                  <dl className="details">
                    <div><dt>{copy.url}</dt><dd>{row.official_url === "Unknown" ? copy.unknown : <a href={row.official_url} rel="noopener noreferrer">{row.official_url}</a>}</dd></div>
                    <div><dt>{copy.licence}</dt><dd>{row.licence}</dd></div>
                    <div><dt>{copy.retrieved}</dt><dd>{row.retrieved_on === "Unknown" ? copy.unknown : row.retrieved_on}</dd></div>
                    <div><dt>{copy.asOf}</dt><dd>{row.as_of === "Unknown" ? copy.unknown : row.as_of}</dd></div>
                    <div><dt>{copy.records}</dt><dd>{fmt(row.record_count)}</dd></div>
                    <div><dt>{copy.fields}</dt><dd>{fmt(row.unknown_field_count)}</dd></div>
                    <div><dt>{copy.geography}</dt><dd>{row.geography}</dd></div>
                    <div><dt>{copy.kind}</dt><dd>{kinds[row.kind]}</dd></div>
                    <div><dt>{copy.tier}</dt><dd>{tiers(row.tier_histogram)}</dd></div>
                    <div><dt>{copy.provenance}</dt><dd>{row.provenance.source} · {row.provenance.licence} · {row.provenance.source_date === "Unknown" ? copy.unknown : row.provenance.source_date} · {row.provenance.tier} ({row.provenance.prototype_label})</dd></div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="source-legend">
        <h2 id="source-legend">{copy.legend}</h2>
        <ul><li>{copy.tier0}</li><li>{copy.tier1}</li><li>{copy.tierE}</li><li>{copy.seeded}</li><li>{copy.prototype}</li></ul>
        <p>{copy.higherTiers}</p>
      </section>
      <footer><p>{copy.footer}</p></footer>
    </main>
  );
}
