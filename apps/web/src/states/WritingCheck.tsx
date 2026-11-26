import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import {
  wrCannotSave, wrCaveat, wrApostropheLine, wrApostropheSummary, wrCoverage, wrDirectionLine, wrDirectionSummary, wrFilterGroup, wrFilterLabel, wrHeading, wrHitLine, wrIntro, wrMoreLine, wrNoAddress, wrNoMatch, wrNoName, wrOrderGroup, wrOrderLabel, wrRuleLabel, wrSaveCsv, wrSaveText, wrSavedLine, wrStyleLine, wrStyleSummary,
  wrSummary, wrToggle,
} from "./writingCopy.ts";
import { writingCsvFile, writingTextFile } from "./writingExport.ts";
import {
  DEFAULT_WRITING_ORDER, WRITING_FILTER_GROUPS, WRITING_ORDERS, buildWritingReport, filterWriting, isWritingFilter, isWritingOrder, orderWriting, ruleTally, type WritingFilter, type WritingOrder,
} from "./writingReport.ts";

/** Places listed at once; the saved files hold every one. */
export const WRITING_SHOWN = 20;

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * Points at names and addresses that are written differently from what a reader may expect. It shows the text
 * as the pack gives it, says what it saw, and never says the text is wrong or changes it. Closed until asked for.
 */
export function WritingCheck({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<WritingFilter>("all");
  const [order, setOrder] = useState<WritingOrder>(DEFAULT_WRITING_ORDER);
  const [status, setStatus] = useState("");

  const report = useMemo(() => (open ? buildWritingReport(places) : null), [open, places]);
  const listed = useMemo(() => (report ? orderWriting(filterWriting(report.findings, filter), order) : []), [report, filter, order]);
  const tally = useMemo(() => (report ? ruleTally(report) : []), [report]);
  if (!places.some((p) => p.name !== null || p.address !== null)) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? wrSavedLine(file.name, locale) : wrCannotSave(locale));
  };
  const filters: WritingFilter[] = [...WRITING_FILTER_GROUPS, ...tally.map((t) => t.rule)];
  const styleSummary = report ? [wrStyleSummary(report, locale), wrDirectionSummary(report, locale), wrApostropheSummary(report, locale)].filter(Boolean).join(" ") : "";

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-writing>
      <p id={headingId}>
        <strong>{wrHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {wrToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-writing-body>
        {open && report ? (
          <>
            <p>{wrIntro(locale)}</p>
            <p>{wrCoverage(report.checked, report.nothingToRead, locale)}</p>
            <p aria-live="polite">{wrSummary(report.findings.length, locale)}</p>
            {styleSummary ? <p>{styleSummary}</p> : null}
            {tally.length > 0 ? (
              <ul data-writing-tally>
                {tally.map((t) => (
                  <li key={t.rule}>
                    {wrRuleLabel(t.rule, locale)}: {t.count}
                  </li>
                ))}
              </ul>
            ) : null}
            {report.findings.length > 0 ? (
              <>
                <ChoiceGroup
                  label={wrFilterGroup(locale)}
                  value={filter}
                  onChange={(v) => {
                    if (isWritingFilter(v)) setFilter(v);
                  }}
                  options={filters.map((f) => ({ value: f, label: wrFilterLabel(f, locale) }))}
                />
                <ChoiceGroup
                  label={wrOrderGroup(locale)}
                  value={order}
                  onChange={(v) => {
                    if (isWritingOrder(v)) setOrder(v);
                  }}
                  options={WRITING_ORDERS.map((o) => ({ value: o, label: wrOrderLabel(o, locale) }))}
                />
                {listed.length === 0 ? (
                  <p>{wrNoMatch(locale)}</p>
                ) : (
                  <>
                    <ul data-writing-list>
                      {listed.slice(0, WRITING_SHOWN).map((f) => (
                        <li key={f.id}>
                          <strong>{f.name ?? wrNoName(locale)}</strong>
                          <br />
                          <small>{f.address ?? wrNoAddress(locale)}</small>
                          <ul>
                            {f.hits.map((h, i) => (
                              <li key={`${h.rule}-${i}`}>{wrHitLine(h, locale)}</li>
                            ))}
                            {f.styleMix ? <li>{wrStyleLine(f.styleMix, locale)}</li> : null}
                            {f.apostropheMix ? <li>{wrApostropheLine(f.apostropheMix, locale)}</li> : null}
                            {f.directionMix ? <li>{wrDirectionLine(f.directionMix, locale)}</li> : null}
                          </ul>
                        </li>
                      ))}
                    </ul>
                    {listed.length > WRITING_SHOWN ? <p>{wrMoreLine(listed.length - WRITING_SHOWN, locale)}</p> : null}
                    <p>{wrCaveat(locale)}</p>
                    <div className="row">
                      <Button variant="secondary" onPress={() => save(writingTextFile(listed, locale))}>
                        {wrSaveText(locale)}
                      </Button>
                      <Button variant="secondary" onPress={() => save(writingCsvFile(listed, locale))}>
                        {wrSaveCsv(locale)}
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
