import { Fragment, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PackFootprintProps } from "./PackFootprintLauncher";
import {
  compareFootprintCapacity,
  measureFootprint,
  readFootprintEvidence,
  type FootprintRange,
  type FootprintSelection,
} from "./packFootprint";
import { footprintCopy, type FootprintLanguage } from "./packFootprintCopy";
import { buildFootprintIndex, type FootprintIndex, type FootprintPart } from "./packFootprintIndex";
import { measureRegionOmissions } from "./packFootprintOmissions";
import { DEFAULT_RESERVE_BYTES } from "./quotaPlanning";
import type { StorageEstimate } from "./regionDownload";

const target = { minHeight: 44, minWidth: 44 };
const wrap = { overflowWrap: "anywhere" } as const;
const formats = {
  en: new Intl.NumberFormat("en-CA", { style: "unit", unit: "byte", unitDisplay: "long" }),
  fr: new Intl.NumberFormat("fr-CA", { style: "unit", unit: "byte", unitDisplay: "long" }),
};

function bytes(value: number | null, language: FootprintLanguage) {
  return value === null ? "UNKNOWN" : formats[language].format(value);
}

function Values({ rows }: { rows: ReadonlyArray<readonly [string, string | number]> }) {
  return <dl>{rows.map(([label, value]) => (
    <Fragment key={label}><dt>{label}</dt><dd style={wrap}>{value}</dd></Fragment>
  ))}</dl>;
}

function StorageComparison({ language, range, estimateStorage }: {
  language: FootprintLanguage;
  range: FootprintRange;
  estimateStorage: PackFootprintProps["estimateStorage"];
}) {
  const w = footprintCopy[language];
  const id = useId();
  const [reading, setReading] = useState<StorageEstimate | null>(null);
  const [pending, setPending] = useState(false);
  const result = reading && compareFootprintCapacity(range, reading);
  const labels = {
    "no-transfer": w.noTransfer,
    within: w.within,
    over: w.over,
    uncertain: w.uncertain,
    unknown: w.unknown,
  };

  async function read() {
    setPending(true);
    setReading(null);
    try {
      setReading(await estimateStorage());
    } catch {
      setReading({});
    } finally {
      setPending(false);
    }
  }

  return <section aria-labelledby={id} className="stack">
    <h3 id={id}>{w.storage}</h3>
    <p>{w.estimateHelp}</p>
    <button type="button" style={target} disabled={pending} onClick={() => void read()}>{w.readStorage}</button>
    <p role="status">{pending ? w.reading : result ? labels[result.status] : ""}</p>
    {result && <Values rows={[
      [w.reserve, bytes(DEFAULT_RESERVE_BYTES, language)],
      [w.available, bytes(result.usableBytes, language)],
    ]} />}
  </section>;
}

const sourcePageSize = 5;

function Sources({ language, part }: { language: FootprintLanguage; part: FootprintPart }) {
  const w = footprintCopy[language];
  const [start, setStart] = useState(0);
  const total = part.sources.length;
  const cursor = Math.min(start, Math.max(0, Math.ceil(total / sourcePageSize) - 1) * sourcePageSize);
  const shown = part.sources.slice(cursor, cursor + sourcePageSize);
  return <>
    <h4>{w.sources}</h4>
    {total === 0 ? <p>{w.noSources}</p> : <ul>
      {shown.map(source => (
        <li key={JSON.stringify([source.name, source.licence, source.date])}>
          <Values rows={[[w.source, source.name || "UNKNOWN"], [w.licence, source.licence || "UNKNOWN"], [w.date, source.date || "UNKNOWN"]]} />
        </li>
      ))}
    </ul>}
    {total > sourcePageSize && <div className="button-row">
      <button type="button" style={target} disabled={cursor === 0}
        onClick={() => setStart(cursor - sourcePageSize)}>{w.previousSources}</button>
      <span aria-live="polite">{cursor + 1}–{cursor + shown.length} {w.of} {total}</span>
      <button type="button" style={target} disabled={cursor + sourcePageSize >= total}
        onClick={() => setStart(cursor + sourcePageSize)}>{w.nextSources}</button>
    </div>}
  </>;
}

