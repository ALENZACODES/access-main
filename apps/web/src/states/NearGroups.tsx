import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { groupMiddle, buildNeighbours } from "./nearNeighbour.ts";
import { NEIGHBOUR_CSV_FILENAMES, NEIGHBOUR_FILENAMES, neighbourCountText, neighbourSummary, neighbourWhere, neighbourToCsv, neighbourToText, pointText } from "./nearNeighbourCopy.ts";
import type { Point } from "./packGeo.ts";
import { DEFAULT_NEAR_RADIUS, NEAR_RADII, type NearRadius, buildNearGroups } from "./nearGroup.ts";
import { NEAR_CSV_FILENAMES, NEAR_FILENAMES, nearCaveat, nearGroupLine, nearGroupTitle, nearRadiusText, nearSummary, nearToCsv, nearToText } from "./nearCopy.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places in the list, every filter applied. */
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
  /** Called with the middle of a group when the person asks to use it as their point. Omit to hide that button. */
  onUsePoint?: (point: Point) => void;
}

type View = "groups" | "nearest";

/** Which of the listed places lie close together, in groups. Shown on request, and only counts and distances. */
export function NearGroups({ places, locale, onSave = saveTextFile, onUsePoint }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [radius, setRadius] = useState<NearRadius>(DEFAULT_NEAR_RADIUS);
  const [view, setView] = useState<View>("groups");
  const [status, setStatus] = useState("");
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);
  const result = useMemo(() => (open ? buildNearGroups(places, radius) : null), [open, places, radius]);
  const neighbours = useMemo(() => (open && view === "nearest" ? buildNeighbours(places) : null), [open, view, places]);
  if (places.length < 2) return null;

  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };

  const pickPoint = (point: Point) => {
    onUsePoint?.(point);
    setStatus(t(locale, `Your point is now ${pointText(point)}.`, `Votre point est maintenant ${pointText(point, "fr")}.`));
  };

  return (
    <div data-near-groups>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide places close together", "Masquer les lieux proches") : t(locale, "Show which of these places are close together", "Afficher quels lieux sont proches les uns des autres")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open && result ? (
          <>
            <ChoiceGroup
              label={t(locale, "View", "Vue")}
              value={view}
              onChange={(v) => {
                setView(v === "nearest" ? "nearest" : "groups");
                setStatus("");
              }}
              options={[
                { value: "groups", label: t(locale, "Groups of places close together", "Groupes de lieux proches") },
                { value: "nearest", label: t(locale, "The nearest place to each place", "Le lieu le plus proche de chaque lieu") },
              ]}
            />
            {view === "groups" ? (
              <>
                <ChoiceGroup
                  label={t(locale, "Count as close when within", "Compter comme proches à moins de")}
                  value={String(radius)}
                  onChange={(v) => setRadius(NEAR_RADII.find((r) => String(r) === v) ?? DEFAULT_NEAR_RADIUS)}
                  options={NEAR_RADII.map((r) => ({ value: String(r), label: nearRadiusText(r, locale) }))}
                />
                <p>{nearSummary(result, locale)}</p>
                <p>{nearCaveat(locale)}</p>
                {result.groups.map((g) => {
                  const middle = onUsePoint ? groupMiddle(g.ids.flatMap((id) => byId.get(id) ?? [])) : null;
                  return (
                    <div key={g.no}>
                      <h3>{nearGroupTitle(g, locale)}</h3>
                      <p>{nearGroupLine(g, byId, locale)}</p>
                      <ul>
                        {g.ids.map((id, i) => (
                          <li key={id}>{g.names[i] ?? "UNKNOWN"}</li>
                        ))}
                      </ul>
                      {middle ? (
                        <Button variant="quiet" onPress={() => pickPoint(middle)}>
                          {t(locale, `Use the middle of ${nearGroupTitle(g, "en")} as my point`, `Utiliser le milieu du ${nearGroupTitle(g, "fr").toLowerCase()} comme mon point`)}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                {result.aloneIds.length > 0 ? (
                  <div>
                    <h3>{t(locale, "On their own", "Seuls")}</h3>
                    <ul>
                      {result.aloneIds.map((id) => (
                        <li key={id}>{byId.get(id)?.name ?? "UNKNOWN"}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {result.unlocatedIds.length > 0 ? <p>{t(locale, `${result.unlocatedIds.length} without a map point: UNKNOWN.`, `${result.unlocatedIds.length} sans point de carte\u00a0: UNKNOWN.`)}</p> : null}
                <Button variant="secondary" onPress={() => save({ name: NEAR_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: nearToText(result, places, locale) })}>
                  {t(locale, "Save the groups as text (.txt)", "Enregistrer les groupes comme texte (.txt)")}
                </Button>
                <Button variant="secondary" onPress={() => save({ name: NEAR_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: nearToCsv(result, places, locale) })}>
                  {t(locale, "Save the groups as a spreadsheet (CSV)", "Enregistrer les groupes comme tableur (CSV)")}
                </Button>
              </>
            ) : neighbours ? (
              <>
                <p>{neighbourSummary(neighbours, locale)}</p>
                <p>{nearCaveat(locale)}</p>
                {neighbours.located >= 2 ? (
                  <>
                    <ul>
                      {NEAR_RADII.map((r) => (
                        <li key={r}>{neighbourCountText(neighbours, r, locale)}</li>
                      ))}
                    </ul>
                    <table>
                      <caption>{t(locale, "The nearest other place to each place, nearest pairs first", "Le lieu le plus proche de chaque lieu, les paires les plus proches d’abord")}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t(locale, "Place", "Lieu")}</th>
                          <th scope="col">{t(locale, "Nearest place", "Lieu le plus proche")}</th>
                          <th scope="col">{t(locale, "Distance and direction", "Distance et direction")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {neighbours.rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row">{row.name ?? "UNKNOWN"}</th>
                            <td>{row.nearestName ?? "UNKNOWN"}</td>
                            <td>{neighbourWhere(row, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
                <Button variant="secondary" onPress={() => save({ name: NEIGHBOUR_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: neighbourToText(neighbours, NEAR_RADII, locale) })}>
                  {t(locale, "Save the nearest places as text (.txt)", "Enregistrer les lieux les plus proches comme texte (.txt)")}
                </Button>
                <Button variant="secondary" onPress={() => save({ name: NEIGHBOUR_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: neighbourToCsv(neighbours, places, locale) })}>
                  {t(locale, "Save the nearest places as a spreadsheet (CSV)", "Enregistrer les lieux les plus proches comme tableur (CSV)")}
                </Button>
              </>
            ) : null}
            <p role="status">{status}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
