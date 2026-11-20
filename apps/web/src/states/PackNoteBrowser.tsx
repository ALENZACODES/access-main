import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup, TextInput } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import {
  charsPhrase, coverageSentence, duplicatesHeading, lengthLabel, lengthWord, noMatchSentence, noteNoName, noteAsWritten, noteHeading, noteIntro, noteToggle, orderLabelFor, repeatedLabel,
  repeatedOnlyLabel, searchHelp, searchLabel, shownSentence, showLess, showWhole, tagCountsLine, tagLine, withoutSentence,
} from "./packNoteCopy.ts";
import { NOTE_CSV_FILENAMES, NOTE_TEXT_FILENAMES, notesToCsv, notesToText } from "./packNoteExport.ts";
import { buildNoteIndex } from "./packNoteIndex.ts";
import {
  DEFAULT_NOTE_ORDER, NOTE_ORDERS, NO_NOTE_FILTER, type NoteFilter, type NoteOrder, filterNotes, highlightTerms, isNoteFiltered, isNoteOrder, orderNotes, parseNoteQuery, toggleIn,
} from "./packNoteSearch.ts";
import { NOTE_LENGTHS, highlightSegments, noteSnippet } from "./packNoteText.ts";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces.ts";
import { nearestTagLabel } from "./packNearest.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/** Notes longer than this are cut to a window until the person asks for the whole note. */
export const NOTE_WINDOW = 240;
const TAGS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

/**
 * The notes of the places shown, exactly as the pack wrote them, with a search that marks what
 * matched. Nothing here rewrites, ranks or interprets a note. Closed until asked for; files are
 * made on this device from what is on screen.
 */
export function PackNoteBrowser({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NoteFilter>(NO_NOTE_FILTER);
  const [order, setOrder] = useState<NoteOrder>(DEFAULT_NOTE_ORDER);
  const [whole, setWhole] = useState<readonly string[]>([]);
  const [status, setStatus] = useState("");

  const index = useMemo(() => buildNoteIndex(places), [places]);
  const shown = useMemo(() => orderNotes(filterNotes(index.entries, filter), order), [index, filter, order]);
  const terms = useMemo(() => highlightTerms(parseNoteQuery(filter.query)), [filter.query]);
  if (index.withNote === 0) return null;

  const filtered = isNoteFiltered(filter);
  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-notes>
      <p id={headingId}>
        <strong>{noteHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {noteToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-pack-notes-body>
          <p>{noteIntro(locale)}</p>
          <p>{coverageSentence(index.withNote, index.total, locale)}</p>
          <p>{tagCountsLine(index.withByTag, locale)}</p>
          {withoutSentence(index.withoutNote, locale) ? <p>{withoutSentence(index.withoutNote, locale)}</p> : null}
          <fieldset className="stack">
            <legend>{t(locale, "Find and narrow", "Chercher et restreindre")}</legend>
            <TextInput label={searchLabel(locale)} description={searchHelp(locale)} value={filter.query} onChange={(query) => setFilter((f) => ({ ...f, query }))} />
            {TAGS.map((tag) => (
              <CheckField
                key={tag}
                label={t(locale, `Wheelchair tag: ${nearestTagLabel(tag, "en")}`, `Indication pour fauteuil roulant\u00a0: ${nearestTagLabel(tag, "fr")}`)}
                isSelected={filter.tags.includes(tag)}
                onChange={() => setFilter((f) => ({ ...f, tags: toggleIn(f.tags, tag) }))}
              />
            ))}
            {NOTE_LENGTHS.map((length) => (
              <CheckField key={length} label={lengthLabel(length, locale)} isSelected={filter.lengths.includes(length)} onChange={() => setFilter((f) => ({ ...f, lengths: toggleIn(f.lengths, length) }))} />
            ))}
            {index.duplicates.length > 0 ? <CheckField label={repeatedOnlyLabel(locale)} isSelected={filter.repeatedOnly} onChange={(repeatedOnly) => setFilter((f) => ({ ...f, repeatedOnly }))} /> : null}
            <ChoiceGroup
              label={t(locale, "Order", "Ordre")}
              value={order}
              onChange={(v) => {
                if (isNoteOrder(v)) setOrder(v);
              }}
              options={NOTE_ORDERS.map((o) => ({ value: o, label: orderLabelFor(o, locale) }))}
            />
          </fieldset>
          <p role="status" data-pack-notes-summary>
            {shown.length === 0 ? noMatchSentence(locale) : shownSentence(shown.length, index.withNote, filtered, locale)}
          </p>
          {shown.length > 0 ? (
            <ul className="stack" aria-label={t(locale, "Notes", "Notes")}>
              {shown.map((e) => {
                const long = e.chars > NOTE_WINDOW;
                const isWhole = whole.includes(e.id);
                const snip = long && !isWhole ? noteSnippet(e.note, terms, NOTE_WINDOW) : { text: e.note, cut: false, before: false, after: false };
                const label = e.name ?? noteNoName(locale);
                return (
                  <li key={e.id} className="stack" data-tag={e.tag}>
                    <p>
                      <strong>{label}</strong>
                      <br />
                      {tagLine(e.tag, locale)}
                      {e.address !== null ? <><br />{e.address}</> : null}
                    </p>
                    <blockquote aria-label={`${noteAsWritten(locale)}, ${label}`}>
                      {snip.before ? "… " : null}
                      {highlightSegments(snip.text, terms).map((seg, i) => (seg.match ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
                      {snip.after ? " …" : null}
                    </blockquote>
                    <p>
                      {charsPhrase(e.chars, locale)} ({lengthWord(e.length, locale)}){e.copies > 1 ? ` ${repeatedLabel(e.copies, locale)}` : ""}
                    </p>
                    {long ? (
                      <Button variant="quiet" aria-expanded={isWhole} aria-label={`${isWhole ? showLess(locale) : showWhole(locale)}, ${label}`} onPress={() => setWhole((w) => toggleIn(w, e.id))}>
                        {isWhole ? showLess(locale) : showWhole(locale)}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {index.duplicates.length > 0 ? (
            <section className="stack" aria-label={duplicatesHeading(index.duplicates.length, locale)}>
              <p>
                <strong>{duplicatesHeading(index.duplicates.length, locale)}</strong>
              </p>
              <ul className="stack">
                {index.duplicates.map((g) => (
                  <li key={g.key}>
                    {g.note}
                    <br />
                    {g.names.map((n) => n ?? noteNoName(locale)).join(", ")}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {shown.length > 0 ? (
            <div className="stack" role="group" aria-label={t(locale, "Save these notes", "Enregistrer ces notes")}>
              <Button variant="secondary" onPress={() => save({ name: NOTE_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: notesToText(index, shown, locale) })}>
                {t(locale, "Save as text (.txt)", "Enregistrer en texte (.txt)")}
              </Button>
              <Button variant="secondary" onPress={() => save({ name: NOTE_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: notesToCsv(shown, { bom: true }) })}>
                {t(locale, "Save as a spreadsheet (.csv)", "Enregistrer en tableur (.csv)")}
              </Button>
            </div>
          ) : null}
          <p aria-live="polite" data-pack-notes-status>
            {status}
          </p>
        </div>
      ) : null}
    </section>
  );
}
