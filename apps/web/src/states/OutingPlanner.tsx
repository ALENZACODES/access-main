import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { type OutingInput, type OutingMode, OUTING_MODES, buildOuting, isOutingMode, moveStop, orderFor, reverseOrder } from "./outingPlan.ts";
import { cannotMoveLine, legText, legTimeText, modeHint, modeLabel, movedLine, paceNote, planTitle, startLine, straightLineNote, summaryLine, tagText } from "./outingCopy.ts";
import { OUTING_CSV_FILENAMES, OUTING_GEOJSON_FILENAMES, OUTING_TEXT_FILENAMES, outingToCsv, outingToGeoJson, outingToText } from "./outingExport.ts";
import { parsePace, MAX_PACE_KMH, MIN_PACE_KMH } from "./outingPace.ts";
import type { Point } from "./packGeo.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly OutingInput[];
  locale: Locale;
  today: string;
  /** The starting point, when the person gave one. Used only to measure the first distance. */
  start?: Point | null;
  /** Hands a file to the browser to save; returns false when it cannot. */
  onSave?: (file: SavedFile) => boolean;
}

const MIN_STOPS = 2;

/**
 * Puts the shortlisted places in a visiting order and shows the straight-line distance between
 * stops. The order can follow the list, go nearest-next, or be set by hand with Up and Down
 * buttons. The choice is kept in memory only and is gone when the page closes. It describes distances between map points and says nothing about whether an order, a
 * place or a trip is better, easier or possible.
 */
