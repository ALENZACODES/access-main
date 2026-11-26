import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { type BucketKey, fingerprintPlaces, placesInBuckets } from "./packFingerprint.ts";
import { parseCode, printToCode } from "./packFingerprintCode.ts";
import { comparePrints } from "./packFingerprintCompare.ts";
import {
  COMPARISON_FILENAMES, FINGERPRINT_FILENAMES, comparisonCounts, comparisonSaveButton, comparisonGroups, comparisonHeadline, fingerprintButtonsLabel, fingerprintCodeLabel, fingerprintCopied, fingerprintCopyButton, fingerprintCopyFailed,
  fingerprintCountLine, fingerprintIntro, fingerprintLimit, fingerprintNoPlaces, fingerprintPasteLabel, fingerprintPastePlaceholder, fingerprintProblem, fingerprintSaveButton,
  fingerprintSaveFailed, fingerprintSaved, fingerprintToggle, groupColumn, groupsExplain, groupTableCaption, hereColumn, hereListHeading, stateColumn, stateWord, thereColumn,
} from "./packFingerprintCopy.ts";
import { comparisonToText, fingerprintToText } from "./packFingerprintExport.ts";
import { PackGroupDetail } from "./PackGroupDetail.tsx";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  /** ISO date for the saved files; defaults to today on this device. */
  today?: string;
  /** Writes text to the clipboard. Defaults to the browser's; returns false when it cannot. */
  copy?: (text: string) => Promise<boolean>;
  /** Receives the file to save; returns false when the browser cannot make one. */
  onSave?: (file: SavedFile) => boolean;
}

/** The most places named under a difference. The rest are counted, not listed. */
export const MAX_LISTED = 30;

const browserCopy = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Compare the saved places with another device without sending them anywhere: copy a short code
 * from one device and paste it on the other. Closed by default and adds no heading. Reading only.
 */
export function PackFingerprint({ places, locale, today, copy = browserCopy, onSave = (file) => saveTextFile(file) }: Props) {
  const panelId = useId();
  const pasteId = useId();
  const codeId = useId();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const print = useMemo(() => fingerprintPlaces(places), [places]);
  const code = useMemo(() => printToCode(print), [print]);
  const parsed = useMemo(() => (pasted.trim() === "" ? null : parseCode(pasted)), [pasted]);
  const comparison = useMemo(() => (parsed && parsed.ok ? comparePrints(print, parsed.print) : null), [parsed, print]);
  const day = today ?? localToday();

  const listed = useMemo(() => {
    if (!comparison || comparison.differing.length === 0) return { all: 0, shown: [] as PackPlaceRecord[] };
    const inGroups = placesInBuckets(places, new Set<BucketKey>(comparison.differing));
    return { all: inGroups.length, shown: inGroups.slice(0, MAX_LISTED) };
  }, [comparison, places]);

  const doCopy = async () => setStatus((await copy(code)) ? fingerprintCopied(locale) : fingerprintCopyFailed(locale));

  const save = (file: SavedFile) => {
    let ok = false;
    try {
      ok = onSave(file);
    } catch {
      ok = false;
    }
    setStatus(ok ? fingerprintSaved(file.name, locale) : fingerprintSaveFailed(locale));
  };

  return (
    <div data-pack-fingerprint lang={locale}>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {fingerprintToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{fingerprintIntro(locale)}</p>
            {places.length === 0 ? (
              <p>{fingerprintNoPlaces(locale)}</p>
            ) : (
              <>
                <p>{fingerprintCountLine(places.length, locale)}</p>
                <label htmlFor={codeId}>{fingerprintCodeLabel(locale)}</label>
                <textarea id={codeId} readOnly rows={6} value={code} onFocus={(e) => e.currentTarget.select()} />
                <div className="stack" role="group" aria-label={fingerprintButtonsLabel(locale)}>
                  <Button variant="secondary" onPress={doCopy}>
                    {fingerprintCopyButton(locale)}
                  </Button>
                  <Button variant="secondary" onPress={() => save({ name: FINGERPRINT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: fingerprintToText(code, places.length, locale, day) })}>
                    {fingerprintSaveButton(locale)}
                  </Button>
                </div>
              </>
            )}
            <label htmlFor={pasteId}>{fingerprintPasteLabel(locale)}</label>
            <textarea id={pasteId} rows={6} value={pasted} placeholder={fingerprintPastePlaceholder} onChange={(e) => setPasted(e.target.value)} />
            {parsed && !parsed.ok ? (
              <p data-fingerprint-problem role="status">
                {fingerprintProblem(parsed.problem, parsed.token, locale)}
              </p>
            ) : null}
            {comparison ? (
              <div data-fingerprint-result data-kind={comparison.kind}>
                <p role="status">{comparisonHeadline(comparison.kind, locale)}</p>
                <p>{comparisonCounts(comparison, locale)}</p>
                {comparisonGroups(comparison, locale) !== "" ? <p>{comparisonGroups(comparison, locale)}</p> : null}
                {comparison.differing.length > 0 ? (
                  <>
                    <table>
                      <caption>{groupTableCaption(locale)}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{groupColumn(locale)}</th>
                          <th scope="col">{hereColumn(locale)}</th>
                          <th scope="col">{thereColumn(locale)}</th>
                          <th scope="col">{stateColumn(locale)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.buckets.map((b) => (
                          <tr key={b.key} data-differs={b.differs}>
                            <th scope="row">{b.key}</th>
                            <td>{b.here}</td>
                            <td>{b.there}</td>
                            <td>{stateWord(b.differs, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>{groupsExplain(locale)}</p>
                    {listed.all > 0 ? (
                      <>
                        <p>{hereListHeading(listed.all, listed.shown.length, locale)}</p>
                        <ul>
                          {listed.shown.map((p) => (
                            <li key={p.id}>{p.name ?? "UNKNOWN"}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <PackGroupDetail places={places} groups={comparison.differing} locale={locale} copy={copy} />
                  </>
                ) : null}
                <Button variant="secondary" onPress={() => save({ name: COMPARISON_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: comparisonToText(comparison, locale, day) })}>
                  {comparisonSaveButton(locale)}
                </Button>
              </div>
            ) : null}
            <p>{fingerprintLimit(locale)}</p>
            <p aria-live="polite" data-fingerprint-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
