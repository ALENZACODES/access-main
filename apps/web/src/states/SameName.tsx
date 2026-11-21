import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { findNearNames } from "./nearNames.ts";
import { NEAR_NAMES_CSV_FILENAMES, nearNamesCaveat, nearNamesSummary, nearNamesToCsv, nearPairText } from "./nearNamesCopy.ts";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { Point } from "./packGeo.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import {
  DEFAULT_SAME_NAME_FILTER,
  DEFAULT_SAME_NAME_LIMIT,
  DEFAULT_SAME_NAME_ORDER,
  DEFAULT_SAME_NAME_SIZE,
  SAME_NAME_FILTERS,
  SAME_NAME_LIMITS,
  SAME_NAME_ORDERS,
  SAME_NAME_SIZES,
  type SameNameFilter,
  type SameNameLimit,
  type SameNameOrder,
  type SameNameSize,
  buildSameName,
  isSameNameFilter,
  isSameNameLimit,
  isSameNameOrder,
  isSameNameSize,
  listSameName,
  sameNamePage,
} from "./sameName.ts";
import { SAME_NAME_CSV_FILENAMES, SAME_NAME_FILENAMES, sameNameCaveat, sameNameEmptyText, sameNameFilterLabel, sameNameHeading, sameNameMemberText, sameNameOrderHelp, sameNameOrderLabel, sameNameSizeLabel, sameNameSummary, sameNameTagsLine, sameNameToCsv, sameNameToText } from "./sameNameCopy.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

/** "1 more name is not shown", "4 more names are not shown". */
export function moreNames(n: number, locale: Locale): string {
  return n === 1
    ? t(locale, "1 more name is not shown. Save the file to see all of them.", "1 autre nom n’est pas affiché. Enregistrez le fichier pour les voir tous.")
    : t(locale, `${n} more names are not shown. Save the file to see all of them.`, `${n} autres noms ne sont pas affichés. Enregistrez le fichier pour les voir tous.`);
}

export function morePairs(n: number, locale: Locale): string {
  return n === 1
    ? t(locale, "1 more pair is not shown. Save the file to see all of them.", "1 autre paire n’est pas affichée. Enregistrez le fichier pour les voir toutes.")
    : t(locale, `${n} more pairs are not shown. Save the file to see all of them.`, `${n} autres paires ne sont pas affichées. Enregistrez le fichier pour les voir toutes.`);
}

interface Props {
  /** The places on screen. Fewer than two and nothing is drawn. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** The point typed in the near-me fields, if it is a good one. Used for distances on screen only. */
  from?: Point | null;
  /** Hands a file to the browser to save; returns false when it cannot. */
  onSave?: (file: SavedFile) => boolean;
}

const MIN_PLACES = 2;
/** Pairs of near names listed on screen; the file holds every one found. */
const NEAR_SHOWN = 10;

/**
 * Lists names that more than one place on screen carries, with each place's address and tag side by
 * side. Names are matched by their letters alone. Nothing is ranked, kept or sent; a distance from
 * the point typed is shown on screen and is left out of the files.
 */
