import { useId, useMemo, useRef, useState } from "react";
import { Button } from "../design/Button.tsx";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Point } from "./packGeo.ts";
import { type ShortlistEntry, MAX_SHORTLIST, resolveShortlist } from "./shortlist.ts";
import { ChoiceGroup } from "../design/fields.tsx";
import { DistanceMatrix } from "./DistanceMatrix.tsx";
import { GapMatrix } from "./GapMatrix.tsx";
import { ShortlistFiles } from "./ShortlistFiles.tsx";
import { SHORTLIST_ORDERS, type ShortlistOrder, buildShortlistTable, differencesLine, differingColumns, missingNotice, shortlistToCsv, shortlistToText } from "./shortlistTable.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import { VisitPlan } from "./VisitPlan.tsx";

interface Props {
  list: readonly ShortlistEntry[];
  places: readonly PackPlaceRecord[];
  locale: Locale;
  today: string;
  /** False when the list cannot be kept on this device. */
  kept: boolean;
  /** A starting point, when the person gave one, so the table can show distances. */
  from?: Point | null;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Writes text to the clipboard. Defaults to the browser's. Rejects or returns false when it cannot. */
  copy?: (text: string) => Promise<boolean>;
}

const browserCopy = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * The places the person picked, side by side, with a way to copy them as text. The list lives on
 * this device; the facts come from the pack as it is now. Nothing is ranked or scored.
 */
export function Shortlist({ list, places, locale, today, kept, from = null, onRemove, onClear, copy = browserCopy }: Props) {
  const headingId = useId();
  const textId = useId();
  const resolved = useMemo(() => resolveShortlist(list, places), [list, places]);
  const [order, setOrder] = useState<ShortlistOrder>("added");
  const table = useMemo(() => buildShortlistTable(resolved, locale, today, from, order), [resolved, locale, today, from, order]);
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState<null | "text" | "csv">(null);
  const text = useMemo(() => shortlistToText(resolved, locale, today), [resolved, locale, today]);
  const csv = useMemo(() => shortlistToCsv(resolved), [resolved]);
  const differs = useMemo(() => differingColumns(table), [table]);
  const region = useRef<HTMLElement>(null);

  if (list.length === 0) return status === "" ? null : <p aria-live="polite">{status}</p>;

  const doCopy = async (kind: "text" | "csv") => {
    const ok = await copy(kind === "csv" ? csv : text);
    if (ok) {
      setStatus(kind === "csv" ? t(locale, "Copied as CSV.", "Copié en CSV.") : t(locale, "Copied to the clipboard.", "Copié dans le presse-papiers."));
      return;
    }
    setStatus(t(locale, "This browser could not copy. The text is shown below so you can select it.", "Ce navigateur n’a pas pu copier. Le texte est affiché ci-dessous pour que vous puissiez le sélectionner."));
    setShown(kind);
  };
  const remove = (id: string) => {
    onRemove(id);
    setStatus(t(locale, "Removed from the list.", "Retiré de la liste."));
    // The row that held focus is gone: send focus to the section so a keyboard user is not dropped at the top of the page.
    region.current?.focus();
  };
  const missing = missingNotice(resolved.missing.length, locale);

  return (
    <section ref={region} tabIndex={-1} aria-labelledby={headingId} lang={locale} data-shortlist={list.length}>
      <h2 id={headingId}>{t(locale, `Your list (${list.length} of ${MAX_SHORTLIST})`, `Votre liste (${list.length} sur ${MAX_SHORTLIST})`)}</h2>
      {!kept ? <p>{t(locale, "This list could not be saved on this device. It will be gone when you close the page.", "Cette liste n’a pas pu être enregistrée sur cet appareil. Elle disparaîtra à la fermeture de la page.")}</p> : null}
      {missing ? <p>{missing}</p> : null}
      {table.rows.length > 1 ? (
        <ChoiceGroup
          label={t(locale, "Order of the places", "Ordre des lieux")}
          value={order}
          onChange={(value) => {
            if ((SHORTLIST_ORDERS as readonly string[]).includes(value)) setOrder(value as ShortlistOrder);
          }}
          options={[
            { value: "added", label: t(locale, "As added", "Selon l’ajout") },
            { value: "name", label: t(locale, "By name", "Par nom") },
          ]}
        />
      ) : null}
      {table.rows.length > 1 ? <p>{differencesLine(table, locale)}</p> : null}
      {table.rows.length > 0 ? (
        // A scrolling region has to be reachable by keyboard, or its far columns cannot be read without a mouse.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div style={{ overflowX: "auto" }} role="region" aria-label={t(locale, "Comparison table", "Tableau de comparaison")} tabIndex={0}>
          <table>
            <caption>{table.caption}</caption>
            <thead>
              <tr>
                {table.headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
                <th scope="col">{t(locale, "Remove", "Retirer")}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.cells[0]}</th>
                  {row.cells.slice(1).map((cell, i) => (
                    <td key={i} data-differs={differs.includes(i + 1) ? "true" : undefined}>
                      {cell}
                    </td>
                  ))}
                  <td>
                    <Button variant="quiet" onPress={() => remove(row.id)} aria-label={t(locale, `Remove ${row.name} from the list`, `Retirer ${row.name} de la liste`)}>
                      {t(locale, "Remove", "Retirer")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="stack" role="group" aria-label={t(locale, "List actions", "Actions sur la liste")}>
        <Button variant="secondary" onPress={() => doCopy("text")}>
          {t(locale, "Copy the list as text", "Copier la liste en texte")}
        </Button>
        {table.rows.length > 0 ? (
          <Button variant="secondary" onPress={() => doCopy("csv")}>
            {t(locale, "Copy the list as CSV", "Copier la liste en CSV")}
          </Button>
        ) : null}
        <Button variant="quiet" onPress={() => setShown((v) => (v === null ? "text" : null))} aria-expanded={shown !== null} aria-controls={textId}>
          {shown !== null ? t(locale, "Hide the text", "Masquer le texte") : t(locale, "Show the text", "Afficher le texte")}
        </Button>
        <Button variant="quiet" onPress={() => { onClear(); setStatus(t(locale, "The list is empty.", "La liste est vide.")); }}>
          {t(locale, "Empty the list", "Vider la liste")}
        </Button>
      </div>
      {resolved.found.length > 0 ? <VisitPlan found={resolved.found.map((f) => f.place)} missing={resolved.missing.length} locale={locale} today={today} /> : null}
      <DistanceMatrix places={resolved.found.map((f) => f.place)} locale={locale} />
      <GapMatrix places={resolved.found.map((f) => f.place)} locale={locale} today={today} />
      <ShortlistFiles places={resolved.found.map((f) => f.place)} locale={locale} />
      {shown !== null ? <textarea id={textId} readOnly rows={12} value={shown === "csv" ? csv : text} aria-label={shown === "csv" ? t(locale, "The list as CSV", "La liste en CSV") : t(locale, "The list as text", "La liste en texte")} style={{ width: "100%" }} /> : null}
      <p aria-live="polite">{status}</p>
    </section>
  );
}