function PartInspector({ language, index, selection }: {
  language: FootprintLanguage;
  index: FootprintIndex;
  selection: FootprintSelection;
}) {
  const w = footprintCopy[language];
  const id = useId();
  const [sharedOnly, setSharedOnly] = useState(false);
  const [position, setPosition] = useState(0);
  const hashes = useMemo(() => Array.from(sharedOnly ? selection.sharedHashes : selection.hashes),
    [selection, sharedOnly]);
  const cursor = Math.max(0, Math.min(position, hashes.length - 1));
  const hash = hashes[cursor];
  const part = hash && index.parts.get(hash);
  const owners = part ? selection.steps.flatMap(({ regionId }) => {
    const region = index.regions.get(regionId);
    return region?.cellIds.some(cell => index.cells.get(cell)?.hashes.includes(part.hash))
      ? [region.label[language]] : [];
  }) : [];

  return <section aria-labelledby={id} className="stack">
    <h3 id={id}>{w.parts}</h3>
    <label htmlFor={id + "-filter"}>{w.filesFilter}</label>
    <select id={id + "-filter"} style={target} value={sharedOnly ? "shared" : "all"}
      onChange={event => { setSharedOnly(event.target.value === "shared"); setPosition(0); }}>
      <option value="all">{w.allFiles}</option>
      <option value="shared">{w.sharedFiles}</option>
    </select>
    {!part ? <p>{w.emptyFiles}</p> : <>
      <div className="button-row">
        <button type="button" style={target} disabled={cursor === 0}
          onClick={() => setPosition(cursor - 1)}>{w.previousFile}</button>
        <span aria-live="polite">{w.filePosition} {cursor + 1} {w.of} {hashes.length}</span>
        <button type="button" style={target} disabled={cursor + 1 >= hashes.length}
          onClick={() => setPosition(cursor + 1)}>{w.nextFile}</button>
      </div>
      <Values rows={[
        [w.digest, part.hash],
        [w.partSize, bytes(part.bytes, language)],
        [w.owners, owners.join(", ")],
      ]} />
      <Sources key={part.hash} language={language} part={part} />
    </>}
  </section>;
}

