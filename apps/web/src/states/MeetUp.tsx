import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { DEFAULT_MEET_UP_LIMIT, DEFAULT_MEET_UP_ORDER, MEET_UP_LIMITS, MEET_UP_ORDERS, type MeetUpLimit, type MeetUpOrder, buildMeetUp, isMeetUpLimit, isMeetUpOrder, meetUpPage } from "./meetUp.ts";
import { MEET_UP_CSV_FILENAMES, MEET_UP_FILENAMES, meetUpApartText, meetUpCaveat, meetUpCountText, meetUpOrderHelp, meetUpOrderLabel, meetUpStatus, meetUpToCsv, meetUpToText, nearerText } from "./meetUpCopy.ts";
import { MEET_UP_GEOJSON_FILENAMES, meetUpToGeoJson } from "./meetUpGeo.ts";
import { hasPace, meetUpMinutes, meetUpMinutesCell, meetUpPaceNote, readPaces } from "./meetUpTime.ts";
import { MAX_PACE_KMH, MIN_PACE_KMH } from "./outingPace.ts";
import { formatPackDistance, parsePointInput, type Point } from "./packGeo.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places on screen. Fewer than two and nothing is drawn. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** The point typed in the near-me fields, if it is a good one. Offered as the first point. */
  from?: Point | null;
  /** Hands a file to the browser to save; returns false when it cannot. */
  onSave?: (file: SavedFile) => boolean;
}

const MIN_PLACES = 2;
const fmt = (n: number): string => n.toFixed(5);

/**
 * Two people, two points: lists the places on screen by how far each is from both, as straight
 * lines. Nothing here is sent anywhere or kept; the points live in this component until the page
 * closes. It does not say a place is good, open, reachable or accessible.
 */
