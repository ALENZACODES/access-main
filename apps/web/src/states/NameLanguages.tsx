import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import {
  nlAccentLine, nlAddressLine, nlCannotSave, nlKindColumn, nlKindColumnShort, nlKindTableHeading, nlKindsMore, nlSaveKinds, NL_KINDS_CSV_NAME, nlDiffersLine, nlKindsLine, nlCaveat, nlCoverage, nlFilterGroup, nlFilterLabel, nlHeading, nlIntro, nlMoreLine, nlNoMatch, nlNoName, nlOrderGroup, nlOrderLabel, nlPairLine, nlReadingLabel, nlRowLine, nlSaveCsv, nlSaveText, nlSavedLine, nlSummary,
  nlTallyLine, nlToggle,
} from "./nameLanguageCopy.ts";
import { namesCsvFile, namesTextFile } from "./nameLanguageExport.ts";
import {
  DEFAULT_NAME_ORDER, NAME_FILTERS, kindsFor, NAME_ORDERS, buildNameReport, filterNames, isNameFilter, isNameOrder, orderNames, sharesOf, type NameFilter, type NameOrder,
} from "./nameLanguageReport.ts";
import { NAME_READINGS } from "./nameLanguage.ts";
import { KIND_COLUMNS, nameKindsCsvFile, summariseNameKinds, topKinds } from "./nameLanguageKinds.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

/** Places listed at once; the saved files hold every one that matches the choice. */
export const NAME_LANGUAGES_SHOWN = 20;
/** Kinds in the table at once; the saved file holds every kind. */
export const NAME_KINDS_SHOWN = 8;

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * Shows which places have names with everyday French or English words in them. It is a guess from common words and
 * says so; it never says what language a name is in and never changes a name. Closed until asked for.
 */
export function NameLanguages({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NameFilter>("all");
  const [order, setOrder] = useState<NameOrder>(DEFAULT_NAME_ORDER);
  const [status, setStatus] = useState("");

  const report = useMemo(() => (open ? buildNameReport(places) : null), [open, places]);
  const listed = useMemo(() => (report ? orderNames(filterNames(report.rows, filter), order) : []), [report, filter, order]);
  const kinds = useMemo(() => (report ? summariseNameKinds(report.rows) : []), [report]);
  const shares = useMemo(() => (report ? sharesOf(report) : null), [report]);
  if (!places.some((p) => p.name !== null)) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? nlSavedLine(file.name, locale) : nlCannotSave(locale));
  };

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-name-languages>
      <p id={headingId}>
        <strong>{nlHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {nlToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-name-languages-body>
        {open && report && shares ? (
          <>
            <p>{nlIntro(locale)}</p>
            <p>{nlCoverage(report.named, report.byReading["no-name"], locale)}</p>
            <p aria-live="polite">{nlSummary(report, locale)}</p>
            <ul data-name-languages-tally>
              {NAME_READINGS.filter((r) => r !== "no-name" && report.byReading[r] > 0).map((r) => (
                <li key={r}>
                  {nlTallyLine(r, report.byReading[r], shares[r], locale)}
                  {r === "french" || r === "english" ? (nlKindsLine(kindsFor(report.rows, r), locale) ? ` ${nlKindsLine(kindsFor(report.rows, r), locale)}` : "") : ""}
                </li>
              ))}
            </ul>
            {nlAccentLine(report.accentedOnly, locale) ? <p>{nlAccentLine(report.accentedOnly, locale)}</p> : null}
            {nlDiffersLine(report.byMatch.differs, locale) ? <p>{nlDiffersLine(report.byMatch.differs, locale)}</p> : null}
            {nlPairLine(report.pairs, locale) ? <p>{nlPairLine(report.pairs, locale)}</p> : null}
            {report.named > 0 ? (
              <>
                <table data-name-languages-kinds>
                  <caption>{nlKindTableHeading(locale)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{nlKindColumn("kind", locale)}</th>
                      <th scope="col">{nlKindColumn("total", locale)}</th>
                      {KIND_COLUMNS.map((c) => (
                        <th key={c} scope="col">
                          {nlKindColumnShort(c, locale)}
                        </th>
                      ))}
                      <th scope="col">{nlKindColumn("differs", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topKinds(kinds, NAME_KINDS_SHOWN).shown.map((k) => (
                      <tr key={k.kind}>
                        <th scope="row">{k.kind}</th>
                        <td>{k.total}</td>
                        {KIND_COLUMNS.map((c) => (
                          <td key={c}>{k.byReading[c]}</td>
                        ))}
                        <td>{k.differs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {nlKindsMore(topKinds(kinds, NAME_KINDS_SHOWN).more, locale) ? <p>{nlKindsMore(topKinds(kinds, NAME_KINDS_SHOWN).more, locale)}</p> : null}
                <Button variant="secondary" onPress={() => save(nameKindsCsvFile(kinds, NL_KINDS_CSV_NAME[locale]))}>
                  {nlSaveKinds(locale)}
                </Button>
                <ChoiceGroup
                  label={nlFilterGroup(locale)}
                  value={filter}
                  onChange={(v) => {
                    if (isNameFilter(v)) setFilter(v);
                  }}
                  options={NAME_FILTERS.map((f) => ({ value: f, label: nlFilterLabel(f, locale) }))}
                />
                <ChoiceGroup
                  label={nlOrderGroup(locale)}
                  value={order}
                  onChange={(v) => {
                    if (isNameOrder(v)) setOrder(v);
                  }}
                  options={NAME_ORDERS.map((o) => ({ value: o, label: nlOrderLabel(o, locale) }))}
                />
                {listed.length === 0 ? (
                  <p>{nlNoMatch(locale)}</p>
                ) : (
                  <>
                    <ul data-name-languages-list>
                      {listed.slice(0, NAME_LANGUAGES_SHOWN).map((r) => (
                        <li key={r.id}>
                          <strong>{r.name ?? nlNoName(locale)}</strong>
                          <br />
                          <small>{r.language.french.length > 0 || r.language.english.length > 0 ? nlRowLine(r.language, locale) : nlReadingLabel(r.language.reading, locale)}</small>
                          <br />
                          <small data-name-languages-address>{nlAddressLine(r.addressLanguage.reading, r.address, locale)}</small>
                        </li>
                      ))}
                    </ul>
                    {listed.length > NAME_LANGUAGES_SHOWN ? <p>{nlMoreLine(listed.length - NAME_LANGUAGES_SHOWN, locale)}</p> : null}
                    <p>{nlCaveat(locale)}</p>
                    <div className="row">
                      <Button variant="secondary" onPress={() => save(namesTextFile(listed, locale))}>
                        {nlSaveText(locale)}
                      </Button>
                      <Button variant="secondary" onPress={() => save(namesCsvFile(listed, locale))}>
                        {nlSaveCsv(locale)}
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : null}
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
