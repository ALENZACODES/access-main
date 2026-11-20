import { useState } from "react";
import { Button } from "../design/Button.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { GPX_FILENAMES, VCARDS_FILENAMES, placesToGpx, placesToVcards } from "./placeSheetExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/** Save the listed places as contact cards or as GPX waypoints, made on this device. Nothing here ranks or orders the places. */
export function ShortlistFiles({ places, locale, onSave = saveTextFile }: Props) {
  const [status, setStatus] = useState("");
  if (places.length === 0) return null;
  const located = places.filter((p) => p.location !== null).length;
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
    <div className="stack" role="group" aria-label={t(locale, "Take the list along", "Emporter la liste")} data-shortlist-files>
      <Button variant="secondary" onPress={() => save({ name: VCARDS_FILENAMES[locale], mime: "text/vcard;charset=utf-8", content: placesToVcards(places, locale) })}>
        {t(locale, "Save the list as contact cards (.vcf)", "Enregistrer la liste comme fiches de contact (.vcf)")}
      </Button>
      {located > 0 ? (
        <Button variant="secondary" onPress={() => save({ name: GPX_FILENAMES[locale], mime: "application/gpx+xml;charset=utf-8", content: placesToGpx(places, locale) })}>
          {t(locale, `Save the list as waypoints (GPX, ${located} with a map point)`, `Enregistrer la liste comme points de passage (GPX, ${located} avec un point de carte)`)}
        </Button>
      ) : (
        <p>{t(locale, "None of the listed places has a map point, so there are no waypoints to save.", "Aucun lieu de la liste n’a de point de carte\u00a0: il n’y a donc aucun point de passage à enregistrer.")}</p>
      )}
      <p aria-live="polite" data-shortlist-files-status>
        {status}
      </p>
    </div>
  );
}