export function MeetUp({ places, locale, from = null, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [latA, setLatA] = useState("");
  const [lonA, setLonA] = useState("");
  const [latB, setLatB] = useState("");
  const [lonB, setLonB] = useState("");
  const [order, setOrder] = useState<MeetUpOrder>(DEFAULT_MEET_UP_ORDER);
  const [limit, setLimit] = useState<MeetUpLimit>(DEFAULT_MEET_UP_LIMIT);
  const [paceA, setPaceA] = useState("");
  const [paceB, setPaceB] = useState("");
  const [status, setStatus] = useState("");

  const pa = parsePointInput(latA, lonA);
  const pb = parsePointInput(latB, lonB);
  const a = pa.status === "ok" ? pa.point : null;
  const b = pb.status === "ok" ? pb.point : null;
  const { paces, errorA, errorB } = readPaces(paceA, paceB);
  const timed = hasPace(paces);
  const result = useMemo(() => (open && a && b ? buildMeetUp(places, a, b, order) : null), [open, a, b, places, order]);

  if (places.length < MIN_PLACES) return null;

  const page = result ? meetUpPage(result, limit) : null;
  const chooseOrder = (v: string) => {
    if (!isMeetUpOrder(v)) return;
    setOrder(v);
    if (result) setStatus(meetUpStatus(v, Math.min(limit, result.rows.length), result.rows.length, locale));
  };
  const chooseLimit = (v: string) => {
    const n = Number(v);
    if (isMeetUpLimit(n)) setLimit(n);
  };
  const pickPoint = () => {
    if (!from) return;
    setLatA(fmt(from.lat));
    setLonA(fmt(from.lon));
  };
  // Swapping also swaps the two paces, so each person keeps their own point and pace.
  const swap = () => {
    setLatA(latB);
    setLonA(lonB);
    setLatB(latA);
    setLonB(lonA);
    setPaceA(paceB);
    setPaceB(paceA);
    setStatus(t(locale, "The two points and paces are swapped.", "Les deux points et les deux rythmes sont échangés."));
  };
  const halfwayAsFirst = () => {
    if (!result) return;
    setLatA(fmt(result.middle.lat));
    setLonA(fmt(result.middle.lon));
    setStatus(t(locale, "The first point is now halfway between the two.", "Le premier point est maintenant le milieu entre les deux."));
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
  const bad = t(locale, "Type a latitude from -90 to 90 and a longitude from -180 to 180, for example 43.65 and -79.38.", "Saisissez une latitude de -90 à 90 et une longitude de -180 à 180, par exemple 43,65 et -79,38.");
  const paceError = t(locale, `Type a pace from ${MIN_PACE_KMH} to ${MAX_PACE_KMH} km/h, for example 3.5, or leave it empty.`, `Saisissez un rythme de ${String(MIN_PACE_KMH).replace(".", ",")} à ${MAX_PACE_KMH} km/h, par exemple 3,5, ou laissez le champ vide.`);
  const half = (s: typeof pa) => (s.status === "invalid" ? bad : undefined);

  return (
    <section aria-label={t(locale, "Places for two people to meet", "Lieux de rencontre pour deux personnes")} lang={locale} data-meet-up={open ? "open" : "closed"}>
      <Button variant="quiet" aria-expanded={open} aria-controls={bodyId} onPress={() => setOpen(!open)}>
        {open ? t(locale, "Hide places for two people to meet", "Masquer les lieux de rencontre pour deux personnes") : t(locale, "Show places for two people to meet", "Afficher les lieux de rencontre pour deux personnes")}
      </Button>
      <div id={bodyId} hidden={!open} aria-labelledby={open ? headingId : undefined} role={open ? "group" : undefined}>
        {open ? (
          <>
            <h3 id={headingId}>{t(locale, "Places for two people to meet", "Lieux de rencontre pour deux personnes")}</h3>
            <p>{t(locale, "Type two map points, for example where each person starts. The places on screen are listed by how far each is from both.", "Saisissez deux points de carte, par exemple le point de départ de chaque personne. Les lieux affichés sont classés selon leur distance aux deux points.")}</p>
            <fieldset className="stack">
              <legend>{t(locale, "First point", "Premier point")}</legend>
              <TextInput label={t(locale, "First point latitude", "Latitude du premier point")} value={latA} onChange={setLatA} error={half(pa)} />
              <TextInput label={t(locale, "First point longitude", "Longitude du premier point")} value={lonA} onChange={setLonA} />
              {from ? (
                <Button variant="quiet" onPress={pickPoint}>
                  {t(locale, "Use the point typed above", "Utiliser le point saisi plus haut")}
                </Button>
              ) : null}
            </fieldset>
            <fieldset className="stack">
              <legend>{t(locale, "Second point", "Deuxième point")}</legend>
              <TextInput label={t(locale, "Second point latitude", "Latitude du deuxième point")} value={latB} onChange={setLatB} error={half(pb)} />
              <TextInput label={t(locale, "Second point longitude", "Longitude du deuxième point")} value={lonB} onChange={setLonB} />
            </fieldset>
            <fieldset className="stack">
              <legend>{t(locale, "Usual pace (optional)", "Rythme habituel (facultatif)")}</legend>
              <TextInput label={t(locale, "First person pace in km/h", "Rythme de la première personne en km/h")} value={paceA} onChange={setPaceA} error={errorA ? paceError : undefined} inputMode="numeric" />
              <TextInput label={t(locale, "Second person pace in km/h", "Rythme de la deuxième personne en km/h")} description={t(locale, "Only used to work out a minimum time. It is not saved.", "Sert seulement à calculer une durée minimale. Il n’est pas enregistré.")} value={paceB} onChange={setPaceB} error={errorB ? paceError : undefined} inputMode="numeric" />
            </fieldset>
            <div className="stack" role="group" aria-label={t(locale, "Points", "Points")}>
              <Button variant="quiet" onPress={swap}>
                {t(locale, "Swap the two points", "Échanger les deux points")}
              </Button>
            </div>
            <ChoiceGroup label={t(locale, "Order of the places", "Ordre des lieux")} description={meetUpOrderHelp(order, locale)} value={order} onChange={chooseOrder} options={MEET_UP_ORDERS.map((o) => ({ value: o, label: meetUpOrderLabel(o, locale) }))} />
            <ChoiceGroup label={t(locale, "How many to show", "Nombre de lieux affichés")} value={String(limit)} onChange={chooseLimit} options={MEET_UP_LIMITS.map((n) => ({ value: String(n), label: String(n) }))} />
            <p>{meetUpCaveat(locale)}</p>
            {result && page && a && b ? (
              <>
                <p data-meet-up-apart>{meetUpApartText(result, locale)}</p>
                <Button variant="quiet" onPress={halfwayAsFirst}>
                  {t(locale, "Make the first point the halfway point", "Faire du premier point le milieu")}
                </Button>
                <p data-meet-up-count>{meetUpCountText(result, locale)}</p>
                {page.rows.length > 0 ? (
                  // A scrolling region has to be reachable by keyboard, or its far columns cannot be read without a mouse.
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  <div style={{ overflowX: "auto" }} role="region" aria-label={t(locale, "Places by distance from both points", "Lieux selon la distance aux deux points")} tabIndex={0}>
                    <table>
                      <caption>{t(locale, `Showing ${page.rows.length} of ${result.rows.length} places. Distances are straight lines; the order is not a recommendation.`, `${page.rows.length} lieux affichés sur ${result.rows.length}. Les distances sont des lignes droites\u202f; l’ordre n’est pas une recommandation.`)}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t(locale, "Position", "Position")}</th>
                          <th scope="col">{t(locale, "Place", "Lieu")}</th>
                          <th scope="col">{t(locale, "From the first point", "Du premier point")}</th>
                          <th scope="col">{t(locale, "From the second point", "Du deuxième point")}</th>
                          {timed ? <th scope="col">{t(locale, "At least, first person", "Au moins, première personne")}</th> : null}
                          {timed ? <th scope="col">{t(locale, "At least, second person", "Au moins, deuxième personne")}</th> : null}
                          <th scope="col">{t(locale, "Nearer", "Plus proche")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.rows.map((row) => {
                          const m = meetUpMinutes(row, paces);
                          return (
                            <tr key={row.id} data-meet-up-row={row.position}>
                              <td>{row.position}</td>
                              <th scope="row">{row.name ?? "UNKNOWN"}</th>
                              <td>{formatPackDistance(row.metresA, locale)}</td>
                              <td>{formatPackDistance(row.metresB, locale)}</td>
                              {timed ? <td>{meetUpMinutesCell(m.a)}</td> : null}
                              {timed ? <td>{meetUpMinutesCell(m.b)}</td> : null}
                              <td>{nearerText(row.nearer, locale)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {timed ? <p data-meet-up-pace-note>{meetUpPaceNote(locale)}</p> : null}
                {page.more > 0 ? <p data-meet-up-more>{t(locale, `${page.more} more places are not shown. Save the file to see all of them.`, `${page.more} autres lieux ne sont pas affichés. Enregistrez le fichier pour les voir tous.`)}</p> : null}
                <div className="stack" role="group" aria-label={t(locale, "Meet-up actions", "Actions sur les lieux de rencontre")}>
                  <Button variant="secondary" onPress={() => save({ name: MEET_UP_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: meetUpToText(result, a, b, locale, paces) })}>
                    {t(locale, "Save the list (text)", "Enregistrer la liste (texte)")}
                  </Button>
                  <Button variant="secondary" onPress={() => save({ name: MEET_UP_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: meetUpToCsv(result, places, locale, paces) })}>
                    {t(locale, "Save the list (CSV)", "Enregistrer la liste (CSV)")}
                  </Button>
                  <Button variant="secondary" onPress={() => save({ name: MEET_UP_GEOJSON_FILENAMES[locale], mime: "application/geo+json;charset=utf-8", content: meetUpToGeoJson(result, a, b, places, paces) })}>
                    {t(locale, "Save the points and places (GeoJSON)", "Enregistrer les points et les lieux (GeoJSON)")}
                  </Button>
                </div>
              </>
            ) : (
              <p data-meet-up-wait>{t(locale, "Type both points to see the list.", "Saisissez les deux points pour voir la liste.")}</p>
            )}
            <p role="status" data-meet-up-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