export function OutingPlanner({ places, locale, today, start = null, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const [mode, setMode] = useState<OutingMode>("added");
  const [mine, setMine] = useState<readonly string[]>([]);
  const [paceText, setPaceText] = useState("");
  const [status, setStatus] = useState("");

  const order = useMemo(() => orderFor(mode, places, start, mine), [mode, places, start, mine]);
  const outing = useMemo(() => buildOuting(places, order, start), [places, order, start]);
  const pace = parsePace(paceText);
  const kmh = pace.status === "ok" ? pace.kmh : null;

  if (places.length < MIN_STOPS) return null;

  const nameOf = (id: string) => places.find((p) => p.id === id)?.name ?? "UNKNOWN";

  const choose = (value: string) => {
    if (!isOutingMode(value)) return;
    // The first time "my own order" is chosen it starts from the order on screen, so nothing jumps; after that it keeps what the person set.
    const seeded = value === "mine" && mine.length === 0 ? order : mine;
    setMode(value);
    setMine(seeded);
    setStatus("");
  };
  const move = (id: string, step: -1 | 1) => {
    const result = moveStop(order, id, step);
    if (!result.moved) {
      setStatus(cannotMoveLine(nameOf(id), result.position, step, locale));
      return;
    }
    setMode("mine");
    setMine(result.order);
    setStatus(movedLine(nameOf(id), result.position, order.length, locale));
  };
  const reverse = () => {
    const next = reverseOrder(order);
    setMode("mine");
    setMine(next);
    setStatus(t(locale, "The order is reversed.", "L’ordre est inversé."));
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

  const showTime = kmh !== null;
  const paceError = pace.status === "invalid" ? t(locale, `Type a pace from ${MIN_PACE_KMH} to ${MAX_PACE_KMH} km/h, for example 3.5, or leave it empty.`, `Saisissez un rythme de ${String(MIN_PACE_KMH).replace(".", ",")} à ${MAX_PACE_KMH} km/h, par exemple 3,5, ou laissez le champ vide.`) : undefined;

  return (
    <section aria-labelledby={headingId} lang={locale} data-outing={outing.stops.length}>
      <h3 id={headingId}>{planTitle(locale)}</h3>
      <ChoiceGroup label={t(locale, "Order of the stops", "Ordre des arrêts")} description={modeHint(mode, locale)} value={mode} onChange={choose} options={OUTING_MODES.map((m) => ({ value: m, label: modeLabel(m, locale) }))} />
      <TextInput label={t(locale, "Your usual pace in km/h (optional)", "Votre rythme habituel en km/h (facultatif)")} description={t(locale, "Only used to work out a minimum time. It is not saved.", "Sert seulement à calculer une durée minimale. Il n’est pas enregistré.")} value={paceText} onChange={setPaceText} error={paceError} inputMode="numeric" />
      <p data-outing-summary>{summaryLine(outing, locale, kmh)}</p>
      <p>{startLine(start !== null, locale)}</p>
      <p>{straightLineNote(locale)}</p>
      {showTime ? <p>{paceNote(locale)}</p> : null}
      {/* A scrolling region has to be reachable by keyboard, or its far columns cannot be read without a mouse. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div style={{ overflowX: "auto" }} role="region" aria-label={t(locale, "Stops in order", "Arrêts dans l’ordre")} tabIndex={0}>
        <table>
          <caption>{t(locale, `The ${outing.stops.length} stops in the order shown. Distances are straight lines; nothing is ranked.`, `Les ${outing.stops.length} arrêts dans l’ordre affiché. Les distances sont des lignes droites\u202f; rien n’est classé.`)}</caption>
          <thead>
            <tr>
              <th scope="col">{t(locale, "Stop", "Arrêt")}</th>
              <th scope="col">{t(locale, "Place", "Lieu")}</th>
              <th scope="col">{t(locale, "Wheelchair tag", "Indication pour fauteuil roulant")}</th>
              <th scope="col">{t(locale, "Straight line from the previous point", "Ligne droite depuis le point précédent")}</th>
              {showTime ? <th scope="col">{t(locale, "At least", "Au moins")}</th> : null}
              <th scope="col">{t(locale, "Total so far", "Total jusqu’ici")}</th>
              <th scope="col">{t(locale, "Move", "Déplacer")}</th>
            </tr>
          </thead>
          <tbody>
            {outing.stops.map((s) => (
              <tr key={s.id} data-stop={s.position}>
                <td>{s.position}</td>
                <th scope="row">{s.name ?? "UNKNOWN"}</th>
                <td>{tagText(s.tag, locale)}</td>
                <td>{s.position === 1 && start === null ? "–" : legText(s.legMetres, locale)}</td>
                {showTime ? <td>{s.position === 1 && start === null ? "–" : legTimeText(s.legMetres, kmh)}</td> : null}
                <td>{legText(s.totalMetres, locale)}
                  {s.totalComplete ? "" : t(locale, " or more", " ou plus")}</td>
                <td>
                  <div className="button-row">
                    <Button variant="quiet" onPress={() => move(s.id, -1)} aria-label={t(locale, `Move ${s.name ?? "UNKNOWN"} up`, `Monter ${s.name ?? "UNKNOWN"}`)}>
                      {t(locale, "Up", "Monter")}
                    </Button>
                    <Button variant="quiet" onPress={() => move(s.id, 1)} aria-label={t(locale, `Move ${s.name ?? "UNKNOWN"} down`, `Descendre ${s.name ?? "UNKNOWN"}`)}>
                      {t(locale, "Down", "Descendre")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stack" role="group" aria-label={t(locale, "Outing actions", "Actions sur la sortie")}>
        <Button variant="secondary" onPress={reverse}>
          {t(locale, "Reverse the order", "Inverser l’ordre")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: OUTING_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: outingToText(outing, locale, today, kmh) })}>
          {t(locale, "Save the outing (text)", "Enregistrer la sortie (texte)")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: OUTING_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: outingToCsv(outing, { bom: true }) })}>
          {t(locale, "Save the outing (CSV)", "Enregistrer la sortie (CSV)")}
        </Button>
        <Button variant="secondary" onPress={() => save({ name: OUTING_GEOJSON_FILENAMES[locale], mime: "application/geo+json;charset=utf-8", content: outingToGeoJson(outing) })}>
          {t(locale, "Save the stops (GeoJSON)", "Enregistrer les arrêts (GeoJSON)")}
        </Button>
      </div>
      <p aria-live="polite" data-outing-status>
        {status}
      </p>
    </section>
  );
}
