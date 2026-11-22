import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { hintText, hintsFor } from "./noteHints.ts";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import {
  readingBandLabel, filterGroupLabel, readingFilterLabel, orderGroupLabel, readingOrderLabel, readAverageLine, readCannotSave, readColumns, readCoverageLine, readHeading, readIntro, readLongSentencesLine, readLongWordsLine, readNoMatch, readNoName, readNoNotes,
  readOtherLanguageLine, readSaveCsv, readSaveText, readSavedLine, readShownLine, readTableCaption, readToggle, readTooShortLine, readWithoutLine,
} from "./noteReadabilityCopy.ts";
import { readingCsvFile, readingTextFile } from "./noteReadabilityExport.ts";
import { DEFAULT_READING_ORDER, READING_FILTERS, READING_ORDERS, buildReadingIndex, filterReadings, isReadingFilter, isReadingOrder, orderReadings, type ReadingFilter, type ReadingOrder } from "./noteReadabilityIndex.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

/** Rows listed at once; the rest are counted, never hidden without saying so. */
export const READING_ROWS_SHOWN = 25;

function HintList({ note, locale }: { note: string; locale: Locale }) {
  const hints = hintsFor(note, locale).filter((h) => h.kind !== "long-word" && h.kind !== "long-sentence");
  if (hints.length === 0) return null;
  return (
    <ul data-note-hints>
      {hints.map((h, i) => (
        <li key={`${h.kind}-${i}`} lang={locale}>
          {hintText(h, locale)}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * A rough reading score for the note of each place shown, from sentence and word length. It says how
 * easily a note reads, never whether it is right. Closed until asked for; files are made on this device.
 */
export function NoteReading({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ReadingFilter>("all");
  const [order, setOrder] = useState<ReadingOrder>(DEFAULT_READING_ORDER);
  const [status, setStatus] = useState("");

  const index = useMemo(() => buildReadingIndex(places, locale), [places, locale]);
  const listed = useMemo(() => orderReadings(filterReadings(index.entries, filter), order), [index, filter, order]);
  if (index.withNote === 0) return null;

  const shown = listed.slice(0, READING_ROWS_SHOWN);
  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? readSavedLine(file.name, locale) : readCannotSave(locale));
  };
  const cols = readColumns(locale);
  const facts = [readCoverageLine(index.scored, index.withNote, locale), readTooShortLine(index.tooShort, locale), readWithoutLine(index.withoutNote, locale), readOtherLanguageLine(index.otherLanguage, locale), readAverageLine(index.averageScore, locale)].filter((x) => x !== "");

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-note-reading>
      <p id={headingId}>
        <strong>{readHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {readToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-note-reading-body>
        {open ? (
          <>
            <p>{readIntro(locale)}</p>
            {facts.map((f) => (
              <p key={f}>{f}</p>
            ))}
            <ChoiceGroup
              label={filterGroupLabel(locale)}
              value={filter}
              onChange={(v) => {
                if (isReadingFilter(v)) setFilter(v);
              }}
              options={READING_FILTERS.map((f) => ({ value: f, label: readingFilterLabel(f, locale) }))}
            />
            <ChoiceGroup
              label={orderGroupLabel(locale)}
              value={order}
              onChange={(v) => {
                if (isReadingOrder(v)) setOrder(v);
              }}
              options={READING_ORDERS.map((o) => ({ value: o, label: readingOrderLabel(o, locale) }))}
            />
            {index.scored === 0 ? (
              <p>{readNoNotes(locale)}</p>
            ) : listed.length === 0 ? (
              <p>{readNoMatch(locale)}</p>
            ) : (
              <>
                <p aria-live="polite">{readShownLine(shown.length, listed.length, locale)}</p>
                <table data-note-reading-table>
                  <caption>{readTableCaption(locale)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{cols.place}</th>
                      <th scope="col">{cols.score}</th>
                      <th scope="col">{cols.band}</th>
                      <th scope="col">{cols.words}</th>
                      <th scope="col">{cols.sentence}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.id}>
                        <th scope="row">{e.name ?? readNoName(locale)}</th>
                        <td>{e.reading.score}</td>
                        <td>{readingBandLabel(e.reading.band!, locale)}</td>
                        <td>{e.reading.words}</td>
                        <td>{Math.round(e.reading.wordsPerSentence * 10) / 10}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul data-note-reading-notes>
                  {shown.map((e) => (
                    <li key={e.id}>
                      <strong>{e.name ?? readNoName(locale)}</strong>
                      <br />
                      <span data-note-as-written>{e.note}</span>
                      {readLongWordsLine(e.reading.longWords, locale) ? (
                        <>
                          <br />
                          <small>{readLongWordsLine(e.reading.longWords, locale)}</small>
                        </>
                      ) : null}
                      {readLongSentencesLine(e.reading.longSentences.length, locale) ? (
                        <>
                          <br />
                          <small>{readLongSentencesLine(e.reading.longSentences.length, locale)}</small>
                        </>
                      ) : null}
                      <HintList note={e.note} locale={e.reading.locale} />
                    </li>
                  ))}
                </ul>
                <div className="row">
                  <Button variant="secondary" onPress={() => save(readingTextFile(listed, locale))}>
                    {readSaveText(locale)}
                  </Button>
                  <Button variant="secondary" onPress={() => save(readingCsvFile(listed, locale))}>
                    {readSaveCsv(locale)}
                  </Button>
                </div>
              </>
            )}
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
