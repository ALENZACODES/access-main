import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import {
  wgAlone, wgApartLine, wgNextLine, wgNoneAt, wgNoneAtAll, wgSweepCaption, wgSweepColumns, wgSweepHeading, wgCannotSave, wgCaveat, wgDistanceGroup, wgDistanceLabel, wgFilterGroup, wgFilterLabel, wgGroupTitle, wgHeading, wgIntro, wgLeftOut, wgLinksLine, wgMoreGroups, wgMoreLine, wgNoMatch, wgNoName, wgNone, wgOrderGroup, wgOrderLabel, wgSaveCsv, wgSaveText, wgSavedLine,
  wgSizeLine, wgSummary, wgTagMix, wgToggle, wgUnknownLine,
} from "./walkGroupCopy.ts";
import { groupsCsvFile, groupsTextFile } from "./walkGroupExport.ts";
import { analyseGroup, mostApart } from "./walkGroupLinks.ts";
import { membersByName, nameGroup } from "./walkGroupName.ts";
import {
  DEFAULT_WALK_GROUP_ORDER, WALK_GROUP_FILTERS, WALK_GROUP_ORDERS, filterGroups, groupStats, isWalkGroupFilter, isWalkGroupOrder, orderWalkGroups, type WalkGroupFilter, type WalkGroupOrder,
} from "./walkGroupStats.ts";
import { growthBetween, newGroupsAt } from "./walkGroupMerge.ts";
import { smallestGroupingDistance, sweepDistances } from "./walkGroupSweep.ts";
import { DEFAULT_WALK_DISTANCE, WALK_DISTANCES_M, groupPlaces, isWalkDistance, locatedPlaces, type WalkDistance } from "./walkGroups.ts";

/** Groups listed at once, and members listed under each. The saved files hold all of them. */
export const WALK_GROUPS_SHOWN = 15;
export const WALK_MEMBERS_SHOWN = 8;

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  onSave?: (file: SavedFile) => boolean;
}

/**
 * Groups the listed places that are close together on the map. Straight-line distance only: it is not a route
 * and says nothing about whether a way between two places can be used. Closed until asked for.
 */
