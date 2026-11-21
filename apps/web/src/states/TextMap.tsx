import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { Point } from "./packGeo.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { DEFAULT_GRID, GRID_SIZES, type GridSize, buildAround, buildTextMap, cellSentence, directionLine, gridCaveat, gridSummary, straightLineCaveat, tagMix } from "./textMap.ts";
import { TEXT_MAP_CSV_FILENAMES, TEXT_MAP_FILENAMES, aroundToCsv, aroundToText, textMapToCsv, textMapToText } from "./textMapExport.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places in the list, every filter applied. */
  places: readonly PackPlaceRecord[];
  /** The point the person typed, or null. Directions need one. */
  from: Point | null;
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

type Mode = "grid" | "around";

/** A map in words: a grid of where the listed places lie, and which way each is from a typed point. Shown on request. */
export function TextMap({ places, from, locale, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("grid");
  const [size, setSize] = useState<GridSize>(DEFAULT_GRID);
  const [status, setStatus] = useState("");
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);
  const map = useMemo(() => (open ? buildTextMap(places, size, locale) : null), [open, places, size, locale]);
  const around = useMemo(() => (open && from !== null ? buildAround(places, from, locale) : null), [open, places, from, locale]);
  if (places.length === 0) return null;
  const activeMode: Mode = mode === "around" && from === null ? "grid" : mode;

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
    <div data-text-map>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide the text map", "Masquer la carte en texte") : t(locale, "Show a text map of these places", "Afficher une carte en texte de ces lieux")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open && map ? (
          <>
            <ChoiceGroup
              label={t(locale, "View", "Vue")}
              value={activeMode}
              onChange={(v) => setMode(v === "around" ? "around" : "grid")}
              options={[
                { value: "grid", label: t(locale, "A grid of these places", "Une grille de ces lieux") },
                { value: "around", label: t(locale, "Which way from my point", "Dans quelle direction depuis mon point") },
              ]}
            />
            {from === null ? <p>{t(locale, "To see directions, type a point in the distance fields above.", "Pour voir les directions, saisissez un point dans les champs de distance ci-dessus.")}</p> : null}
            {activeMode === "grid" ? (
              <>
                <ChoiceGroup
                  label={t(locale, "Grid size", "Taille de la grille")}
                  value={String(size)}
                  onChange={(v) => setSize(GRID_SIZES.find((s) => String(s) === v) ?? DEFAULT_GRID)}
                  options={GRID_SIZES.map((s) => ({ value: String(s), label: `${s} × ${s}` }))}
                />
                <p>{gridSummary(map, locale)}</p>
                <p>{gridCaveat(locale)}</p>
                <table>
                  <caption>{t(locale, "Places by part of the area, north at the top", "Lieux par partie de la zone, le nord en haut")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(locale, "Area", "Zone")}</th>
                      {map.colLabels.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {map.cells.map((row, r) => (
                      <tr key={map.rowLabels[r]}>
                        <th scope="row">{map.rowLabels[r]}</th>
                        {row.map((cell) => (
                          <td key={cell.col}>{cellSentence(cell.placeIds.length, tagMix(cell.placeIds.flatMap((id) => byId.get(id) ?? []), locale), locale)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {map.cells.flat().filter((c) => c.placeIds.length > 0).map((cell) => (
                  <div key={cell.label}>
                    <h3>{cell.label}</h3>
                    <ul>
                      {cell.placeIds.map((id, i) => (
                        <li key={id}>{cell.names[i] ?? "UNKNOWN"}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <Button variant="secondary" onPress={() => save({ name: TEXT_MAP_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: textMapToText(map, locale) })}>
                  {t(locale, "Save the grid as text (.txt)", "Enregistrer la grille comme texte (.txt)")}
                </Button>
                <Button variant="secondary" onPress={() => save({ name: TEXT_MAP_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: textMapToCsv(map, places, locale) })}>
                  {t(locale, "Save the grid as a spreadsheet (CSV)", "Enregistrer la grille comme tableur (CSV)")}
                </Button>
              </>
            ) : around && from ? (
              <>
                <p>{straightLineCaveat(locale)}</p>
                {around.here.length > 0 ? (
                  <div>
                    <h3>{t(locale, "Here", "Ici")}</h3>
                    <ul>
                      {around.here.map((l) => (
                        <li key={l.id}>{directionLine(l, locale)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {around.sectors.filter((s) => s.places.length > 0).map((s) => (
                  <div key={s.compass}>
                    <h3>{`${s.name.charAt(0).toUpperCase()}${s.name.slice(1)}`}</h3>
                    <ul>
                      {s.places.map((l) => (
                        <li key={l.id}>{directionLine(l, locale)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {around.unlocatedIds.length > 0 ? (
                  <p>{t(locale, `${around.unlocatedIds.length} without a map point: direction and distance UNKNOWN.`, `${around.unlocatedIds.length} sans point de carte\u00a0: direction et distance UNKNOWN.`)}</p>
                ) : null}
                <Button variant="secondary" onPress={() => save({ name: TEXT_MAP_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: aroundToText(around, locale) })}>
                  {t(locale, "Save the directions as text (.txt)", "Enregistrer les directions comme texte (.txt)")}
                </Button>
                <Button variant="secondary" onPress={() => save({ name: TEXT_MAP_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: aroundToCsv(places, from, locale) })}>
                  {t(locale, "Save the directions as a spreadsheet (CSV)", "Enregistrer les directions comme tableur (CSV)")}
                </Button>
              </>
            ) : null}
            <p aria-live="polite" data-text-map-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
