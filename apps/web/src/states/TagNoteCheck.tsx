import { Fragment, useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import {
  DEFAULT_DISAGREEMENT_ORDER, DISAGREEMENT_FILTERS, DISAGREEMENT_ORDERS, checkPlaces, filterFindings, isDisagreementFilter, isDisagreementOrder, orderFindings, type DisagreementFilter, type DisagreementOrder,
} from "./tagNoteCheck.ts";
import {
  tnCannotSave, tnCaveat, tnCoverage, tnDirectionLabel, tnFilterGroup, tnFilterLabel, tnHeading, tnIntro, tnKindLine, tnLeftOut, tnLegend, tnNoMatch, tnNone, tnNoName, tnOrderGroup, tnOrderLabel, tnSaveCsv, tnSaveText, tnSavedLine, tnSummary,
  tnTagLine, tnToggle, tnWeightLine,
} from "./tagNoteCopy.ts";
import { findingsCsvFile, findingsTextFile } from "./tagNoteExport.ts";
import { markPieces } from "./tagNoteMarks.ts";
import { TagNoteEarlier } from "./TagNoteEarlier.tsx";
import { TagNoteSpread } from "./TagNoteSpread.tsx";

/** Places listed at once; the rest are counted. */
export const TAG_NOTE_SHOWN = 20;

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * Places whose wheelchair tag and note may point different ways, from the words of the note alone. It does
 * not say which of the two is right and changes neither. The note is shown as written, with the words it
 * reads set apart and named. Closed until asked for; files are made on this device.
 */
export function TagNoteCheck({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<DisagreementFilter>("all");
  const [order, setOrder] = useState<DisagreementOrder>(DEFAULT_DISAGREEMENT_ORDER);
  const [status, setStatus] = useState("");

  const report = useMemo(() => (open ? checkPlaces(places) : null), [open, places]);
  const listed = useMemo(() => (report ? orderFindings(filterFindings(report.findings, filter), order) : []), [report, filter, order]);
  if (!places.some((p) => p.note !== null)) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? tnSavedLine(file.name, locale) : tnCannotSave(locale));
  };
  const shown = listed.slice(0, TAG_NOTE_SHOWN);
  const left = report ? tnLeftOut(report.withoutNote, report.noTagToCheck, locale) : "";

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-tag-note>
      <p id={headingId}>
        <strong>{tnHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {tnToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-tag-note-body>
        {open && report ? (
          <>
            <p>{tnIntro(locale)}</p>
            <p>{tnCoverage(report.checked, locale)}</p>
            <p aria-live="polite">{tnSummary(report.findings.length, locale)}</p>
            {left ? <p>{left}</p> : null}
            {report.findings.length === 0 ? (
              <p>{tnNone(locale)}</p>
            ) : (
              <>
                <ChoiceGroup
                  label={tnFilterGroup(locale)}
                  value={filter}
                  onChange={(v) => {
                    if (isDisagreementFilter(v)) setFilter(v);
                  }}
                  options={DISAGREEMENT_FILTERS.map((f) => ({ value: f, label: tnFilterLabel(f, locale) }))}
                />
                <ChoiceGroup
                  label={tnOrderGroup(locale)}
                  value={order}
                  onChange={(v) => {
                    if (isDisagreementOrder(v)) setOrder(v);
                  }}
                  options={DISAGREEMENT_ORDERS.map((o) => ({ value: o, label: tnOrderLabel(o, locale) }))}
                />
                {listed.length === 0 ? (
                  <p>{tnNoMatch(locale)}</p>
                ) : (
                  <>
                    <p>{tnLegend(locale)}</p>
                    <ul data-tag-note-list>
                      {shown.map((d) => (
                        <li key={d.id}>
                          <strong>{d.name ?? tnNoName(locale)}</strong>
                          <br />
                          <small>{tnTagLine(d.tag, locale)}</small>
                          <br />
                          <span data-tag-note-text>
                            {markPieces(d.note, d.signals).map((piece, i) =>
                              piece.signal ? (
                                <Fragment key={i}>
                                  <mark>{piece.text}</mark>
                                  <small> ({tnDirectionLabel(piece.signal.direction, locale)})</small>
                                </Fragment>
                              ) : (
                                <Fragment key={i}>{piece.text}</Fragment>
                              ),
                            )}
                          </span>
                          <br />
                          <small>
                            {tnKindLine(d.kind, locale)} {tnWeightLine(d.weight, locale)}
                          </small>
                        </li>
                      ))}
                    </ul>
                    <p>{tnCaveat(locale)}</p>
                    <div className="row">
                      <Button variant="secondary" onPress={() => save(findingsTextFile(listed, locale))}>
                        {tnSaveText(locale)}
                      </Button>
                      <Button variant="secondary" onPress={() => save(findingsCsvFile(listed, locale))}>
                        {tnSaveCsv(locale)}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            <TagNoteSpread places={places} locale={locale} onSave={save} />
            <TagNoteEarlier places={places} locale={locale} />
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
