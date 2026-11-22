import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { formatPackDistance, parsePointInput, type Point } from "./packGeo.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { TagFilter } from "./packPlacesView.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import { tagText } from "./outingCopy.ts";
import {
  DEFAULT_WAY_LIMIT, DEFAULT_WAY_WIDTH, MAX_VIA, WAY_LIMITS, WAY_TAG_FILTERS, WAY_WIDTHS, buildPath, countWayTags, filterWay, isWayLimit, isWayTagFilter, isWayWidth, longestStretch, pointChoices, wayPage, type WayLimit, type WayWidth,
} from "./wayPlaces.ts";
import {
  wayNameOf, wayAlongText, wayCannotSaveText, wayCaption, wayCaveat, wayColumns, wayHeading, wayIntro, wayLimitGroupLabel, wayMoreText, wayNoMatchText, wayPointError, wayProblemText, wayReversedText, waySavedText, wayStatus, wayStretchText, waySummary,
  wayPickFirst, wayPickLabel, wayPickMore, wayPickNone, wayPickNothing, wayPickOption, wayPickSecond, wayPickedText, wayTagGroupLabel, wayTagLabel, wayToggle, wayViaAdd, wayViaFull, wayViaLegend, wayViaRemove, wayWaitText, wayWidthGroupLabel, wayWidthHelp, wayWidthLabel,
} from "./wayPlacesCopy.ts";
import { WAY_CSV_FILENAMES, WAY_FILENAMES, WAY_GEOJSON_FILENAMES, wayToCsv, wayToGeoJson, wayToText } from "./wayPlacesExport.ts";

interface Props {
  /** The places on screen. With none that has a map point, nothing is drawn. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** The point typed in the near-me fields, if it is a good one. Offered as the first point. */
  from?: Point | null;
  /** Hands a file to the browser to save; returns false when it cannot. */
  onSave?: (file: SavedFile) => boolean;
}

const fmt = (n: number): string => n.toFixed(5);

interface TypedPoint {
  readonly lat: string;
  readonly lon: string;
}
const EMPTY_POINT: TypedPoint = { lat: "", lon: "" };

/**
 * Two points and a straight line between them: lists the places on screen near that line, in order from
 * the first point. The points live in this component until the page closes; nothing is sent or kept.
 * It does not say a place is open, reachable or accessible, and the line is not a route.
 */
