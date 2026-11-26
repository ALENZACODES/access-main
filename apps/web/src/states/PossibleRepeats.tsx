import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import {
  dupCannotSave, dupGroupLabel, dupHeading, dupIntro, dupLevelGroupLabel, dupLevelLabel, dupMemberFields, dupMetresLine, dupNoName, dupNone, dupNoPlaces, dupReasonsLine, dupSaveCsv, dupSaveText, dupSavedLine, dupSkippedLine, dupSummary,
  dupTagsDiffer, dupToggle, dupUnknownValue,
} from "./duplicateCopy.ts";
import { duplicatesCsvFile, duplicatesTextFile } from "./duplicateExport.ts";
import { findDuplicates } from "./duplicateGroups.ts";
import { DEFAULT_STRICTNESS, STRICTNESS_LEVELS, isStrictness, type Strictness } from "./duplicateScore.ts";
import { compareRepeats } from "./repeatCompare.ts";
import {
  repeatCompareCaption, repeatStatsLine, repeatCompareCaveat, repeatCompareFieldHeader, repeatCompareDiffering, repeatCompareMember, repeatCompareNotGiven, repeatCompareSpread, repeatCompareState, repeatCompareToggle, repeatFieldLabel, repeatStateLabel,
} from "./repeatCompareCopy.ts";
import { repeatStats } from "./repeatStats.ts";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

/** Groups listed at once; the rest are counted. */
export const REPEAT_GROUPS_SHOWN = 20;

function Comparison({ ids, places, n, locale }: { ids: readonly string[]; places: readonly PackPlaceRecord[]; n: number; locale: Locale }) {
  const cmp = useMemo(() => compareRepeats(ids, places), [ids, places]);
  const spread = repeatCompareSpread(cmp.spreadMetres, locale);
  return (
    <>
      <table>
        <caption>{repeatCompareCaption(n, locale)}</caption>
        <thead>
          <tr>
            <th scope="col">{repeatCompareFieldHeader(locale)}</th>
            <th scope="col">{repeatCompareState(locale)}</th>
            {cmp.ids.map((id) => (
              <th key={id} scope="col">
                {repeatCompareMember(id, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cmp.rows.map((r) => (
            <tr key={r.field} data-state={r.state}>
              <th scope="row">{repeatFieldLabel(r.field, locale)}</th>
              <td>{repeatStateLabel(r.state, locale)}</td>
              {r.values.map((v, i) => (
                <td key={cmp.ids[i]}>{v ?? repeatCompareNotGiven(locale)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{repeatCompareDiffering(cmp.differing, locale)}</p>
      {spread ? <p>{spread}</p> : null}
      <p>{repeatCompareCaveat(locale)}</p>
    </>
  );
}

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * Places of the list that may be the same place listed twice, from name, street address, position and
 * kind. It points and says why; it merges, hides and removes nothing and does not say which record is right.
 * Closed until asked for; files are made on this device.
 */
export function PossibleRepeats({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Strictness>(DEFAULT_STRICTNESS);
  const [status, setStatus] = useState("");
  const [compared, setCompared] = useState<ReadonlySet<string>>(new Set());

  // The pairs are only worked out once the panel is opened.
  const report = useMemo(() => (open ? findDuplicates(places, level) : null), [open, places, level]);
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);
  if (places.length < 2) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? dupSavedLine(file.name, locale) : dupCannotSave(locale));
  };
  const f = dupMemberFields(locale);
  const shown = report ? report.groups.slice(0, REPEAT_GROUPS_SHOWN) : [];

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-possible-repeats>
      <p id={headingId}>
        <strong>{dupHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {dupToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-possible-repeats-body>
        {open && report ? (
          <>
            <p>{dupIntro(locale)}</p>
            <ChoiceGroup
              label={dupLevelGroupLabel(locale)}
              value={level}
              onChange={(v) => {
                if (isStrictness(v)) setLevel(v);
              }}
              options={STRICTNESS_LEVELS.map((s) => ({ value: s, label: dupLevelLabel(s, locale) }))}
            />
            {report.groups.length === 0 ? <p>{places.length === 0 ? dupNoPlaces(locale) : dupNone(locale)}</p> : <p aria-live="polite">{dupSummary(report.groups.length, report.placesInGroups, locale)}</p>}
            {report.groups.length > 0 ? <p data-possible-repeats-stats>{repeatStatsLine(repeatStats(report), locale)}</p> : null}
            {dupSkippedLine(report.skippedBuckets, locale) ? <p>{dupSkippedLine(report.skippedBuckets, locale)}</p> : null}
            {shown.length > 0 ? (
              <ol data-possible-repeats-groups>
                {shown.map((g, gi) => (
                  <li key={g.ids.join("|")}>
                    <p>
                      <strong>{dupGroupLabel(gi + 1, g.ids.length, locale)}</strong>
                    </p>
                    <ul>
                      {g.ids.map((id) => {
                        const p = byId.get(id);
                        return (
                          <li key={id}>
                            {p?.name ?? dupNoName(locale)}
                            <br />
                            <small>
                              {f.address}: {p?.address ?? dupUnknownValue(locale)}; {f.kind}: {p?.category ?? dupUnknownValue(locale)}; {f.tag}: {p?.tag ?? "unknown"}; {f.id}: {id}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                    <ul data-possible-repeats-why>
                      {g.pairs.map((x) => (
                        <li key={`${x.a}|${x.b}`}>
                          <small>
                            {x.a} / {x.b}: {dupReasonsLine(x.pair.reasons, locale)}
                            {x.pair.metres !== null ? `; ${dupMetresLine(x.pair.metres, locale)}` : ""}
                          </small>
                        </li>
                      ))}
                    </ul>
                    {g.tagsDiffer ? <p>{dupTagsDiffer(locale)}</p> : null}
                    <Button
                      variant="secondary"
                      aria-expanded={compared.has(g.ids.join("|"))}
                      aria-controls={`${panelId}-cmp-${gi}`}
                      onPress={() =>
                        setCompared((prev) => {
                          const next = new Set(prev);
                          const key = g.ids.join("|");
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                    >
                      {repeatCompareToggle(compared.has(g.ids.join("|")), locale)}
                    </Button>
                    <div id={`${panelId}-cmp-${gi}`} hidden={!compared.has(g.ids.join("|"))} data-repeat-compare>
                      {compared.has(g.ids.join("|")) ? <Comparison ids={g.ids} places={places} n={gi + 1} locale={locale} /> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {report.groups.length > 0 ? (
              <div className="row">
                <Button variant="secondary" onPress={() => save(duplicatesTextFile(report, places, locale))}>
                  {dupSaveText(locale)}
                </Button>
                <Button variant="secondary" onPress={() => save(duplicatesCsvFile(report, places, locale))}>
                  {dupSaveCsv(locale)}
                </Button>
              </div>
            ) : null}
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