export default function PackFootprintPanel({ pack, statuses, language, estimateStorage }: PackFootprintProps) {
  const w = footprintCopy[language];
  const id = useId();
  const index = useMemo(() => buildFootprintIndex(pack), [pack]);
  const evidence = useMemo(() => readFootprintEvidence(index, statuses), [index, statuses]);
  const [order, setOrder] = useState<readonly string[]>([]);
  const selected = useMemo(() => order.filter(key => index.regions.has(key)), [index, order]);
  // A region removed by a pack refresh must be added again if it reappears later.
  if (selected.length !== order.length) setOrder(selected);
  const selection = useMemo(() => measureFootprint(index, evidence, selected), [index, evidence, selected]);
  const omissions = useMemo(() => new Map(measureRegionOmissions(index, evidence, selection)
    .map(item => [item.regionId, item])), [index, evidence, selection]);
  const [choice, setChoice] = useState("");
  const chooser = useRef<HTMLSelectElement>(null);
  const rows = useRef(new Map<string, HTMLHeadingElement>());
  const movedRegion = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (movedRegion.current === null) return;
    rows.current.get(movedRegion.current)?.focus();
    movedRegion.current = null;
  }, [selected]);
  const available = [...index.regions.values()].filter(region => !selected.includes(region.id));
  const nextChoice = available.some(region => region.id === choice) ? choice : "";
  const selectionKey = JSON.stringify(selected);
  const membershipKey = JSON.stringify([...selected].sort());

  function move(at: number, to: number) {
    const region = selected[at];
    if (!region || to < 0 || to >= selected.length) return;
    const result = selected.filter(key => key !== region);
    result.splice(to, 0, region);
    // React may detach and insert this row. Restore focus after the move commits.
    movedRegion.current = region;
    setOrder(result);
  }

  return <section className="panel stack" aria-labelledby={id}>
    <h2 id={id}>{w.title}</h2>
    <p>{w.scope}</p>
    <label htmlFor={id + "-region"}>{w.choose}</label>
    <select id={id + "-region"} ref={chooser} style={target} value={nextChoice}
      aria-describedby={id + "-available"} onChange={event => setChoice(event.target.value)}>
      <option value="">{w.chooseHint}</option>
      {available.map(region => <option key={region.id} value={region.id}>{region.label[language]}</option>)}
    </select>
    <button type="button" style={target} disabled={!nextChoice} onClick={() => {
      if (!nextChoice) return;
      setOrder([...selected, nextChoice]);
      setChoice("");
      chooser.current?.focus();
    }}>{w.add}</button>
    <p id={id + "-available"}>{index.regions.size === 0 ? w.noRegions :
      available.length === 0 ? w.noneAvailable : selected.length === 0 ? w.empty : ""}</p>
    {selected.length > 0 && <>
      <h3 id={id + "-order"}>{w.order}</h3>
      <p>{w.orderHelp}</p>
      <ol aria-labelledby={id + "-order"}>{selection.steps.map((step, at) => {
        const region = index.regions.get(step.regionId)!;
        const name = region.label[language];
        const omitted = omissions.get(region.id)!;
        return <li key={region.id}>
          <h4 tabIndex={-1} ref={element => {
            if (element) rows.current.set(region.id, element);
            else rows.current.delete(region.id);
          }}>{name}</h4>
          <div className="button-row">
            <button type="button" style={target} aria-label={w.earlier + " — " + name}
              disabled={at === 0} onClick={() => move(at, at - 1)}>{w.earlier}</button>
            <button type="button" style={target} aria-label={w.later + " — " + name}
              disabled={at === selected.length - 1} onClick={() => move(at, at + 1)}>{w.later}</button>
            <button type="button" style={target} aria-label={w.remove + " — " + name}
              onClick={() => {
                setOrder(selected.filter(key => key !== region.id));
                setChoice(region.id);
                chooser.current?.focus();
              }}>{w.remove}</button>
          </div>
          <Values rows={[
            [w.ownSize, bytes(step.regionBytes, language)],
            [w.additional, bytes(step.additionalBytes, language)],
            [w.overlaps, step.commonPartCount],
            [w.omitted, bytes(omitted.exclusiveBytes, language)],
            [w.omissionTransfer, bytes(omitted.maximumTransferReduction, language)],
            [w.withheld, region.withheldCount],
          ]} />
        </li>;
      })}</ol>
      <section aria-labelledby={id + "-estimate"} className="stack">
        <h3 id={id + "-estimate"}>{w.summary}</h3>
        <Values rows={[
          [w.footprint, bytes(selection.declaredBytes, language)],
          [w.duplicated, bytes(selection.countedOnceBytes, language)],
          [w.present, bytes(selection.presentBytes, language)],
          [w.minimum, bytes(selection.transfer.minimumBytes, language)],
          [w.maximum, bytes(selection.transfer.maximumBytes, language)],
        ]} />
        <p>{w.uncertainty}</p>
        {evidence.inconsistent && <p>{w.conflict}</p>}
        {selection.declaredBytes === null && <p>{w.incomplete}</p>}
      </section>
      <StorageComparison key={membershipKey} language={language} range={selection.transfer}
        estimateStorage={estimateStorage} />
      <PartInspector key={selectionKey + "-parts"} language={language} index={index} selection={selection} />
    </>}
  </section>;
}
