import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import {
  DEFAULT_TOPIC_ORDER, NO_TOPIC_FILTER, TOPIC_MODES, TOPIC_ORDERS, type TopicFilter, type TopicOrder, filterTopicEntries, isTopicFiltered, isTopicMode, isTopicOrder, orderTopicEntries, toggleTopicIn,
} from "./noteTopicFilter.ts";
import {
  topicCoverageLine, topicMentionsLine, topicModeGroupLabel, topicModeLabel, topicNegatedLine, topicNoMatchLine, topicNoName, topicNoWordsLine, topicNoteAsWritten, topicOrderLabel, topicPairsHeading, topicPairsLine, topicShownLine, topicSkipNegatedLabel,
  topicTableCaption, topicTableTagHeader, topicTableTotalHeader, topicTableWordHeader, topicTagFilterLabel, topicTagLine, topicCheckLabel, topicsHeading, topicsIntro, topicsToggle, topicWithoutTopicLine, topicWordsUsedLine,
} from "./noteTopicCopy.ts";
import { TOPIC_CSV_FILENAMES, TOPIC_TABLE_CSV_FILENAMES, TOPIC_TEXT_FILENAMES, topicEntriesToCsv, topicTableToCsv, topicsToText } from "./noteTopicExport.ts";
import { TOPIC_TAG_ORDER, buildTopicIndex } from "./noteTopicIndex.ts";
import { TOPIC_IDS, topicLabel } from "./noteTopicLexicon.ts";
import { topicMarkSegments } from "./noteTopicScan.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * The notes of the places shown, grouped by the topic words they use, with the words marked in the
 * note as written. It shows that a note uses a word, never what the note means. Closed until asked
 * for; files are made on this device from what is on screen.
 */
