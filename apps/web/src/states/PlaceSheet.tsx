import { useId, useState } from "react";
import { Button } from "../design/Button.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { buildPlaceSheet, sheetSummary } from "./placeSheet.ts";
import { DEFAULT_HANDOUT, HANDOUT_FILENAMES, buildHandout } from "./handout.ts";
import { handoutToHtml } from "./handoutHtml.ts";
import { TEXT_FILENAMES, placeSheetToText } from "./placeSheetText.ts";
import { GPX_FILENAMES, VCARD_FILENAMES, placeToVcard, placesToGpx } from "./placeSheetExport.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  place: PackPlaceRecord;
  locale: Locale;
  today: string;
  /** Hands a file to the browser to save; returns false when it cannot. */
  onSave?: (file: SavedFile) => boolean;
}

/**
 * "Details and gaps" for one place: everything the pack gives, field by field, with UNKNOWN and
 * its reason where it gives nothing, and ways to take the place along (the person's own maps app,
 * a contact card, a GPX waypoint). The count of recorded details is not a rating.
 */
export function PlaceSheet({ place, locale, today, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const sheet = open ? buildPlaceSheet(place, locale, today) : null;

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
    <div data-place-sheet={place.id}>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide details and gaps", "Masquer les détails et les lacunes") : t(locale, "Details and gaps", "Détails et lacunes")}
      </Button>
      <div id={panelId} hidden={!open}>
        {sheet ? (
          <>
            <p>{sheetSummary(sheet, locale)}</p>
            {sheet.staleNotice ? <p>{sheet.staleNotice}</p> : null}
            <table>
              <caption>{t(locale, `What the pack gives for ${sheet.title}`, `Ce que le pack donne pour ${sheet.title}`)}</caption>
              <thead>
                <tr>
                  <th scope="col">{t(locale, "Detail", "Détail")}</th>
                  <th scope="col">{t(locale, "Value", "Valeur")}</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.field} data-known={row.known ? "true" : "false"}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {row.value}
                      {row.reason ? <span> {row.reason}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="stack" role="group" aria-label={t(locale, `Take ${sheet.title} along`, `Emporter ${sheet.title}`)}>
              {sheet.geoHref ? (
                <a className="btn btn-secondary" href={sheet.geoHref}>
                  {t(locale, "Open in your maps app", "Ouvrir dans votre application de cartes")}
                </a>
              ) : (
                <p>{t(locale, "No map point, so there is no map link. Its position is UNKNOWN.", "Aucun point de carte, donc aucun lien de carte. Sa position est UNKNOWN.")}</p>
              )}
              <Button variant="secondary" onPress={() => save({ name: VCARD_FILENAMES[locale], mime: "text/vcard;charset=utf-8", content: placeToVcard(place, locale) })}>
                {t(locale, "Save as a contact card (.vcf)", "Enregistrer comme fiche de contact (.vcf)")}
              </Button>
              <Button variant="secondary" onPress={() => save({ name: TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: placeSheetToText(sheet, locale) })}>
                {t(locale, "Save the details as text (.txt)", "Enregistrer les détails comme texte (.txt)")}
              </Button>
              <Button variant="secondary" onPress={() => save({ name: HANDOUT_FILENAMES[locale], mime: "text/html;charset=utf-8", content: handoutToHtml(buildHandout([place], locale, today, DEFAULT_HANDOUT)) })}>
                {t(locale, "Save a large-print page (.html)", "Enregistrer une page en gros caractères (.html)")}
              </Button>
              {sheet.geoHref ? (
                <Button variant="secondary" onPress={() => save({ name: GPX_FILENAMES[locale], mime: "application/gpx+xml;charset=utf-8", content: placesToGpx([place], locale) })}>
                  {t(locale, "Save as a waypoint (GPX)", "Enregistrer comme point de passage (GPX)")}
                </Button>
              ) : null}
            </div>
            <p aria-live="polite" data-sheet-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
