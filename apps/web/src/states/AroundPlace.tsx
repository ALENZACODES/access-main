import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { COMPASS_POINTS, type CompassPoint, compassWord } from "./aroundBearing.ts";
import {
  aroundCaveat, aroundHeading, aroundIntro, aroundSummary, aroundToggle, beyondLine, centreNotFound, centreOptionLabel, chooseFirst, memberName, nearestInSector,
  noMatchesLine, noPointCentre, radiusOptionLabel, ringLabel, sectorLabel, tagWord, aroundUnmeasuredLine, distanceAndDirection,
} from "./aroundCopy.ts";
import { AROUND_CSV_FILENAMES, AROUND_TEXT_FILENAMES, aroundListToCsv, aroundListToText } from "./aroundExport.ts";
import {
  AROUND_ORDERS, type AroundFilter, type AroundOrder, DEFAULT_AROUND_ORDER, NO_AROUND_FILTER, aroundOrderLabel, filterAround, isAroundOrder, isFiltered, orderAround, toggleTag,
} from "./aroundFilter.ts";
import { AROUND_TAG_COLUMNS, ringRows, sectorRows } from "./aroundRings.ts";
import { AROUND_RADII, DEFAULT_AROUND_RADIUS, buildAroundList, centreChoices, isAroundRadius } from "./aroundSearch.ts";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

const isDirection = (v: string): v is CompassPoint => (COMPASS_POINTS as readonly string[]).includes(v);

/**
 * The places listed within a chosen distance of one pack place, with the distance, compass direction
 * and wheelchair tag of each. Straight lines on the map only: it says nothing about the way between
 * two places. Closed until asked for. Files are made on this device from what is on screen.
 */
