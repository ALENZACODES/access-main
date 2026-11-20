import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { tagValue } from "./placeSheet.ts";
import { DEFAULT_STREET_ORDER, STREET_ORDERS, type StreetOrder, addMany, addManySentence, buildStreetIndex, filterStreets, streetGroupLine, orderLabel, streetCaveat, streetSummary } from "./streetIndex.ts";
import { STREET_CSV_FILENAMES, STREET_TEXT_FILENAMES, streetIndexToCsv, streetIndexToText } from "./streetIndexExport.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
  /** Puts one place on the list. When left out, the street view has no add button. */
  onAdd?: (id: string) => "added" | "already" | "full" | "invalid";
}

const isOrder = (v: string): v is StreetOrder => (STREET_ORDERS as readonly string[]).includes(v);

/** The listed places grouped by street. Shown on request. Reads the address text only; nothing is written or sent. */
export function StreetIndex({ places, locale, onSave = saveTextFile, onAdd }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<StreetOrder>(DEFAULT_STREET_ORDER);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [addNote, setAddNote] = useState("");
  const data = useMemo(() => (open ? buildStreetIndex(places, locale, order) : null), [open, places, locale, order]);
  if (places.length === 0) return null;

  const found = data === null ? [] : filterStreets(data.groups, find);
  const shown = sharedOnly ? found.filter((g) => g.entries.length >= 2) : found;
  // A street that is no longer in the list (the filter changed) is dropped rather than shown empty.
  const group = picked === null ? null : (shown.find((g) => g.key === picked) ?? null);

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
    <div data-street-index>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide places by street", "Masquer les lieux par rue") : t(locale, "Show these places by street", "Afficher ces lieux par rue")}
      </Button>
      <div id={panelId} hidden={!open}>
        {data ? (
          <>
            {streetSummary(data, locale).map((s) => (
              <p key={s}>{s}</p>
            ))}
            <p>{streetCaveat(locale)}</p>
            <ChoiceGroup
              label={t(locale, "Order the streets by", "Classer les rues par")}
              value={order}
              onChange={(v) => {
                if (isOrder(v)) setOrder(v);
              }}
              options={STREET_ORDERS.map((o) => ({ value: o, label: orderLabel(o, locale) }))}
            />
            <TextInput label={t(locale, "Find a street", "Trouver une rue")} value={find} onChange={setFind} />
            <CheckField label={t(locale, "Only streets with two or more places", "Seulement les rues de deux lieux ou plus")} isSelected={sharedOnly} onChange={setSharedOnly} />
            {shown.length === 0 ? (
              <p>{find.trim() !== "" ? t(locale, "No street matches what you typed.", "Aucune rue ne correspond à ce que vous avez saisi.") : t(locale, "No street has two or more listed places.", "Aucune rue ne compte deux lieux ou plus dans la liste.")}</p>
            ) : (
              <table>
                <caption>{t(locale, "Streets with the number of listed places on each", "Rues avec le nombre de lieux de la liste sur chacune")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t(locale, "Street", "Rue")}</th>
                    <th scope="col">{t(locale, "Places", "Lieux")}</th>
                    <th scope="col">{t(locale, "Wheelchair tag UNKNOWN", "Étiquette fauteuil roulant UNKNOWN")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <tr key={g.key}>
                      <th scope="row">
                        <Button variant="quiet" aria-pressed={picked === g.key} onPress={() => {
                            setPicked(picked === g.key ? null : g.key);
                            setAddNote("");
                          }}>
                          {g.name}
                        </Button>
                      </th>
                      <td>{g.entries.length}</td>
                      <td>{g.unknownCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {group ? (
              <section aria-labelledby={`${panelId}-street`}>
                <h3 id={`${panelId}-street`}>{streetGroupLine(group, locale)}</h3>
                <table>
                  <caption>{t(locale, `Listed places on ${group.name}, by house number`, `Lieux de la liste sur ${group.name}, par numéro civique`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(locale, "Number", "Numéro")}</th>
                      <th scope="col">{t(locale, "Place", "Lieu")}</th>
                      <th scope="col">{t(locale, "Wheelchair tag", "Étiquette fauteuil roulant")}</th>
                      <th scope="col">{t(locale, "Address as given", "Adresse telle que donnée")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{e.number ?? "UNKNOWN"}</td>
                        <th scope="row">{e.name ?? "UNKNOWN"}</th>
                        <td>{tagValue(e.tag, locale)}</td>
                        <td>{e.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {group.sameAddressIds.length > 0 ? <p>{t(locale, `Same number and street for ${group.sameAddressIds.length} places here.`, `Même numéro et même rue pour ${group.sameAddressIds.length} lieux ici.`)}</p> : null}
                {onAdd ? (
                  <Button variant="secondary" onPress={() => setAddNote(addManySentence(addMany(group.entries.map((e) => e.id), onAdd), group.name, locale))}>
                    {t(locale, `Add the ${group.entries.length} ${group.entries.length === 1 ? "place" : "places"} on this street to my list`, `Ajouter à ma liste ${group.entries.length === 1 ? "le lieu" : `les ${group.entries.length} lieux`} de cette rue`)}
                  </Button>
                ) : null}
                <p aria-live="polite" data-street-index-add>
                  {addNote}
                </p>
                <Button variant="secondary" onPress={() => save({ name: STREET_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: streetIndexToText(data, locale, [group.key]) })}>
                  {t(locale, "Save this street as text (.txt)", "Enregistrer cette rue comme texte (.txt)")}
                </Button>
              </section>
            ) : null}
            <Button variant="secondary" onPress={() => save({ name: STREET_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: streetIndexToText(data, locale) })}>
              {t(locale, "Save all streets as text (.txt)", "Enregistrer toutes les rues comme texte (.txt)")}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: STREET_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: streetIndexToCsv(data, locale) })}>
              {t(locale, "Save all streets as a spreadsheet (CSV)", "Enregistrer toutes les rues comme tableur (CSV)")}
            </Button>
            <p aria-live="polite" data-street-index-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
