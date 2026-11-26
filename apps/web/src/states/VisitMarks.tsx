import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile } from "./downloadFile.ts";
import { MarksTransfer } from "./MarksTransfer.tsx";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import type { VisitMarksState } from "./useVisitMarks.ts";
import { VISIT_STATUSES, isVisitStatus, marksForPlaces, summariseMarks } from "./visitMarks.ts";
import {
  clearElsewhereLabel, elsewhereLine, markChanged, markDayLine, marksFull, marksLead, marksNotKept, marksSaveCsv, marksSaveFailed, marksSaveText, marksSaved,
  marksSummaryLine, marksToolsLabel, noListedPlaces, noMarkName, placeMarkLabel, statusName,
} from "./visitMarksCopy.ts";
import { marksFileName, marksToCsv, marksToText } from "./visitMarksExport.ts";

interface Props {
  /** The listed places that the pack still holds, in the order they were listed. */
  places: readonly PackPlaceRecord[];
  /** Every place the pack holds, for checking a pasted marks code. Defaults to the listed places. */
  packPlaces?: readonly PackPlaceRecord[];
  state: VisitMarksState;
  locale: Locale;
  today: string;
}

const NONE = "none";

/**
 * The person's own marks on the listed places. Closed until asked for and adding no heading. A mark
 * is a note to themselves: nothing here says a place is better or worse, and nothing is reordered.
 */
export function VisitMarks({ places, packPlaces, state, locale, today }: Props) {
  const toolsId = useId();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState("");
  const rows = useMemo(() => marksForPlaces(state.marks, places), [state.marks, places]);
  const summary = useMemo(() => summariseMarks(state.marks, places.map((p) => p.id)), [state.marks, places]);
  if (places.length === 0 && state.marks.length === 0) return null;

  const choose = (place: PackPlaceRecord, value: string) => {
    const name = place.name ?? place.id;
    if (value === NONE) {
      state.clear(place.id);
      setSaid(markChanged(name, null, locale));
    } else if (isVisitStatus(value)) {
      const result = state.set(place.id, value);
      setSaid(result === "full" ? marksFull(locale) : markChanged(name, value, locale));
    }
  };
  const save = (kind: "csv" | "txt") => {
    const name = marksFileName(kind, today);
    const content = kind === "csv" ? marksToCsv(rows, { bom: true }) : marksToText(rows, today, locale);
    const done = saveTextFile({ name, mime: kind === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8", content });
    setSaid(done ? marksSaved(name, locale) : marksSaveFailed(locale));
  };
  const elsewhere = elsewhereLine(summary.elsewhere, locale);

  return (
    <div className="stack" data-visit-marks>
      <Button variant="quiet" onPress={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={toolsId}>
        {marksToolsLabel(open, locale)}
      </Button>
      <div id={toolsId} hidden={!open} className="stack">
        {open ? (
          <>
            <p>{marksLead(locale)}</p>
            {places.length === 0 ? <p>{noListedPlaces(locale)}</p> : <p data-visit-marks-summary>{marksSummaryLine(summary, locale)}</p>}
            {!state.kept ? <p>{marksNotKept(locale)}</p> : null}
            {rows.map(({ place, mark }) => (
              <div key={place.id} className="stack" data-visit-mark-id={place.id}>
                <ChoiceGroup
                  label={placeMarkLabel(place.name ?? place.id, locale)}
                  value={mark?.status ?? NONE}
                  onChange={(v) => choose(place, v)}
                  options={[{ value: NONE, label: noMarkName(locale) }, ...VISIT_STATUSES.map((s) => ({ value: s, label: statusName(s, locale) }))]}
                />
                {mark ? <p>{markDayLine(mark, locale)}</p> : null}
              </div>
            ))}
            {elsewhere ? (
              <>
                <p>{elsewhere}</p>
                <Button variant="secondary" onPress={() => { state.keepOnly(new Set(places.map((p) => p.id))); setSaid(""); }}>
                  {clearElsewhereLabel(locale)}
                </Button>
              </>
            ) : null}
            {places.length > 0 ? (
              <div className="row">
                <Button variant="secondary" onPress={() => save("txt")}>{marksSaveText(locale)}</Button>
                <Button variant="secondary" onPress={() => save("csv")}>{marksSaveCsv(locale)}</Button>
              </div>
            ) : null}
            <MarksTransfer places={packPlaces ?? places} state={state} locale={locale} />
            <p aria-live="polite" data-visit-marks-said>{said}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
