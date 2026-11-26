import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { MAX_ORDER_ROWS, buildOrderTable, orderTableNote } from "./packSortKeys.ts";
import { PACK_SORT_CSV_FILENAMES, PACK_SORT_FILENAMES, orderedToCsv, orderedToText, packSortHelp, packSortLabel, packSortNotRanking, packSortStatus, sortRunLine } from "./packSortCopy.ts";
import { PACK_SORTS, type PackSort, THEN_SORTS, cleanThen, isPackSort, sortRuns } from "./packSort.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places in the list, in the order they are shown. */
  places: readonly PackPlaceRecord[];
  sort: PackSort;
  onSort: (sort: PackSort) => void;
  /** A second order, or null for none. Optional: leave out to offer no second order. */
  then?: PackSort | null;
  onThen?: (then: PackSort | null) => void;
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/** The order of the list, chosen on request: eight rules, what each does with a missing value, the runs it makes, and the list as a file. */
export function PackSort({ places, sort, onSort, then = null, onThen, locale, onSave = saveTextFile }: Props) {
  const second = cleanThen(sort, then);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const runs = useMemo(() => (open ? sortRuns(places, sort, locale) : []), [open, places, sort, locale]);
  const table = useMemo(() => (open ? buildOrderTable(places, sort, locale, MAX_ORDER_ROWS, second) : null), [open, places, sort, second, locale]);
  if (places.length < 2) return null;

  const choose = (value: string) => {
    const next: PackSort = isPackSort(value) ? value : "default";
    onSort(next);
    setStatus(packSortStatus(next, places.length, locale, cleanThen(next, then)));
  };
  const chooseThen = (value: string) => {
    const next = cleanThen(sort, value);
    onThen?.(next);
    setStatus(packSortStatus(sort, places.length, locale, next));
  };
  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };

  return (
    <div data-pack-sort>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide the order of the list", "Masquer l’ordre de la liste") : t(locale, "Change the order of the list", "Changer l’ordre de la liste")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <ChoiceGroup label={t(locale, "Order the places by", "Ordonner les lieux par")} value={sort} onChange={choose} options={PACK_SORTS.map((s) => ({ value: s, label: packSortLabel(s, locale) }))} />
            {onThen ? (
              <ChoiceGroup
                label={t(locale, "Then by", "Puis par")}
                value={second ?? "none"}
                onChange={chooseThen}
                options={[{ value: "none", label: t(locale, "No second order", "Aucun second ordre") }, ...THEN_SORTS.filter((s) => s !== sort).map((s) => ({ value: s, label: packSortLabel(s, locale) }))]}
              />
            ) : null}
            <p>{packSortHelp(sort, locale)}</p>
            <p>{packSortNotRanking(locale)}</p>
            {runs.length > 0 ? (
              <>
                <h3>{t(locale, "How the list falls into groups", "Comment la liste se répartit en groupes")}</h3>
                <ol>
                  {runs.map((r) => (
                    <li key={`${r.label}-${r.ids[0]}`}>{sortRunLine(r, locale)}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {table ? (
              <>
                <table>
                  <caption>{t(locale, "The places in the order shown", "Les lieux dans l’ordre affiché")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(locale, "Position", "Position")}</th>
                      <th scope="col">{t(locale, "Place", "Lieu")}</th>
                      <th scope="col">{table.keyHeading}</th>
                      {table.thenHeading !== null ? <th scope="col">{table.thenHeading}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.position}</td>
                        <th scope="row">{row.name}</th>
                        <td>{row.key}</td>
                        {row.thenKey !== null ? <td>{row.thenKey}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.truncated ? <p>{orderTableNote(table, locale)}</p> : null}
              </>
            ) : null}
            <Button variant="secondary" onPress={() => save({ name: PACK_SORT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: orderedToText(places, sort, locale, second) })}>
              {t(locale, "Save the list in this order (.txt)", "Enregistrer la liste dans cet ordre (.txt)")}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: PACK_SORT_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: orderedToCsv(places, locale) })}>
              {t(locale, "Save the list in this order as a spreadsheet (CSV)", "Enregistrer la liste dans cet ordre comme tableur (CSV)")}
            </Button>
            <p role="status">{status}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
