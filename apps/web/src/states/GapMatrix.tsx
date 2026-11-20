import { useId, useState } from "react";
import { Button } from "../design/Button.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { buildGapMatrix, cellWord, gapSentence } from "./gapMatrix.ts";
import { GAP_CSV_FILENAMES, gapMatrixToCsv } from "./gapMatrixExport.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  today: string;
  onSave?: (file: SavedFile) => boolean;
}

/** The listed places against the nine details, side by side. Shown on request, for two places or more. */
export function GapMatrix({ places, locale, today, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  if (places.length < 2) return null;
  const matrix = open ? buildGapMatrix(places, locale, today) : null;
  const save = () => {
    let ok = false;
    try {
      ok = onSave({ name: GAP_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: gapMatrixToCsv(buildGapMatrix(places, locale, today), locale) });
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${GAP_CSV_FILENAMES[locale]}.`, `Fichier ${GAP_CSV_FILENAMES[locale]} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };
  return (
    <div data-gap-matrix>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide the gaps grid", "Masquer la grille des lacunes") : t(locale, "Show the gaps grid", "Afficher la grille des lacunes")}
      </Button>
      <div id={panelId} hidden={!open}>
        {matrix ? (
          <>
            <p>{gapSentence(matrix, locale)}</p>
            <div>
              <table>
                <caption>{t(locale, "Details the pack gives for each listed place", "Détails que le pack donne pour chaque lieu de la liste")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t(locale, "Place", "Lieu")}</th>
                    {matrix.columns.map((c) => (
                      <th key={c.field} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">{r.title}</th>
                      {r.cells.map((c) => (
                        <td key={c.field} data-known={c.known ? "true" : "false"}>
                          {cellWord(c, locale)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="secondary" onPress={save}>
              {t(locale, "Save the grid as a spreadsheet (CSV)", "Enregistrer la grille comme tableur (CSV)")}
            </Button>
            <p aria-live="polite" data-gap-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
