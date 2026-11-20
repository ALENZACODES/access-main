import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { buildDistanceMatrix, cellText, matrixCaveat, matrixSummary } from "./placeMatrix.ts";
import { MATRIX_CSV_FILENAMES, MATRIX_TEXT_FILENAMES, matrixToCsv, matrixToText } from "./placeMatrixExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/** The listed places measured against one another. Shown on request, for two places or more. */
export function DistanceMatrix({ places, locale, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const matrix = useMemo(() => (open && places.length >= 2 ? buildDistanceMatrix(places) : null), [open, places]);
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

  return (
    <div data-distance-matrix>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide distances between places", "Masquer les distances entre les lieux") : t(locale, "Show distances between these places", "Afficher les distances entre ces lieux")}
      </Button>
      <div id={panelId} hidden={!open}>
        {matrix ? (
          <>
            {matrixSummary(matrix, locale).map((s) => (
              <p key={s}>{s}</p>
            ))}
            <p>{matrixCaveat(locale)}</p>
            <table>
              <caption>{t(locale, "Straight-line distance and direction between each pair of listed places", "Distance en ligne droite et direction entre chaque paire de lieux de la liste")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t(locale, "From", "De")}</th>
                  {matrix.places.map((p) => (
                    <th key={p.id} scope="col">
                      {p.name ?? "UNKNOWN"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.places.map((p, i) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name ?? "UNKNOWN"}</th>
                    {matrix.cells[i]!.map((c) => (
                      <td key={c.toId}>{cellText(c, locale)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="secondary" onPress={() => save({ name: MATRIX_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: matrixToText(matrix, locale) })}>
              {t(locale, "Save the distances as text (.txt)", "Enregistrer les distances comme texte (.txt)")}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: MATRIX_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: matrixToCsv(matrix, locale) })}>
              {t(locale, "Save the distances as a spreadsheet (CSV)", "Enregistrer les distances comme tableur (CSV)")}
            </Button>
            <p aria-live="polite" data-distance-matrix-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