export function SameName({ places, locale, from = null, onSave = saveTextFile }: Props) {
  const bodyId = useId();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<SameNameOrder>(DEFAULT_SAME_NAME_ORDER);
  const [size, setSize] = useState<SameNameSize>(DEFAULT_SAME_NAME_SIZE);
  const [filter, setFilter] = useState<SameNameFilter>(DEFAULT_SAME_NAME_FILTER);
  const [limit, setLimit] = useState<SameNameLimit>(DEFAULT_SAME_NAME_LIMIT);
  const [status, setStatus] = useState("");

  const result = useMemo(() => (open ? buildSameName(places, from, locale) : null), [open, places, from, locale]);
  const near = useMemo(() => (open ? findNearNames(places, locale) : null), [open, places, locale]);
  const listed = useMemo(() => (result ? listSameName(result, order, size, filter, locale) : []), [result, order, size, filter, locale]);

  if (places.length < MIN_PLACES) return null;

  const page = sameNamePage(listed, limit);
  const say = (groups: number) => setStatus(t(locale, `Showing ${Math.min(limit, groups)} of ${groups} shared names.`, `${Math.min(limit, groups)} noms affichés sur ${groups}.`));
  const chooseOrder = (v: string) => {
    if (isSameNameOrder(v)) setOrder(v);
  };
  const chooseSize = (v: string) => {
    const n = Number(v);
    if (isSameNameSize(n) && result) {
      setSize(n);
      say(listSameName(result, order, n, filter, locale).length);
    }
  };
  const chooseFilter = (v: string) => {
    if (isSameNameFilter(v) && result) {
      setFilter(v);
      say(listSameName(result, order, size, v, locale).length);
    }
  };
  const chooseLimit = (v: string) => {
    const n = Number(v);
    if (isSameNameLimit(n)) setLimit(n);
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
    <section aria-label={t(locale, "Places that share a name", "Lieux qui portent le même nom")} lang={locale} data-same-name={open ? "open" : "closed"}>
      <Button variant="quiet" aria-expanded={open} aria-controls={bodyId} onPress={() => setOpen(!open)}>
        {open ? t(locale, "Hide places that share a name", "Masquer les lieux qui portent le même nom") : t(locale, "Show places that share a name", "Afficher les lieux qui portent le même nom")}
      </Button>
      <div id={bodyId} hidden={!open} role={open ? "group" : undefined} aria-labelledby={open ? headingId : undefined}>
        {open && result ? (
          <>
            <h3 id={headingId}>{t(locale, "Places that share a name", "Lieux qui portent le même nom")}</h3>
            <p>{sameNameCaveat(locale)}</p>
            <p data-same-name-summary>{sameNameSummary(result, result.groups.length, locale)}</p>
            <ChoiceGroup label={t(locale, "Order of the names", "Ordre des noms")} description={sameNameOrderHelp(order, from !== null, locale)} value={order} onChange={chooseOrder} options={SAME_NAME_ORDERS.map((o) => ({ value: o, label: sameNameOrderLabel(o, locale) }))} />
            <ChoiceGroup label={t(locale, "Smallest group", "Plus petit groupe")} value={String(size)} onChange={chooseSize} options={SAME_NAME_SIZES.map((n) => ({ value: String(n), label: sameNameSizeLabel(n, locale) }))} />
            <ChoiceGroup label={t(locale, "Which names", "Quels noms")} value={filter} onChange={chooseFilter} options={SAME_NAME_FILTERS.map((f) => ({ value: f, label: sameNameFilterLabel(f, locale) }))} />
            <ChoiceGroup label={t(locale, "How many names to show", "Nombre de noms affichés")} value={String(limit)} onChange={chooseLimit} options={SAME_NAME_LIMITS.map((n) => ({ value: String(n), label: String(n) }))} />
            {page.groups.length === 0 ? (
              <p data-same-name-empty>{sameNameEmptyText(result, locale)}</p>
            ) : (
              <ul className="record-list" data-same-name-list>
                {page.groups.map((g) => (
                  <li key={g.key} data-same-name-group={g.key}>
                    <h4>{sameNameHeading(g, locale)}</h4>
                    <p>{sameNameTagsLine(g, locale)}</p>
                    <ul>
                      {g.members.map((m) => (
                        <li key={m.id}>{`${m.name}\u00a0— ${sameNameMemberText(m, locale, from !== null)}`}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {page.more > 0 ? <p data-same-name-more>{moreNames(page.more, locale)}</p> : null}
            {near ? (
              <div data-near-names>
                <h4>{t(locale, "Names that are one letter apart", "Noms qui diffèrent d’une lettre")}</h4>
                <p>{nearNamesCaveat(locale)}</p>
                <p data-near-names-summary>{nearNamesSummary(near, locale)}</p>
                {near.pairs.length > 0 ? (
                  <ul>
                    {near.pairs.slice(0, NEAR_SHOWN).map((p) => (
                      <li key={`${p.a.key}|${p.b.key}`}>{nearPairText(p, locale)}</li>
                    ))}
                  </ul>
                ) : null}
                {near.pairs.length > NEAR_SHOWN ? <p data-near-names-more>{morePairs(near.pairs.length - NEAR_SHOWN, locale)}</p> : null}
              </div>
            ) : null}
            <div className="stack" role="group" aria-label={t(locale, "Shared-name actions", "Actions sur les noms partagés")}>
              <Button variant="secondary" onPress={() => save({ name: SAME_NAME_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: sameNameToText(result, listed, locale) })}>
                {t(locale, "Save the list (text)", "Enregistrer la liste (texte)")}
              </Button>
              <Button variant="secondary" onPress={() => save({ name: SAME_NAME_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: sameNameToCsv(listed, locale) })}>
                {t(locale, "Save the list (CSV)", "Enregistrer la liste (CSV)")}
              </Button>
              {near && near.pairs.length > 0 ? (
                <Button variant="secondary" onPress={() => save({ name: NEAR_NAMES_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: nearNamesToCsv(near, locale) })}>
                  {t(locale, "Save the names one letter apart (CSV)", "Enregistrer les noms à une lettre près (CSV)")}
                </Button>
              ) : null}
            </div>
            <p role="status" data-same-name-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
