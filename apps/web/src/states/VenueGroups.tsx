import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { tagValue } from "./placeSheet.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import { VENUE_CSV_FILENAMES, VENUE_TEXT_FILENAMES, venuesToCsv, venuesToText } from "./venueExport.ts";
import { DEFAULT_VENUE_ORDER, VENUE_ORDERS, type VenueOrder, buildVenueGroups, filterVenues, groupHeading, kindSentence, kindTagRows, memberDistance, orderVenues, spanSentence, TAG_COLUMNS, venueCaveat, venueOrderLabel, venuePartLabel, venueSummary } from "./venueGroups.ts";
import { PART_KINDS, type PartKind } from "./venueName.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/** The listed places grouped into venues by their names. Shown on request. Reads names and map points only; nothing is written or sent. */
export function VenueGroups({ places, locale, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [differOnly, setDifferOnly] = useState(false);
  const [find, setFind] = useState("");
  const [order, setOrder] = useState<VenueOrder>(DEFAULT_VENUE_ORDER);
  const [kinds, setKinds] = useState<readonly PartKind[]>([]);
  const [status, setStatus] = useState("");
  const data = useMemo(() => (open ? buildVenueGroups(places) : null), [open, places]);
  if (places.length < 2) return null;

  const shown = data === null ? [] : orderVenues(filterVenues(data.groups, { query: find, kinds, differOnly }), order, locale);
  const filtering = find.trim() !== "" || kinds.length > 0 || differOnly;
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
    <div data-venue-groups>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide venues by name", "Masquer les lieux par nom") : t(locale, "Show these places grouped into venues", "Afficher ces lieux regroupés par lieu")}
      </Button>
      <div id={panelId} hidden={!open}>
        {data ? (
          <>
            {venueSummary(data, locale).map((s) => (
              <p key={s}>{s}</p>
            ))}
            <p>{venueCaveat(locale)}</p>
            {data.groups.length > 0 ? (
              <>
                {kindSentence(data.groups, locale) ? <p>{kindSentence(data.groups, locale)}</p> : null}
                <TextInput label={t(locale, "Find a venue", "Trouver un lieu")} value={find} onChange={setFind} />
                <ChoiceGroup
                  label={t(locale, "Order the venues by", "Classer les lieux par")}
                  value={order}
                  onChange={(v) => {
                    if ((VENUE_ORDERS as readonly string[]).includes(v)) setOrder(v as VenueOrder);
                  }}
                  options={VENUE_ORDERS.map((o) => ({ value: o, label: venueOrderLabel(o, locale) }))}
                />
                {PART_KINDS.filter((k) => k !== "main").map((k) => (
                  <CheckField key={k} label={t(locale, `Lists ${/^[aeiou]/i.test(venuePartLabel(k, "en")) ? "an" : "a"} ${venuePartLabel(k, "en").toLowerCase()}`, `Nomme ${k === "entrance" || k === "ramp" ? "une" : "un"} ${venuePartLabel(k, "fr").toLowerCase()}`)} isSelected={kinds.includes(k)} onChange={(on) => setKinds((cur) => (on ? [...cur.filter((x) => x !== k), k] : cur.filter((x) => x !== k)))} />
                ))}
                <CheckField label={t(locale, "Only venues whose parts have different wheelchair tags", "Seulement les lieux dont les parties ont des étiquettes fauteuil roulant différentes")} isSelected={differOnly} onChange={setDifferOnly} />
              </>
            ) : null}
            {shown.length > 0 ? (
              <table>
                <caption>{t(locale, "Parts of the venues shown, by kind and the wheelchair tag the pack gives each", "Parties des lieux affichés, par type et selon l’étiquette fauteuil roulant donnée par le pack")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t(locale, "Kind of part", "Type de partie")}</th>
                    {TAG_COLUMNS.map((c) => (
                      <th key={c} scope="col">
                        {tagValue(c, locale)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kindTagRows(shown).map((r) => (
                    <tr key={r.kind}>
                      <th scope="row">{venuePartLabel(r.kind, locale)}</th>
                      {TAG_COLUMNS.map((c) => (
                        <td key={c}>{r.counts[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {shown.map((g) => (
              <section key={`${g.key}-${g.members[0]!.id}`} aria-label={groupHeading(g, locale)}>
                <h3>{groupHeading(g, locale)}</h3>
                <table>
                  <caption>{t(locale, `Parts of ${g.label} with the wheelchair tag the pack gives each`, `Parties de ${g.label} avec l’étiquette fauteuil roulant donnée par le pack`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(locale, "Part", "Partie")}</th>
                      <th scope="col">{t(locale, "Place", "Nom")}</th>
                      <th scope="col">{t(locale, "Wheelchair tag", "Étiquette fauteuil roulant")}</th>
                      <th scope="col">{t(locale, "Straight line from the first", "Ligne droite depuis la première")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.members.map((m) => (
                      <tr key={m.id}>
                        <th scope="row">{venuePartLabel(m.kind, locale)}</th>
                        <td>{m.name ?? "UNKNOWN"}</td>
                        <td>{tagValue(m.tag, locale)}</td>
                        <td>{memberDistance(m, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {spanSentence(g, locale) ? <p>{spanSentence(g, locale)}</p> : null}
                <Button variant="quiet" onPress={() => save({ name: VENUE_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: venuesToText(data, locale, [g]) })}>
                  {t(locale, `Save ${g.label} as text (.txt)`, `Enregistrer ${g.label} comme texte (.txt)`)}
                </Button>
                {g.members.some((m) => m.basis === "name") ? <p>{t(locale, "Some parts are joined by name only, because they have no map point.", "Certaines parties sont jointes par le nom seulement, faute de point de carte.")}</p> : null}
              </section>
            ))}
            {data.groups.length > 0 && shown.length === 0 ? <p>{differOnly && !find.trim() && kinds.length === 0 ? t(locale, "Every venue's parts have the same wheelchair tag.", "Les parties de chaque lieu ont la même étiquette fauteuil roulant.") : t(locale, "No venue matches the choices above.", "Aucun lieu ne correspond aux choix ci-dessus.")}</p> : null}
            {filtering && shown.length > 0 ? <p>{t(locale, `${shown.length} of ${data.groups.length} ${data.groups.length === 1 ? "venue" : "venues"} shown.`, `${shown.length} lieux sur ${data.groups.length} affichés.`)}</p> : null}
            {data.groups.length > 0 ? (
              <>
                <Button variant="secondary" onPress={() => save({ name: VENUE_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: venuesToText(data, locale, shown) })}>
                  {t(locale, "Save the venues as text (.txt)", "Enregistrer les lieux comme texte (.txt)")}
                </Button>
                <Button variant="secondary" onPress={() => save({ name: VENUE_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: venuesToCsv(data, locale) })}>
                  {t(locale, "Save the venues as a spreadsheet (CSV)", "Enregistrer les lieux comme tableur (CSV)")}
                </Button>
              </>
            ) : null}
            <p aria-live="polite" data-venue-groups-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
