import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import type { SavedFile } from "./downloadFile.ts";
import type { PackDiff } from "./packDiff.ts";
import {
  type MoveKey,
  MOVE_KEYS,
  addedRemovedLine,
  buildTagMoves,
  moveKeyLabel,
  moveLabel,
  noTagMoves,
  placesIn,
  tagMovesLine,
  tagMovesNote,
} from "./packTagMoves.ts";
import { MOVE_CSV_FILENAMES, MOVE_TEXT_FILENAMES, tagMovesToCsv, tagMovesToText } from "./packTagMovesExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  diff: PackDiff;
  locale: Locale;
  today: string;
  /** Receives the file to save; returns false when the browser cannot make one. */
  onSave: (file: SavedFile) => boolean;
}

/** How many names are listed under a chosen cell before the rest are left to the saved file. */
export const MAX_LISTED_MOVED = 50;

/**
 * A table of how wheelchair tags moved between the earlier file and the pack now: rows are the tag
 * in the earlier file, columns the tag now. A cell can be pressed to list its places. It counts
 * differences between two lists and says nothing about whether a place got better or worse.
 */
export function PackTagMoves({ diff, locale, today, onSave }: Props) {
  const headingId = useId();
  const moves = useMemo(() => buildTagMoves(diff), [diff]);
  const [chosen, setChosen] = useState<{ from: MoveKey; to: MoveKey } | null>(null);
  const [saved, setSaved] = useState<{ name: string; ok: boolean } | null>(null);
  if (noTagMoves(moves)) return null;

  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setSaved({ name: file.name, ok });
  };
  const listed = chosen === null ? [] : placesIn(moves, chosen.from, chosen.to);
  const extra = addedRemovedLine(moves, locale);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-tag-moves>
      {/* Not a heading: it sits inside the comparison section, whose own heading is the one for the page. */}
      <p id={headingId}>
        <strong>{t(locale, "How wheelchair tags changed", "Comment les indications pour fauteuil roulant ont changé")}</strong>
      </p>
      <p>{tagMovesLine(moves, locale)}</p>
      {extra ? <p>{extra}</p> : null}
      <p>{tagMovesNote(locale)}</p>
      <table>
        <caption>{t(locale, "Places by wheelchair tag in the earlier file (rows) and now (columns)", "Lieux par indication pour fauteuil roulant dans le fichier précédent (lignes) et maintenant (colonnes)")}</caption>
        <thead>
          <tr>
            <th scope="col">{t(locale, "Earlier file", "Fichier précédent")}</th>
            {MOVE_KEYS.map((to) => (
              <th key={to} scope="col">
                {moveKeyLabel(to, locale, "to")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOVE_KEYS.map((from) => (
            <tr key={from}>
              <th scope="row">{moveKeyLabel(from, locale, "from")}</th>
              {MOVE_KEYS.map((to) => {
                const n = moves.cells[from][to];
                const isChosen = chosen !== null && chosen.from === from && chosen.to === to;
                if (from === to) return <td key={to}>–</td>;
                return (
                  <td key={to} data-move={`${from}>${to}`}>
                    {n === 0 ? (
                      "0"
                    ) : (
                      <Button variant="quiet" aria-pressed={isChosen} aria-label={t(locale, `${moveLabel(from, to, "en")}: ${n}. List these places.`, `${moveLabel(from, to, "fr")}\u00a0: ${n}. Lister ces lieux.`)} onPress={() => setChosen(isChosen ? null : { from, to })}>
                        {n}
                      </Button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t(locale, "A dash is a tag that did not change; those places are not counted here.", "Un tiret indique une indication inchangée\u00a0: ces lieux ne sont pas comptés ici.")}</p>
      {chosen !== null ? (
        <div>
          <p>
            <strong>{moveLabel(chosen.from, chosen.to, locale)}</strong>
          </p>
          <ul>
            {listed.slice(0, MAX_LISTED_MOVED).map((p) => (
              <li key={p.id}>{p.name ?? "UNKNOWN"}</li>
            ))}
          </ul>
          {listed.length > MAX_LISTED_MOVED ? <p>{t(locale, "Only the first places are listed. Save the file to see them all.", "Seuls les premiers lieux sont listés. Enregistrez le fichier pour les voir tous.")}</p> : null}
        </div>
      ) : null}
      <div className="stack" role="group" aria-label={t(locale, "Save the tag changes", "Enregistrer les changements d’indication")}>
        <Button variant="secondary" onPress={() => save({ name: MOVE_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: tagMovesToCsv(moves, { bom: true }) })}>
          {t(locale, "Save the tag changes (CSV)", "Enregistrer les changements d’indication (CSV)")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: MOVE_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: tagMovesToText(moves, locale, today) })}>
          {t(locale, "Save the tag changes (text)", "Enregistrer les changements d’indication (texte)")}
        </Button>
      </div>
      <p aria-live="polite" data-moves-saved>
        {saved === null
          ? ""
          : saved.ok
            ? t(locale, `Saved ${saved.name}.`, `Fichier ${saved.name} enregistré.`)
            : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.")}
      </p>
    </section>
  );
}
