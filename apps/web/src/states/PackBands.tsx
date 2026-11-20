import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { type BandKey, BAND_TAG_ORDER, NO_POINT_BAND, bandLabel, bandShowLabel, bandsLine, buildBands, formatBandShare, reportedBandShare, straightLineNote } from "./packBands.ts";
import { BAND_CSV_FILENAMES, BAND_TEXT_FILENAMES, bandsToCsv, bandsToText } from "./packBandsExport.ts";
import type { Point } from "./packGeo.ts";
import { PackNearest } from "./PackNearest.tsx";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places the table counts: those that pass the other filters on the page. */
  places: readonly PackPlaceRecord[];
  /** The places in the list, every filter applied, for the closest-place table. Defaults to `places`. */
  shown?: readonly PackPlaceRecord[];
  /** The point the person typed. Without one there is nothing to measure from and nothing is shown. */
  from: Point | null;
  locale: Locale;
  /** ISO date (YYYY-MM-DD). */
  today: string;
  /** The band being shown, or null for every distance. */
  selected: BandKey | null;
  onSelect: (key: BandKey | null) => void;
  /** Receives the file to save; returns false when the browser cannot make one. */
  onSave?: (file: SavedFile) => boolean;
}

function tagHeading(tag: (typeof BAND_TAG_ORDER)[number], locale: Locale): string {
  switch (tag) {
    case "yes":
      return t(locale, "Yes", "Oui");
    case "limited":
      return t(locale, "Limited", "Limité");
    case "no":
      return t(locale, "No", "Non");
    case "designated":
      return t(locale, "Designated", "Réservé");
    case "unknown":
      return "UNKNOWN";
  }
}

/**
 * How many places lie in each straight-line distance band from the point the person typed, with
 * the wheelchair tags the pack reports for them. Each row can be pressed to show only that band in
 * the list. Counting only: no band is ranked, and a distance is not a route.
 */
export function PackBands({ places, shown, from, locale, today, selected, onSelect, onSave = (file) => saveTextFile(file) }: Props) {
  const headingId = useId();
  const [saved, setSaved] = useState<{ name: string; ok: boolean } | null>(null);
  const rows = useMemo(() => (from === null ? [] : buildBands(places, from)), [places, from]);
  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setSaved({ name: file.name, ok });
  };

  if (from === null || places.length === 0) return null;
  const selectedEmpty = selected !== null && !rows.some((r) => r.key === selected && r.total > 0);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-bands>
      {/* Not a heading: the place cards below use h3 for their names, and a table title must not sit among them. */}
      <p id={headingId}>
        <strong>{t(locale, "Places by distance", "Lieux par distance")}</strong>
      </p>
      <p>{bandsLine(rows, locale)}</p>
      <p>{straightLineNote(locale)}</p>
      <table>
        <caption>{t(locale, "Places by straight-line distance and wheelchair tag", "Lieux par distance en ligne droite et par indication pour fauteuil roulant")}</caption>
        <thead>
          <tr>
            <th scope="col">{t(locale, "Distance", "Distance")}</th>
            <th scope="col">{t(locale, "Places", "Lieux")}</th>
            {BAND_TAG_ORDER.map((tag) => (
              <th key={tag} scope="col">
                {tagHeading(tag, locale)}
              </th>
            ))}
            <th scope="col">{t(locale, "Tag reported with a source", "Indication fournie avec une source")}</th>
            <th scope="col">{t(locale, "Show", "Afficher")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-band={row.key} aria-current={selected === row.key ? "true" : undefined}>
              <th scope="row">{bandLabel(row.key, locale)}</th>
              <td>{row.total}</td>
              {BAND_TAG_ORDER.map((tag) => (
                <td key={tag}>{row.byTag[tag]}</td>
              ))}
              <td>{formatBandShare(reportedBandShare(row), locale)}</td>
              <td>
                {row.total === 0 && selected !== row.key ? (
                  <span aria-hidden="true">–</span>
                ) : (
                  <Button variant="quiet" aria-pressed={selected === row.key} aria-label={bandShowLabel(row, locale)} onPress={() => onSelect(selected === row.key ? null : row.key)}>
                    {selected === row.key ? t(locale, "Shown", "Affiché") : t(locale, "Show", "Afficher")}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected !== null ? (
        <p>
          {selectedEmpty
            ? t(locale, "No place in the chosen distance passes the other filters.", "Aucun lieu à la distance choisie ne passe les autres filtres.")
            : selected === NO_POINT_BAND
              ? t(locale, "Showing places with no map point.", "Affichage des lieux sans point sur la carte.")
              : t(locale, "Showing one distance band.", "Une seule tranche de distance est affichée.")}{" "}
          <Button variant="secondary" onPress={() => onSelect(null)}>
            {t(locale, "Show every distance", "Afficher toutes les distances")}
          </Button>
        </p>
      ) : null}
      <div className="stack" role="group" aria-label={t(locale, "Save the distance table", "Enregistrer le tableau des distances")}>
        <Button variant="secondary" onPress={() => save({ name: BAND_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: bandsToCsv(rows, { bom: true }) })}>
          {t(locale, "Save the distance table (CSV)", "Enregistrer le tableau des distances (CSV)")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: BAND_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: bandsToText(rows, locale, today) })}>
          {t(locale, "Save the distance table (text)", "Enregistrer le tableau des distances (texte)")}
        </Button>
      </div>
      <PackNearest places={shown ?? places} from={from} locale={locale} />
      <p aria-live="polite" data-bands-saved>
        {saved === null
          ? ""
          : saved.ok
            ? t(locale, `Saved ${saved.name}.`, `Fichier ${saved.name} enregistré.`)
            : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.")}
      </p>
    </section>
  );
}
