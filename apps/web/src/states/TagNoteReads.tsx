import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { topicNoName, topicTagLine } from "./noteTopicCopy.ts";
import { topicMarkSegments } from "./noteTopicScan.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import {
  tagNoteAllLabel, tagNoteCountLine, tagNoteKindChoice, tagNoteKindGroupLabel, tagNoteKindLabel, tagNoteNoneShownLine, tagNoteNoteAsWritten, tagNoteOrderGroupLabel, tagNoteOrderLabel, tagNoteRuleLine,
  tagNoteRulesExtra, tagNoteRulesHeading, tagNoteSaveCsvLabel, tagNoteSaveTextLabel, tagNoteWhyLine, tagNotesHeading, tagNotesIntro, tagNotesToggle,
} from "./tagNoteCopy.ts";
import { TAG_NOTE_CSV_FILENAMES, TAG_NOTE_TEXT_FILENAMES, tagNotesToCsv, tagNotesToText } from "./tagNoteExport.ts";
import { DEFAULT_TAG_NOTE_ORDER, TAG_NOTE_ORDERS, type TagNoteOrder, buildTagNoteIndex, isTagNoteOrder, shownTagNotes } from "./tagNoteIndex.ts";
import { TAG_NOTE_KINDS, type TagNoteKind, isTagNoteKind } from "./tagNoteRules.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

const ALL = "all";

/**
 * Places whose tag and note can be read in different directions, with the note as written and the words
 * marked. A list of places to read, never of errors. Closed until asked for; files are made on this device.
 */
export function TagNoteReads({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TagNoteKind | null>(null);
  const [order, setOrder] = useState<TagNoteOrder>(DEFAULT_TAG_NOTE_ORDER);
  const [status, setStatus] = useState("");
  const index = useMemo(() => buildTagNoteIndex(places), [places]);
  const shown = useMemo(() => shownTagNotes(index.reads, kind, order), [index, kind, order]);
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
  const usedKinds = TAG_NOTE_KINDS.filter((k) => index.byKind[k] > 0);

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-tag-notes>
      <p id={headingId}>
        <strong>{tagNotesHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {tagNotesToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-tag-notes-body>
          <p>{tagNotesIntro(locale)}</p>
          <p>
            <strong>{tagNoteRulesHeading(locale)}</strong>
          </p>
          <ul>
            {TAG_NOTE_KINDS.map((k) => (
              <li key={k}>{tagNoteRuleLine(k, locale)}</li>
            ))}
          </ul>
          <p>{tagNoteRulesExtra(locale)}</p>
          <p role="status" data-tag-notes-count>
            {tagNoteCountLine(index.reads.length, index.withNote, locale)}
          </p>
          {usedKinds.length > 0 ? (
            <fieldset className="stack">
              <ChoiceGroup
                label={tagNoteKindGroupLabel(locale)}
                value={kind ?? ALL}
                onChange={(v) => {
                  if (v === ALL) setKind(null);
                  else if (isTagNoteKind(v)) setKind(v);
                }}
                options={[{ value: ALL, label: tagNoteAllLabel(index.reads.length, locale) }, ...usedKinds.map((k) => ({ value: k, label: tagNoteKindChoice(k, index.byKind[k], locale) }))]}
              />
              <ChoiceGroup
                label={tagNoteOrderGroupLabel(locale)}
                value={order}
                onChange={(v) => {
                  if (isTagNoteOrder(v)) setOrder(v);
                }}
                options={TAG_NOTE_ORDERS.map((o) => ({ value: o, label: tagNoteOrderLabel(o, locale) }))}
              />
            </fieldset>
          ) : null}
          {index.reads.length > 0 && shown.length === 0 ? <p>{tagNoteNoneShownLine(locale)}</p> : null}
          {shown.length > 0 ? (
            <ul className="stack" aria-label={t(locale, "Places to read", "Lieux à lire")}>
              {shown.map((r) => {
                const label = r.name ?? topicNoName(locale);
                return (
                  <li key={r.id} className="stack" data-tag={r.tag} data-reading={r.kind}>
                    <p>
                      <strong>{label}</strong>
                      <br />
                      {topicTagLine(r.tag, locale)}
                      {r.address !== null ? (
                        <>
                          <br />
                          {r.address}
                        </>
                      ) : null}
                    </p>
                    <p>{tagNoteKindLabel(r.kind, locale)}</p>
                    <blockquote aria-label={`${tagNoteNoteAsWritten(locale)}, ${label}`}>
                      {topicMarkSegments(r.note, r.mentions).map((seg, i) => (seg.mention !== null ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
                    </blockquote>
                    <p>{tagNoteWhyLine(r, locale)}</p>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="stack" role="group" aria-label={t(locale, "Save the list", "Enregistrer la liste")}>
            <Button variant="secondary" onPress={() => save({ name: TAG_NOTE_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: tagNotesToText(index, shown, locale) })}>
              {tagNoteSaveTextLabel(locale)}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: TAG_NOTE_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: tagNotesToCsv(shown, { bom: true }) })}>
              {tagNoteSaveCsvLabel(locale)}
            </Button>
          </div>
          <p role="status" data-tag-notes-status>
            {status}
          </p>
        </div>
      ) : null}
    </section>
  );
}
