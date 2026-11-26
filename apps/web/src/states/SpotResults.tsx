import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile } from "./downloadFile.ts";
import { MAX_RESULTS_CHARS, readSpotResults } from "./spotResults.ts";
import {
  SPOT_REPORT_FILENAMES, cellProblemWord, differencesHeading, noAnswers, noDifferences, noRateNote, problemsLine, reportButton, reportCopied, reportCopyFailed, reportSaveButton, resultsIntro,
  resultsPasteLabel, resultsProblem, resultsRead, resultsToggle, spotSummaryLine, tagTallyHeading, tagTallyLine,
} from "./spotResultsCopy.ts";
import { differencesNote } from "./spotReport.ts";
import { nothingAnswered, summariseResults } from "./spotSummary.ts";
import { answerWord, CHECK_KEYS, checkQuestion, labels } from "./spotSheetCopy.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  locale: Locale;
  today: string;
  copy: (text: string) => Promise<boolean>;
  onSave: (file: SavedFile) => boolean;
}

/** The most differences listed in full. The note itself holds all of them. */
export const MAX_DIFFERENCES_SHOWN = 20;

/**
 * Read a filled-in spot-check CSV back as counts and a note of the differences seen. Closed by
 * default, reading only, and nothing typed in is kept: the text lives in this component until the
 * page closes.
 */
export function SpotResults({ locale, today, copy, onSave }: Props) {
  const panelId = useId();
  const pasteId = useId();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");

  const read = useMemo(() => (pasted.trim() === "" ? null : readSpotResults(pasted)), [pasted]);
  const summary = useMemo(() => (read && read.ok ? summariseResults(read.rows) : null), [read]);
  const note = useMemo(() => (summary ? differencesNote(summary, locale, today) : ""), [summary, locale, today]);

  const doCopy = async () => setStatus((await copy(note)) ? reportCopied(locale) : reportCopyFailed(locale));
  const doSave = () => {
    let ok = false;
    try {
      ok = onSave({ name: SPOT_REPORT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: note });
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${SPOT_REPORT_FILENAMES[locale]}.`, `Fichier ${SPOT_REPORT_FILENAMES[locale]} enregistré.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };

  return (
    <div data-spot-results>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {resultsToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{resultsIntro(locale)}</p>
            <label htmlFor={pasteId}>{resultsPasteLabel(locale)}</label>
            <textarea id={pasteId} rows={8} maxLength={MAX_RESULTS_CHARS} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            {read && !read.ok ? (
              <p role="status" data-results-problem>
                {resultsProblem(read.problem, locale)}
              </p>
            ) : null}
            {read && read.ok && summary ? (
              <div data-results-summary>
                <p role="status">{resultsRead(read.rows.length, read.skipped, locale)}</p>
                {nothingAnswered(read.rows) ? (
                  <p>{noAnswers(locale)}</p>
                ) : (
                  <>
                    <p>{spotSummaryLine(summary, locale)}</p>
                    <p>{tagTallyHeading(locale)}</p>
                    <ul>
                      {summary.byTag.map((tt) => (
                        <li key={tt.tag}>{tagTallyLine(tt.tag, tt.total, tt.byMatch.same, tt.byMatch.different, locale)}</li>
                      ))}
                    </ul>
                    <p>{noRateNote(locale)}</p>
                    {summary.withProblems > 0 ? (
                      <div data-results-problems>
                        <p>{problemsLine(summary.withProblems, locale)}</p>
                        <ul>
                          {read.rows.filter((r) => r.problems.length > 0).slice(0, MAX_DIFFERENCES_SHOWN).map((r) => (
                            <li key={r.id}>
                              {r.name} ({r.id}): {r.problems.map((p) => cellProblemWord(p.problem, p.column, locale)).join(", ")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p>{summary.differences.length === 0 ? noDifferences(locale) : differencesHeading(summary.differences.length, locale)}</p>
                    {summary.differences.length > 0 ? (
                      <ul>
                        {summary.differences.slice(0, MAX_DIFFERENCES_SHOWN).map((r) => (
                          <li key={r.id}>
                            <strong>{r.name}</strong> ({labels.id(locale)}: {r.id})
                            <ul>
                              {CHECK_KEYS.filter((k) => r.answers[k] !== undefined).map((k) => (
                                <li key={k}>
                                  {checkQuestion(k, locale)} {answerWord(r.answers[k]!, locale)}
                                </li>
                              ))}
                              {r.notes !== "" ? (
                                <li>
                                  {labels.notes(locale)}: {r.notes}
                                </li>
                              ) : null}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="stack" role="group" aria-label={t(locale, "Note of the differences", "Note des différences")}>
                      <Button variant="secondary" onPress={doCopy}>
                        {reportButton(locale)}
                      </Button>
                      <Button variant="secondary" onPress={doSave}>
                        {reportSaveButton(locale)}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <p aria-live="polite" data-results-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