export function AroundPlace({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const selectId = useId();
  const directionId = useId();
  const [open, setOpen] = useState(false);
  const [centreId, setCentreId] = useState("");
  const [radius, setRadius] = useState<number>(DEFAULT_AROUND_RADIUS);
  const [filter, setFilter] = useState<AroundFilter>(NO_AROUND_FILTER);
  const [order, setOrder] = useState<AroundOrder>(DEFAULT_AROUND_ORDER);
  const [status, setStatus] = useState("");

  const choices = useMemo(() => centreChoices(places), [places]);
  const result = useMemo(() => buildAroundList(places, centreId === "" ? null : centreId, radius), [places, centreId, radius]);
  const ok = result.status === "ok" ? result : null;
  const shown = useMemo(() => (ok === null ? [] : orderAround(filterAround(ok.members, filter), order)), [ok, filter, order]);
  const rings = useMemo(() => (ok === null ? [] : ringRows(ok.members, ok.radius)), [ok]);
  const sectors = useMemo(() => (ok === null ? [] : sectorRows(ok.members).filter((s) => s.count > 0)), [ok]);

  if (places.length < 2 || choices.length === 0) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };
  const unmapped = places.length - choices.length;

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-around-place>
      <p id={headingId}>
        <strong>{aroundHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {aroundToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-around-body>
          <p>{aroundIntro(locale)}</p>
          <div className="field">
            <label htmlFor={selectId}>{t(locale, "Place to look around", "Lieu autour duquel regarder")}</label>
            <select
              id={selectId}
              value={centreId}
              onChange={(e) => {
                setCentreId(e.target.value);
                setFilter(NO_AROUND_FILTER);
                setStatus("");
              }}
            >
              <option value="">{t(locale, "Choose a place", "Choisir un lieu")}</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {centreOptionLabel(p, locale)}
                </option>
              ))}
            </select>
          </div>
          {unmapped > 0 ? (
            <p>
              {t(
                locale,
                unmapped === 1 ? "1 place has no map point, so it cannot be chosen." : `${unmapped} places have no map point, so they cannot be chosen.`,
                unmapped === 1 ? "1 lieu n’a pas de point sur la carte\u00a0: il ne peut donc pas être choisi." : `${unmapped} lieux n’ont pas de point sur la carte\u00a0: ils ne peuvent donc pas être choisis.`,
              )}
            </p>
          ) : null}
          <ChoiceGroup
            label={t(locale, "How far around", "Jusqu’où autour")}
            value={String(radius)}
            onChange={(v) => {
              const n = Number(v);
              if (isAroundRadius(n)) setRadius(n);
            }}
            options={AROUND_RADII.map((r) => ({ value: String(r), label: radiusOptionLabel(r, locale) }))}
          />
          {result.status === "no-centre" ? <p role="status">{chooseFirst(locale)}</p> : null}
          {result.status === "centre-not-found" ? <p role="status">{centreNotFound(locale)}</p> : null}
          {result.status === "centre-has-no-point" ? <p role="status">{noPointCentre(result.centre, locale)}</p> : null}
          {ok !== null ? (
            <>
              <p role="status" data-around-summary>
                {aroundSummary(ok, shown.length, isFiltered(filter), locale)}
              </p>
              <p>{aroundCaveat(locale)}</p>
              {ok.members.length > 0 ? (
                <>
                  <fieldset className="stack">
                    <legend>{t(locale, "Narrow the list", "Restreindre la liste")}</legend>
                    <TextInput label={t(locale, "Find among these places", "Chercher parmi ces lieux")} value={filter.query} onChange={(query) => setFilter((f) => ({ ...f, query }))} />
                    {AROUND_TAG_COLUMNS.map((tag) => (
                      <CheckField
                        key={tag}
                        label={t(locale, `Wheelchair tag: ${tagWord(tag, "en")}`, `Indication pour fauteuil roulant\u00a0: ${tagWord(tag, "fr")}`)}
                        isSelected={filter.tags.includes(tag)}
                        onChange={() => setFilter((f) => ({ ...f, tags: toggleTag(f.tags, tag) }))}
                      />
                    ))}
                    <div className="field">
                      <label htmlFor={directionId}>{t(locale, "Direction", "Direction")}</label>
                      <select
                        id={directionId}
                        value={filter.direction ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFilter((f) => ({ ...f, direction: isDirection(v) ? v : null }));
                        }}
                      >
                        <option value="">{t(locale, "Any direction", "Toutes les directions")}</option>
                        {COMPASS_POINTS.map((p) => (
                          <option key={p} value={p}>
                            {compassWord(p, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ChoiceGroup
                      label={t(locale, "Order", "Ordre")}
                      value={order}
                      onChange={(v) => {
                        if (isAroundOrder(v)) setOrder(v);
                      }}
                      options={AROUND_ORDERS.map((o) => ({ value: o, label: aroundOrderLabel(o, locale) }))}
                    />
                  </fieldset>
                  {shown.length === 0 ? (
                    <p role="status">{noMatchesLine(locale)}</p>
                  ) : (
                    <table>
                      <caption>{t(locale, "Places listed around the chosen place", "Lieux répertoriés autour du lieu choisi")}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t(locale, "Place", "Lieu")}</th>
                          <th scope="col">{t(locale, "Distance and direction", "Distance et direction")}</th>
                          <th scope="col">{t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((m) => (
                          <tr key={m.id} data-tag={m.tag}>
                            <th scope="row">{memberName(m, locale)}</th>
                            <td>{distanceAndDirection(m.metres, m.direction, locale)}</td>
                            <td>{tagWord(m.tag, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <table>
                    <caption>{t(locale, "Places by distance band", "Lieux par tranche de distance")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t(locale, "Distance", "Distance")}</th>
                        <th scope="col">{t(locale, "Places", "Lieux")}</th>
                        {AROUND_TAG_COLUMNS.map((tag) => (
                          <th key={tag} scope="col">
                            {tagWord(tag, locale)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rings.map((row) => (
                        <tr key={row.upTo}>
                          <th scope="row">{ringLabel(row, locale)}</th>
                          <td>{row.count}</td>
                          {AROUND_TAG_COLUMNS.map((tag) => (
                            <td key={tag}>{row.byTag[tag]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <table>
                    <caption>{t(locale, "Places by direction", "Lieux par direction")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t(locale, "Direction", "Direction")}</th>
                        <th scope="col">{t(locale, "Places", "Lieux")}</th>
                        <th scope="col">{t(locale, "Closest in that direction", "Le plus proche dans cette direction")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectors.map((row) => (
                        <tr key={row.point ?? "same"}>
                          <th scope="row">{sectorLabel(row, locale)}</th>
                          <td>{row.count}</td>
                          <td>{nearestInSector(row, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              {beyondLine(ok.beyond, ok.radius, locale) ? <p>{beyondLine(ok.beyond, ok.radius, locale)}</p> : null}
              {aroundUnmeasuredLine(ok.unmeasured, locale) ? <p>{aroundUnmeasuredLine(ok.unmeasured, locale)}</p> : null}
              {shown.length > 0 ? (
                <div className="stack" role="group" aria-label={t(locale, "Save this list", "Enregistrer cette liste")}>
                  <Button variant="secondary" onPress={() => save({ name: AROUND_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: aroundListToText(ok, shown, isFiltered(filter), locale) })}>
                    {t(locale, "Save as text (.txt)", "Enregistrer en texte (.txt)")}
                  </Button>
                  <Button variant="secondary" onPress={() => save({ name: AROUND_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: aroundListToCsv(ok, shown, { bom: true }) })}>
                    {t(locale, "Save as a spreadsheet (.csv)", "Enregistrer en tableur (.csv)")}
                  </Button>
                </div>
              ) : null}
              <p aria-live="polite" data-around-status>
                {status}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
