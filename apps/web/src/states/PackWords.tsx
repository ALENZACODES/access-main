import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { parsePackSearch } from "./packSearchParse.ts";
import {
  missingWordLine, missingWordsHeading, nearWordLine, nearWordNoneLine, searchForWordLabel, wordButtonLabel, wordCountLine, wordFieldLabel, wordsFieldGroupLabel, wordsHeading, wordsIntro,
  wordsSaveCsvLabel, wordsSaveTextLabel, wordsShowAllLabel, wordsShowFewerLabel, wordsToggle,
} from "./packWordCopy.ts";
import { WORD_CSV_FILENAMES, WORD_TEXT_FILENAMES, wordsToCsv, wordsToText } from "./packWordExport.ts";
import { WORD_FIELDS, buildWordIndex, isWordField, type WordField, wordList } from "./packWordIndex.ts";
import { findMissingWords } from "./packWordMisses.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface MissingProps {
  places: readonly PackPlaceRecord[];
  text: string;
  locale: Locale;
  /** Puts a changed search in the box. */
  onUse: (text: string) => void;
}

/** Under the search box: words in the search that no place has, and the words the pack does have near them. */
export function PackSearchWords({ places, text, locale, onUse }: MissingProps) {
  const missing = useMemo(() => findMissingWords(places, text, parsePackSearch(text)), [places, text]);
  if (missing.length === 0) return null;
  return (
    <section className="stack" lang={locale} aria-live="polite" data-pack-search-words>
      <p>
        <strong>{missingWordsHeading(locale)}</strong>
      </p>
      <ul className="stack">
        {missing.map((m) => (
          <li key={`${m.field}:${m.word}`} className="stack">
            <p>{missingWordLine(m.word, m.field, locale)}</p>
            {m.options.length === 0 ? (
              <p>{nearWordNoneLine(locale)}</p>
            ) : (
              <ul className="stack">
                {m.options.map((o) => (
                  <li key={o.text} className="stack">
                    <p>{nearWordLine(o.text, o.places, o.reason, locale)}</p>
                    <Button variant="secondary" onPress={() => onUse(o.searchText)}>
                      {searchForWordLabel(o.text, locale)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const WORDS_SHOWN = 30;

interface ListProps {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** Puts a word in the search box. */
  onTry: (word: string) => void;
  onSave?: (file: SavedFile) => boolean;
}

/** Closed until asked for. The words of the pack with how many places have each; press one to search for it. */
export function PackWordList({ places, locale, onTry, onSave = saveTextFile }: ListProps) {
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<WordField>("any");
  const [all, setAll] = useState(false);
  const [status, setStatus] = useState("");
  const index = useMemo(() => buildWordIndex(places), [places]);
  const words = useMemo(() => wordList(index, field), [index, field]);
  if (places.length === 0) return null;
  const shown = all ? words : words.slice(0, WORDS_SHOWN);

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
    <section className="stack" aria-labelledby={headingId} lang={locale} data-pack-words>
      <p id={headingId}>
        <strong>{wordsHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {wordsToggle(open, locale)}
      </Button>
      {open ? (
        <div className="stack" data-pack-words-body>
          <p>{wordsIntro(locale)}</p>
          <ChoiceGroup
            label={wordsFieldGroupLabel(locale)}
            value={field}
            onChange={(v) => {
              if (isWordField(v)) {
                setField(v);
                setAll(false);
              }
            }}
            options={WORD_FIELDS.map((f) => ({ value: f, label: wordFieldLabel(f, locale) }))}
          />
          <p role="status" data-pack-words-count>
            {wordCountLine(shown.length, words.length, locale)}
          </p>
          {shown.length > 0 ? (
            <ul className="stack" aria-label={wordFieldLabel(field, locale)}>
              {shown.map((w) => (
                <li key={w.word}>
                  <Button variant="secondary" aria-label={searchForWordLabel(w.word, locale)} onPress={() => onTry(w.word)}>
                    {wordButtonLabel(w.word, w.places)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {words.length > WORDS_SHOWN ? (
            <Button variant="quiet" onPress={() => setAll((a) => !a)}>
              {all ? wordsShowFewerLabel(locale) : wordsShowAllLabel(words.length, locale)}
            </Button>
          ) : null}
          <div className="stack" role="group" aria-label={t(locale, "Save the words", "Enregistrer les mots")}>
            <Button variant="secondary" onPress={() => save({ name: WORD_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: wordsToText(words, field, locale) })}>
              {wordsSaveTextLabel(locale)}
            </Button>
            <Button variant="secondary" onPress={() => save({ name: WORD_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: wordsToCsv(words, field, { bom: true }) })}>
              {wordsSaveCsvLabel(locale)}
            </Button>
          </div>
          <p role="status" data-pack-words-status>
            {status}
          </p>
        </div>
      ) : null}
    </section>
  );
}