export function WalkGroups({ places, locale, onSave = saveTextFile }: Props) {
  const headingId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState<WalkDistance>(DEFAULT_WALK_DISTANCE);
  const [filter, setFilter] = useState<WalkGroupFilter>("all");
  const [order, setOrder] = useState<WalkGroupOrder>(DEFAULT_WALK_GROUP_ORDER);
  const [status, setStatus] = useState("");

  const grouping = useMemo(() => (open ? groupPlaces(places, distance) : null), [open, places, distance]);
  const listed = useMemo(() => (grouping ? orderWalkGroups(filterGroups(grouping.groups, filter), order) : []), [grouping, filter, order]);
  const sweep = useMemo(() => (open ? sweepDistances(places) : []), [open, places]);
  const hasPoints = useMemo(() => locatedPlaces(places).length >= 2, [places]);
  if (!hasPoints) return null;

  const save = (file: SavedFile) => {
    let saved = false;
    try {
      saved = onSave(file);
    } catch {
      saved = false;
    }
    setStatus(saved ? wgSavedLine(file.name, locale) : wgCannotSave(locale));
  };
  const stats = grouping ? groupStats(grouping) : null;
  const left = grouping ? wgLeftOut(grouping.withoutPoint, grouping.leftOut, locale) : "";
  const nextDistance = WALK_DISTANCES_M.find((d) => d > distance) ?? null;
  const nextLine = (() => {
    if (!grouping || nextDistance === null) return "";
    const longer = groupPlaces(places, nextDistance);
    const joined = growthBetween(grouping, longer).filter((x) => x.joinedGroups > 0).length;
    return wgNextLine(nextDistance, joined, newGroupsAt(grouping, longer).length, locale);
  })();
  const first = smallestGroupingDistance(sweep);
  const noneLine = first === null ? wgNoneAtAll(locale) : `${wgNone(locale)} ${wgNoneAt(first, locale)}`;
  const alone = stats ? wgAlone(stats.alone, locale) : "";

  return (
    <section className="stack" aria-labelledby={headingId} lang={locale} data-walk-groups>
      <p id={headingId}>
        <strong>{wgHeading(locale)}</strong>
      </p>
      <Button variant="secondary" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((o) => !o)}>
        {wgToggle(open, locale)}
      </Button>
      <div id={panelId} hidden={!open} className="stack" data-walk-groups-body>
        {open && grouping && stats ? (
          <>
            <p>{wgIntro(locale)}</p>
            <ChoiceGroup
              label={wgDistanceGroup(locale)}
              value={String(distance)}
              onChange={(v) => {
                const n = Number(v);
                if (isWalkDistance(n)) setDistance(n);
              }}
              options={WALK_DISTANCES_M.map((d) => ({ value: String(d), label: wgDistanceLabel(d, locale) }))}
            />
            <p aria-live="polite">{wgSummary(stats, locale)}</p>
            {alone ? <p>{alone}</p> : null}
            {left ? <p>{left}</p> : null}
            {grouping.groups.length === 0 ? (
              <p>{noneLine}</p>
            ) : (
              <>
                <ChoiceGroup
                  label={wgFilterGroup(locale)}
                  value={filter}
                  onChange={(v) => {
                    if (isWalkGroupFilter(v)) setFilter(v);
                  }}
                  options={WALK_GROUP_FILTERS.map((f) => ({ value: f, label: wgFilterLabel(f, locale) }))}
                />
                <ChoiceGroup
                  label={wgOrderGroup(locale)}
                  value={order}
                  onChange={(v) => {
                    if (isWalkGroupOrder(v)) setOrder(v);
                  }}
                  options={WALK_GROUP_ORDERS.map((o) => ({ value: o, label: wgOrderLabel(o, locale) }))}
                />
                {listed.length === 0 ? (
                  <p>{wgNoMatch(locale)}</p>
                ) : (
                  <>
                    <ul data-walk-groups-list>
                      {listed.slice(0, WALK_GROUPS_SHOWN).map((g) => {
                        const members = membersByName(g.members);
                        const names = new Map(g.members.map((m) => [m.id, m.name ?? wgNoName(locale)] as const));
                        const analysis = analyseGroup(g, g.distanceM);
                        const apart = analysis ? mostApart(analysis) : null;
                        return (
                          <li key={g.id}>
                            <strong>{wgGroupTitle(nameGroup(g), locale)}</strong>
                            <br />
                            <small>{wgSizeLine(g.members.length, g.spreadM, g.widthM, locale)}</small>
                            <br />
                            <small>{wgTagMix(g.tags, locale)}</small>
                            {g.tags.unknown >= 2 ? (
                              <>
                                <br />
                                <small>{wgUnknownLine(g.tags.unknown, locale)}</small>
                              </>
                            ) : null}
                            {analysis && analysis.links.length > 0 ? (
                              <>
                                <br />
                                <small data-walk-links>{wgLinksLine(analysis.links.map((id) => names.get(id) ?? id), g.distanceM, locale)}</small>
                              </>
                            ) : null}
                            {apart && apart.nearestM !== null && apart.nearestM > 0 ? (
                              <>
                                <br />
                                <small data-walk-apart>{wgApartLine(names.get(apart.id) ?? apart.id, apart.nearestM, locale)}</small>
                              </>
                            ) : null}
                            <ul>
                              {members.slice(0, WALK_MEMBERS_SHOWN).map((m) => (
                                <li key={m.id}>
                                  {m.name ?? wgNoName(locale)}
                                  {m.address ? <small>, {m.address}</small> : null}
                                </li>
                              ))}
                              {members.length > WALK_MEMBERS_SHOWN ? <li>{wgMoreLine(members.length - WALK_MEMBERS_SHOWN, locale)}</li> : null}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                    {listed.length > WALK_GROUPS_SHOWN ? <p>{wgMoreGroups(listed.length - WALK_GROUPS_SHOWN, locale)}</p> : null}
                    <p>{wgCaveat(locale)}</p>
                    <div className="row">
                      <Button variant="secondary" onPress={() => save(groupsTextFile(listed, locale))}>
                        {wgSaveText(locale)}
                      </Button>
                      <Button variant="secondary" onPress={() => save(groupsCsvFile(listed, locale))}>
                        {wgSaveCsv(locale)}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            <p>
              <strong>{wgSweepHeading(locale)}</strong>
            </p>
            <table data-walk-sweep>
              <caption>{wgSweepCaption(locale)}</caption>
              <thead>
                <tr>
                  <th scope="col">{wgSweepColumns(locale).distance}</th>
                  <th scope="col">{wgSweepColumns(locale).groups}</th>
                  <th scope="col">{wgSweepColumns(locale).grouped}</th>
                  <th scope="col">{wgSweepColumns(locale).largest}</th>
                  <th scope="col">{wgSweepColumns(locale).alone}</th>
                </tr>
              </thead>
              <tbody>
                {sweep.map((r) => (
                  <tr key={r.distanceM} aria-current={r.distanceM === distance ? "true" : undefined}>
                    <th scope="row">{wgDistanceLabel(r.distanceM, locale)}</th>
                    <td>{r.groups}</td>
                    <td>{r.grouped}</td>
                    <td>{r.largest}</td>
                    <td>{r.alone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nextLine ? <p data-walk-next>{nextLine}</p> : null}
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