export function NoteTopics({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<TopicFilter>(NO_TOPIC_FILTER);
  const [order, setOrder] = useState<TopicOrder>(DEFAULT_TOPIC_ORDER);
  const [status, setStatus] = useState("");

  const index = useMemo(() => buildTopicIndex(places), [places]);
  const shown = useMemo(() => orderTopicEntries(filterTopicEntries(index.entries, filter), order), [index, filter, order]);
  if (index.withNote === 0) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };
  const usedTopics = TOPIC_IDS.filter((id) => index.byTopic[id].places > 0);
  const usedTags = TOPIC_TAG_ORDER.filter((x) => places.some((p) => p.note !== null && p.tag === x));

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-note-topics>
      <p id={headingId}>
        <strong>{topicsHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {topicsToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-note-topics-body>
          <p>{topicsIntro(locale)}</p>
          <p>{topicCoverageLine(index.withTopic, index.withNote, locale)}</p>
          {topicWithoutTopicLine(index.withoutTopic, locale) ? <p>{topicWithoutTopicLine(index.withoutTopic, locale)}</p> : null}
          {usedTopics.length > 0 ? (
            <table data-note-topics-table>
              <caption>{topicTableCaption(locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{topicTableWordHeader(locale)}</th>
                  <th scope="col">{topicTableTotalHeader(locale)}</th>
                  {usedTags.map((x) => (
                    <th key={x} scope="col">
                      {topicTableTagHeader(x, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usedTopics.map((id) => (
                  <tr key={id}>
                    <th scope="row">{topicLabel(id, locale)}</th>
                    <td>{index.byTopic[id].places}</td>
                    {usedTags.map((x) => (
                      <td key={x}>{index.tagTable[id][x]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {index.pairs.length > 0 ? (
            <div className="stack">
              <p>
                <strong>{topicPairsHeading(locale)}</strong>
              </p>
              <ul>
                {index.pairs.slice(0, 5).map((p) => (
                  <li key={`${p.a}-${p.b}`}>{topicPairsLine(p.a, p.b, p.places, locale)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {usedTopics.length > 0 ? (
            <fieldset className="stack">
              <legend>{t(locale, "Choose words", "Choisir des mots")}</legend>
              {usedTopics.map((id) => (
                <CheckField key={id} label={topicCheckLabel(id, index.byTopic[id].places, locale)} isSelected={filter.topics.includes(id)} onChange={() => setFilter((f) => ({ ...f, topics: toggleTopicIn(f.topics, id) }))} />
              ))}
              {filter.topics.length > 1 ? (
                <ChoiceGroup
                  label={topicModeGroupLabel(locale)}
                  value={filter.mode}
                  onChange={(v) => {
                    if (isTopicMode(v)) setFilter((f) => ({ ...f, mode: v }));
                  }}
                  options={TOPIC_MODES.map((m) => ({ value: m, label: topicModeLabel(m, locale) }))}
                />
              ) : null}
              {usedTags.map((x) => (
                <CheckField key={x} label={topicTagFilterLabel(x, locale)} isSelected={filter.tags.includes(x)} onChange={() => setFilter((f) => ({ ...f, tags: toggleTopicIn(f.tags, x) }))} />
              ))}
              {index.entries.some((e) => e.negatedOnly.length > 0) ? <CheckField label={topicSkipNegatedLabel(locale)} isSelected={filter.skipNegatedOnly} onChange={(v) => setFilter((f) => ({ ...f, skipNegatedOnly: v }))} /> : null}
              <ChoiceGroup
                label={t(locale, "Order", "Ordre")}
                value={order}
                onChange={(v) => {
                  if (isTopicOrder(v)) setOrder(v);
                }}
                options={TOPIC_ORDERS.map((o) => ({ value: o, label: topicOrderLabel(o, locale) }))}
              />
            </fieldset>
          ) : null}
          <p role="status" data-note-topics-summary>
            {shown.length === 0 ? topicNoMatchLine(locale) : topicShownLine(shown.length, index.withNote, isTopicFiltered(filter), locale)}
          </p>
          {shown.length > 0 ? (
            <ul className="stack" aria-label={t(locale, "Notes", "Notes")}>
              {shown.map((e) => {
                const label = e.name ?? topicNoName(locale);
                return (
                  <li key={e.id} className="stack" data-tag={e.tag}>
                    <p>
                      <strong>{label}</strong>
                      <br />
                      {topicTagLine(e.tag, locale)}
                      {e.address !== null ? (
                        <>
                          <br />
                          {e.address}
                        </>
                      ) : null}
                    </p>
                    <blockquote aria-label={`${topicNoteAsWritten(locale)}, ${label}`}>
                      {topicMarkSegments(e.note, e.mentions).map((seg, i) => (seg.mention !== null ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
                    </blockquote>
                    <p>
                      {e.topics.length > 0 ? topicWordsUsedLine(e.topics, locale) : topicNoWordsLine(locale)}
                      {e.negatedOnly.length > 0 ? (
                        <>
                          <br />
                          {topicNegatedLine(e.negatedOnly, locale)}
                        </>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {usedTopics.length > 0 ? <p>{topicMentionsLine(index.withTopic, usedTopics.reduce((sum, id) => sum + index.byTopic[id].mentions, 0), locale)}</p> : null}
          <div className="stack" role="group" aria-label={t(locale, "Save the words and notes", "Enregistrer les mots et les notes")}>
            <Button variant="secondary" onPress={() => save({ name: TOPIC_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: topicsToText(index, shown, locale) })}>
              {t(locale, "Save as text (.txt)", "Enregistrer en texte (.txt)")}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: TOPIC_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: topicEntriesToCsv(shown, { bom: true }) })}>
              {t(locale, "Save the notes as a spreadsheet (.csv)", "Enregistrer les notes en tableur (.csv)")}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: TOPIC_TABLE_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: topicTableToCsv(index, { bom: true }) })}>
              {t(locale, "Save the word table as a spreadsheet (.csv)", "Enregistrer le tableau des mots en tableur (.csv)")}
            </Button>
            <p aria-live="polite" data-note-topics-status>
              {status}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