export function WayPlaces({ places, locale, from = null, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const bodyId = useId();
  const pickId = useId();
  const [open, setOpen] = useState(false);
  const [latA, setLatA] = useState("");
  const [lonA, setLonA] = useState("");
  const [latB, setLatB] = useState("");
  const [lonB, setLonB] = useState("");
  const [via, setVia] = useState<readonly TypedPoint[]>([]);
  const [width, setWidth] = useState<WayWidth>(DEFAULT_WAY_WIDTH);
  const [tag, setTag] = useState<TagFilter>("any");
  const [limit, setLimit] = useState<WayLimit>(DEFAULT_WAY_LIMIT);
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState("");

  const choices = useMemo(() => (open ? pointChoices(places) : null), [open, places]);
  const pa = parsePointInput(latA, lonA);
  const pb = parsePointInput(latB, lonB);
  const a = pa.status === "ok" ? pa.point : null;
  const b = pb.status === "ok" ? pb.point : null;
  const pv = via.map((v) => parsePointInput(v.lat, v.lon));
  const inBetween = pv.every((s) => s.status === "ok") ? pv.map((s) => (s.status === "ok" ? s.point : null)).filter((p): p is Point => p !== null) : null;
  const points = a && b && inBetween ? [a, ...inBetween, b] : null;
  const key = points ? points.map((p) => `${p.lat},${p.lon}`).join(";") : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `points`, which is a new array on every render
  const result = useMemo(() => (open && points ? buildPath(places, points, width) : null), [open, key, places, width]);

  if (!places.some((p) => p.location !== null)) return null;

  const ok = result && result.ok ? result : null;
  const counts = ok ? countWayTags(ok.rows) : null;
  const rows = ok ? filterWay(ok.rows, tag) : [];
  const page = wayPage(rows, limit);
  const stretch = ok ? wayStretchText(longestStretch(rows, ok.length), ok.length, locale) : "";
  const cols = wayColumns(locale);

  const announce = (n: number, total: number, which: TagFilter) => setStatus(wayStatus(Math.min(n, limit), total, which, locale));
  const chooseWidth = (v: string) => {
    const n = Number(v);
    if (!isWayWidth(n)) return;
    setWidth(n);
    setStatus(wayWidthLabel(n, locale));
  };
  const chooseTag = (v: string) => {
    if (!isWayTagFilter(v)) return;
    setTag(v);
    if (ok) {
      const kept = filterWay(ok.rows, v).length;
      announce(kept, kept, v);
    }
  };
  const chooseLimit = (v: string) => {
    const n = Number(v);
    if (!isWayLimit(n)) return;
    setLimit(n);
    setStatus(wayStatus(Math.min(n, rows.length), rows.length, tag, locale));
  };
  const usePointAbove = () => {
    if (!from) return;
    setLatA(fmt(from.lat));
    setLonA(fmt(from.lon));
  };
  // Swapping lists the places from the other end; points in between keep their place on the path.
  const swap = () => {
    setLatA(latB);
    setLonA(lonB);
    setLatB(latA);
    setLonB(lonA);
    setVia([...via].reverse());
    setStatus(wayReversedText(locale));
  };
  const takePlace = (which: "first" | "second") => {
    const c = choices?.choices.find((x) => x.id === picked);
    if (!c) {
      setStatus(wayPickNothing(locale));
      return;
    }
    if (which === "first") {
      setLatA(fmt(c.point.lat));
      setLonA(fmt(c.point.lon));
    } else {
      setLatB(fmt(c.point.lat));
      setLonB(fmt(c.point.lon));
    }
    setStatus(wayPickedText(which, c.name, locale));
  };
  const addVia = () => {
    if (via.length >= MAX_VIA) return;
    setVia([...via, EMPTY_POINT]);
    setStatus(t(locale, `${wayViaLegend(via.length + 1, locale)} added. Type it to use it.`, `${wayViaLegend(via.length + 1, locale)} ajouté. Saisissez-le pour l’utiliser.`));
  };
  const removeVia = (i: number) => {
    setVia(via.filter((_, j) => j !== i));
    setStatus(t(locale, `${wayViaLegend(i + 1, locale)} removed.`, `${wayViaLegend(i + 1, locale)} retiré.`));
  };
  const setViaField = (i: number, field: keyof TypedPoint, value: string) => setVia(via.map((v, j) => (j === i ? { ...v, [field]: value } : v)));
  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? waySavedText(file.name, locale) : wayCannotSaveText(locale));
  };
  const half = (s: typeof pa) => (s.status === "invalid" ? wayPointError(locale) : undefined);

  return (
    <section aria-label={wayHeading(locale)} lang={locale} data-way-places={open ? "open" : "closed"}>
      <Button variant="quiet" aria-expanded={open} aria-controls={bodyId} onPress={() => setOpen(!open)}>
        {wayToggle(open, locale)}
      </Button>
      <div id={bodyId} hidden={!open} aria-labelledby={open ? headingId : undefined} role={open ? "group" : undefined}>
        {open ? (
          <>
            <h3 id={headingId}>{wayHeading(locale)}</h3>
            <p>{wayIntro(locale)}</p>
            {choices && choices.choices.length > 0 ? (
              <div className="stack" data-way-pick>
                <label htmlFor={pickId}>{wayPickLabel(locale)}</label>
                <select id={pickId} value={picked} onChange={(e) => setPicked(e.target.value)} style={{ minHeight: 44 }}>
                  <option value="">{wayPickNone(locale)}</option>
                  {choices.choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {wayPickOption(c.name, c.id)}
                    </option>
                  ))}
                </select>
                {choices.more > 0 ? <p data-way-pick-more>{wayPickMore(choices.more, locale)}</p> : null}
                <div className="row">
                  <Button variant="quiet" onPress={() => takePlace("first")}>
                    {wayPickFirst(locale)}
                  </Button>
                  <Button variant="quiet" onPress={() => takePlace("second")}>
                    {wayPickSecond(locale)}
                  </Button>
                </div>
              </div>
            ) : null}
            <fieldset className="stack">
              <legend>{t(locale, "First point", "Premier point")}</legend>
              <TextInput label={t(locale, "First point latitude", "Latitude du premier point")} value={latA} onChange={setLatA} error={half(pa)} />
              <TextInput label={t(locale, "First point longitude", "Longitude du premier point")} value={lonA} onChange={setLonA} />
              {from ? (
                <Button variant="quiet" onPress={usePointAbove}>
                  {t(locale, "Use the point typed above", "Utiliser le point saisi plus haut")}
                </Button>
              ) : null}
            </fieldset>
            {via.map((v, i) => (
              <fieldset className="stack" key={i} data-way-via={i + 1}>
                <legend>{wayViaLegend(i + 1, locale)}</legend>
                <TextInput label={t(locale, `Point in between ${i + 1} latitude`, `Latitude du point intermédiaire ${i + 1}`)} value={v.lat} onChange={(x) => setViaField(i, "lat", x)} error={pv[i]?.status === "invalid" ? wayPointError(locale) : undefined} />
                <TextInput label={t(locale, `Point in between ${i + 1} longitude`, `Longitude du point intermédiaire ${i + 1}`)} value={v.lon} onChange={(x) => setViaField(i, "lon", x)} />
                <Button variant="quiet" onPress={() => removeVia(i)}>
                  {wayViaRemove(i + 1, locale)}
                </Button>
              </fieldset>
            ))}
            <fieldset className="stack">
              <legend>{t(locale, "Second point", "Deuxième point")}</legend>
              <TextInput label={t(locale, "Second point latitude", "Latitude du deuxième point")} value={latB} onChange={setLatB} error={half(pb)} />
              <TextInput label={t(locale, "Second point longitude", "Longitude du deuxième point")} value={lonB} onChange={setLonB} />
            </fieldset>
            <div className="stack" role="group" aria-label={t(locale, "Points", "Points")}>
              <Button variant="quiet" onPress={swap}>
                {t(locale, "Swap the two points", "Échanger les deux points")}
              </Button>
              {via.length < MAX_VIA ? (
                <Button variant="quiet" onPress={addVia}>
                  {wayViaAdd(locale)}
                </Button>
              ) : (
                <p data-way-via-full>{wayViaFull(MAX_VIA, locale)}</p>
              )}
            </div>
            <ChoiceGroup label={wayWidthGroupLabel(locale)} description={wayWidthHelp(locale)} value={String(width)} onChange={chooseWidth} options={WAY_WIDTHS.map((w) => ({ value: String(w), label: wayWidthLabel(w, locale) }))} />
            <p>{wayCaveat(locale)}</p>
            {result && !result.ok ? (
              <p data-way-problem>{wayProblemText(result.problem, result.length, locale)}</p>
            ) : ok && points && counts ? (
              <>
                <p data-way-summary>{waySummary(ok, locale)}</p>
                {ok.rows.length > 0 ? (
                  <>
                    <ChoiceGroup label={wayTagGroupLabel(locale)} value={tag} onChange={chooseTag} options={WAY_TAG_FILTERS.map((f) => ({ value: f, label: wayTagLabel(f, counts[f], locale) }))} />
                    <ChoiceGroup label={wayLimitGroupLabel(locale)} value={String(limit)} onChange={chooseLimit} options={WAY_LIMITS.map((n) => ({ value: String(n), label: String(n) }))} />
                  </>
                ) : null}
                {stretch !== "" ? <p data-way-stretch>{stretch}</p> : null}
                {ok.rows.length > 0 && rows.length === 0 ? <p data-way-no-match>{wayNoMatchText(locale)}</p> : null}
                {page.rows.length > 0 ? (
                  // A scrolling region has to be reachable by keyboard, or its far columns cannot be read without a mouse.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  <div style={{ overflowX: "auto" }} role="region" aria-label={t(locale, "Places along the line", "Lieux le long de la ligne")} tabIndex={0}>
                    <table>
                      <caption>{wayCaption(page.rows.length, rows.length, locale)}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{cols.position}</th>
                          <th scope="col">{cols.place}</th>
                          <th scope="col">{cols.along}</th>
                          <th scope="col">{cols.off}</th>
                          <th scope="col">{cols.tag}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.rows.map((row) => (
                          <tr key={row.id} data-way-row={row.position}>
                            <td>{row.position}</td>
                            <th scope="row">{wayNameOf(row.name)}</th>
                            <td>{ok.legs.length > 1 ? t(locale, `${wayAlongText(row, locale)} (part ${row.leg})`, `${wayAlongText(row, locale)} (partie ${row.leg})`) : wayAlongText(row, locale)}</td>
                            <td>{formatPackDistance(row.off, locale)}</td>
                            <td>{tagText(row.tag, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {page.more > 0 ? <p data-way-more>{wayMoreText(page.more, locale)}</p> : null}
                {rows.length > 0 ? (
                  <div className="stack" role="group" aria-label={t(locale, "Files of the places along the line", "Fichiers des lieux le long de la ligne")}>
                    <Button variant="secondary" onPress={() => save({ name: WAY_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: wayToText(ok, rows, tag, points, locale) })}>
                      {t(locale, "Save the list (text)", "Enregistrer la liste (texte)")}
                    </Button>
                    <Button variant="secondary" onPress={() => save({ name: WAY_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: wayToCsv(ok, rows, places, locale) })}>
                      {t(locale, "Save the list (CSV)", "Enregistrer la liste (CSV)")}
                    </Button>
                    <Button variant="secondary" onPress={() => save({ name: WAY_GEOJSON_FILENAMES[locale], mime: "application/geo+json;charset=utf-8", content: wayToGeoJson(ok, rows, places, points) })}>
                      {t(locale, "Save the line and places (GeoJSON)", "Enregistrer la ligne et les lieux (GeoJSON)")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p data-way-wait>{wayWaitText(locale)}</p>
            )}
            <p role="status" data-way-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
