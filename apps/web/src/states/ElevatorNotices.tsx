import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { ELEVATOR_AGE_BANDS, bandName, ageLine } from "./elevatorAge.ts";
import {
  allLabel, droppedNote, elevatorHeading, elevatorLead, ageFilterLabel, languageNote, noReadingNote, noticeSourceLine, readingLines,
  saveCsvLabel, saveFailedNote, saveTextLabel, savedNote, elevatorSearchHelp, elevatorSearchLabel, sortLabel, sortName, stationName, stopIdsLine, toolsLabel,
} from "./elevatorCopy.ts";
import { exportFileName, noticesToCsv, noticesToText } from "./elevatorExport.ts";
import { hasReading } from "./elevatorRead.ts";
import { ELEVATOR_SORTS, EMPTY_ELEVATOR_QUERY, isElevatorSort, viewElevators, type ElevatorQuery } from "./elevatorView.ts";
import { saveTextFile } from "./downloadFile.ts";
import { parseElevatorNotices } from "./packElevators.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  /** The `elevator_status` array of the pack stored on this device, as read. It is parsed here, not trusted. */
  notices: unknown;
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The saved elevator notices, station by station, each in the operator's own words with what could be
 * read from them beside. It never says an elevator works, and it fetches nothing. The search, the age
 * filter and the two saving buttons are closed until asked for and add no heading while closed.
 */
export function ElevatorNotices({ notices, locale, today }: Props) {
  const headingId = useId();
  const toolsId = useId();
  const day = today ?? localToday();
  const parsed = useMemo(() => parseElevatorNotices(notices), [notices]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<ElevatorQuery>(EMPTY_ELEVATOR_QUERY);
  const [saved, setSaved] = useState("");
  const view = useMemo(() => viewElevators(parsed.notices, query, day, locale), [parsed.notices, query, day, locale]);
  if (parsed.notices.length === 0 && parsed.dropped === 0) return null;

  const save = (kind: "csv" | "txt") => {
    const rows = view.groups.flatMap((g) => g.rows.map((r) => r.notice));
    const name = exportFileName(kind, day);
    const content = kind === "csv" ? noticesToCsv(rows, day, { bom: true }) : noticesToText(view.groups, day, locale, query);
    const done = saveTextFile({ name, mime: kind === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8", content });
    setSaved(done ? savedNote(name, locale) : saveFailedNote(locale));
  };
  const bandOptions = [
    { value: "all", label: allLabel(locale) },
    ...ELEVATOR_AGE_BANDS.filter((b) => view.bandCounts[b] > 0).map((b) => ({ value: b, label: `${bandName(b, locale)} (${view.bandCounts[b]})` })),
  ];
  const dropped = droppedNote(parsed.dropped, locale);

  return (
    <section aria-labelledby={headingId} lang={locale} className="stack" data-elevator-notices>
      <h2 id={headingId}>{elevatorHeading(locale)}</h2>
      <p>{elevatorLead(locale)}</p>
      {parsed.notices.length > 0 ? (
        <Button variant="quiet" onPress={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={toolsId}>
          {toolsLabel(open, locale)}
        </Button>
      ) : null}
      <div id={toolsId} hidden={!open} className="stack">
        {open ? (
          <>
            <TextInput label={elevatorSearchLabel(locale)} description={elevatorSearchHelp(locale)} value={query.text} onChange={(text) => setQuery({ ...query, text })} />
            <ChoiceGroup label={ageFilterLabel(locale)} value={query.band} onChange={(v) => setQuery({ ...query, band: v === "all" ? "all" : (v as ElevatorQuery["band"]) })} options={bandOptions} />
            <ChoiceGroup
              label={sortLabel(locale)}
              value={query.sort}
              onChange={(v) => setQuery({ ...query, sort: isElevatorSort(v) ? v : "station" })}
              options={ELEVATOR_SORTS.map((s) => ({ value: s, label: sortName(s, locale) }))}
            />
            <div className="row">
              <Button variant="secondary" onPress={() => save("txt")}>{saveTextLabel(locale)}</Button>
              <Button variant="secondary" onPress={() => save("csv")}>{saveCsvLabel(locale)}</Button>
            </div>
            <p aria-live="polite" data-elevator-saved>{saved}</p>
          </>
        ) : null}
      </div>
      <p aria-live="polite" data-elevator-count>{view.announcement}</p>
      {dropped ? <p>{dropped}</p> : null}
      {view.groups.map((g) => (
        <div key={g.station} className="stack" data-station={g.station}>
          <h3>{stationName(g.station, locale)}</h3>
          <ul className="stack">
            {g.rows.map((row) => {
              const { notice, reading, age } = row;
              const lines = readingLines(reading, locale);
              const stops = stopIdsLine(notice.stopIds, locale);
              const lang = languageNote(notice.textLanguage, locale);
              return (
                <li key={notice.id} data-band={age.band}>
                  {notice.text !== null ? <p lang={notice.textLanguage ?? undefined}>{notice.text}</p> : null}
                  {lang ? <p>{lang}</p> : null}
                  {notice.text !== null && !hasReading(reading) ? <p>{noReadingNote(locale)}</p> : null}
                  {lines.length > 0 ? (
                    <dl>
                      {lines.map((l) => (
                        <div key={l.label}>
                          <dt>{l.label}</dt>
                          <dd>{l.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <p>{ageLine(notice, age, locale)}</p>
                  {stops ? <p>{stops}</p> : null}
                  <p>{noticeSourceLine(notice, locale)}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
