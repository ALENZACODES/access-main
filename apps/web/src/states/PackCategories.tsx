import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { KIND_CSV_FILENAMES, KIND_TEXT_FILENAMES, kindsToCsv, kindsToText } from "./packCategoryExport.ts";
import {
  type KindOrder,
  type KindRow,
  KIND_TAG_ORDER,
  UNKNOWN_KIND,
  buildKindRows,
  formatKindShare,
  hiddenKindsLine,
  isKindOrder,
  kindLabel,
  kindsLine,
  limitKinds,
  reportedShare,
  sortKindRows,
  summariseKinds,
} from "./packCategories.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places the table counts: those that pass the other filters on the page. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** ISO date (YYYY-MM-DD). */
  today: string;
  /** The kind key being shown, or null for every kind. */
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Receives the file to save; returns false when the browser cannot make one. */
  onSave?: (file: SavedFile) => boolean;
}

function tagHeading(tag: (typeof KIND_TAG_ORDER)[number], locale: Locale): string {
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

function showLabel(row: KindRow, locale: Locale): string {
  const name = row.key === UNKNOWN_KIND ? t(locale, "places with no kind (UNKNOWN)", "lieux sans type (UNKNOWN)") : kindLabel(row);
  return t(locale, `Show ${name} (${row.total})`, `Afficher ${name} (${row.total})`);
}

/**
 * A table of the kinds of place the pack tags, with how many of each and how many carry a reported
 * wheelchair tag. Each row can be pressed to show only that kind in the list. Counting only: it
 * ranks nothing and says nothing about whether a kind is accessible.
 */
export function PackCategories({ places, locale, today, selected, onSelect, onSave = (file) => saveTextFile(file) }: Props) {
  const headingId = useId();
  const [saved, setSaved] = useState<{ name: string; ok: boolean } | null>(null);
  const rows = useMemo(() => buildKindRows(places, today), [places, today]);
  const summary = useMemo(() => summariseKinds(rows), [rows]);
  const [order, setOrder] = useState<KindOrder>("count");
  const [minPlaces, setMinPlaces] = useState(1);
  const limited = useMemo(() => limitKinds(sortKindRows(rows, order), minPlaces, selected), [rows, order, minPlaces, selected]);
  const hiddenLine = hiddenKindsLine(limited, minPlaces, locale);
  const save = (file: SavedFile) => setSaved({ name: file.name, ok: onSave(file) });

  if (rows.length === 0) return null;
  const selectedMissing = selected !== null && !rows.some((r) => r.key === selected);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-kinds>
      {/* Not a heading: the place cards below it use h3 for their names, and a table title must not sit among them. */}
      <p id={headingId}>
        <strong>{t(locale, "Kinds of place", "Types de lieux")}</strong>
      </p>
      <p>{kindsLine(summary, locale)}</p>
      <p>{t(locale, "Kinds are shown as the pack tags them. A count is not a rating.", "Les types sont indiqués comme le pack les étiquette. Un nombre n’est pas une évaluation.")}</p>
      <ChoiceGroup
        label={t(locale, "Order the table by", "Trier le tableau par")}
        value={order}
        onChange={(value) => {
          if (isKindOrder(value)) setOrder(value);
        }}
        options={[
          { value: "count", label: t(locale, "Number of places", "Nombre de lieux") },
          { value: "name", label: t(locale, "Name", "Nom") },
          { value: "reported", label: t(locale, "Share with a reported tag", "Part avec une indication fournie") },
        ]}
      />
      <ChoiceGroup
        label={t(locale, "Kinds to list", "Types à lister")}
        value={String(minPlaces)}
        onChange={(value) => setMinPlaces(Number(value))}
        options={[
          { value: "1", label: t(locale, "Every kind", "Tous les types") },
          { value: "2", label: t(locale, "At least 2 places", "Au moins 2 lieux") },
          { value: "5", label: t(locale, "At least 5 places", "Au moins 5 lieux") },
        ]}
      />
      {hiddenLine ? <p>{hiddenLine}</p> : null}
      <table>
        <caption>{t(locale, "Places by kind and wheelchair tag", "Lieux par type et par indication pour fauteuil roulant")}</caption>
        <thead>
          <tr>
            <th scope="col">{t(locale, "Kind", "Type")}</th>
            <th scope="col">{t(locale, "Places", "Lieux")}</th>
            {KIND_TAG_ORDER.map((tag) => (
              <th key={tag} scope="col">
                {tagHeading(tag, locale)}
              </th>
            ))}
            <th scope="col">{t(locale, "Tag reported with a source", "Indication fournie avec une source")}</th>
            <th scope="col">{t(locale, "Show", "Afficher")}</th>
          </tr>
        </thead>
        <tbody>
          {limited.shown.map((row) => (
            <tr key={row.key} data-kind={row.key} aria-current={selected === row.key ? "true" : undefined}>
              <th scope="row">{row.key === UNKNOWN_KIND ? t(locale, "No kind stated (UNKNOWN)", "Aucun type indiqué (UNKNOWN)") : kindLabel(row)}</th>
              <td>{row.total}</td>
              {KIND_TAG_ORDER.map((tag) => (
                <td key={tag}>{row.byTag[tag]}</td>
              ))}
              <td>{formatKindShare(reportedShare(row), locale)}</td>
              <td>
                <Button variant="quiet" aria-pressed={selected === row.key} aria-label={showLabel(row, locale)} onPress={() => onSelect(selected === row.key ? null : row.key)}>
                  {selected === row.key ? t(locale, "Shown", "Affiché") : t(locale, "Show", "Afficher")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected !== null ? (
        <p>
          {selectedMissing
            ? t(locale, "No place of the chosen kind passes the other filters.", "Aucun lieu du type choisi ne passe les autres filtres.")
            : t(locale, "Showing one kind.", "Un seul type est affiché.")}{" "}
          <Button variant="secondary" onPress={() => onSelect(null)}>
            {t(locale, "Show every kind", "Afficher tous les types")}
          </Button>
        </p>
      ) : null}
      <div className="stack" role="group" aria-label={t(locale, "Save this table", "Enregistrer ce tableau")}>
        <Button variant="secondary" onPress={() => save({ name: KIND_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: kindsToCsv(rows, { bom: true }) })}>
          {t(locale, "Save the table (CSV)", "Enregistrer le tableau (CSV)")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: KIND_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: kindsToText(rows, locale, today) })}>
          {t(locale, "Save the table (text)", "Enregistrer le tableau (texte)")}
        </Button>
      </div>
      {/* A polite live region, not role="status": the page already has one for the result count. */}
      <p aria-live="polite" data-kinds-saved>
        {saved === null
          ? ""
          : saved.ok
            ? t(locale, `Saved ${saved.name}.`, `Fichier ${saved.name} enregistré.`)
            : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.")}
      </p>
    </section>
  );
}
