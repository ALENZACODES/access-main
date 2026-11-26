import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { DownloadQueue, type QueueOutcome } from "./queue";
import { queueCopy, type QueueLanguage } from "./queueCopy";

export interface QueuePanelProps {
  language: QueueLanguage;
  regions: readonly { id: string; label: string; downloaded: boolean }[];
  online: boolean;
  busy: boolean;
  runBatch: (task: () => Promise<void>) => Promise<boolean>;
  download: (id: string, signal: AbortSignal) => Promise<QueueOutcome>;
}

const target = { minHeight: 44, minWidth: 44 };
type FocusTarget = { id: string } | "picker";

function regionChoices(regions: QueuePanelProps["regions"]) {
  const choices = new Map<string, { label: string; downloaded: boolean }>();
  const counts = new Map<string, number>();
  for (const region of regions) {
    if (!region.id.trim() || choices.has(region.id)) continue;
    const label = region.label.trim() || region.id;
    choices.set(region.id, { label, downloaded: region.downloaded });
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  for (const [id, region] of choices) {
    if (counts.get(region.label)! > 1) region.label = `${region.label} (${id})`;
  }
  return choices;
}

export default function DownloadQueuePanel(props: QueuePanelProps) {
  const { language, regions, online, busy, runBatch } = props;
  const c = queueCopy[language];
  const titleId = useId();
  const pickerId = useId();
  const [queue] = useState(() => new DownloadQueue());
  const { entries, phase } = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const [selected, setSelected] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [issue, setIssue] = useState<"occupied" | "startError" | null>(null);
  const live = useRef(props);
  const admission = useRef<{ cancelled: boolean } | null>(null);
  const focusTarget = useRef<FocusTarget | null>(null);
  const picker = useRef<HTMLSelectElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const rowNames = useRef(new Map<string, HTMLElement>());

  useLayoutEffect(() => {
    live.current = props;
    if (!props.online) {
      if (admission.current) admission.current.cancelled = true;
      queue.pause();
    }
  }, [props, queue]);

  useLayoutEffect(() => () => {
    if (admission.current) admission.current.cancelled = true;
    admission.current = null;
    queue.pause();
  }, [queue]);

  useLayoutEffect(() => {
    const next = focusTarget.current;
    if (!next) return;
    focusTarget.current = null;
    const region = next !== "picker" ? rowNames.current.get(next.id) : undefined;
    const destination = region ?? (picker.current?.disabled ? title.current : picker.current);
    destination?.focus();
  }, [entries]);

  const choices = regionChoices(regions);
  const queued = new Set(entries.map((row) => row.id));
  const available = [...choices].filter(([id, region]) => !region.downloaded && !queued.has(id));
  const selection = available.some(([id]) => id === selected) ? selected : "";
  const name = (id: string) => choices.get(id)?.label ?? id;
  const saved = entries.filter((row) => row.status === "complete").length;
  const active = phase === "running" || phase === "pausing";
  const locked = requesting || active;
  const activeRow = entries.find((row) => row.status === "active");
  const stopped = entries.find((row) => row.status !== "complete" && row.status !== "pending" && row.status !== "active");

  function add() {
    if (!selection || locked) return;
    focusTarget.current = available.length > 1 ? "picker" : { id: selection };
    setSelected("");
    setIssue(null);
    queue.add(selection);
  }

  function move(id: string, delta: -1 | 1) {
    focusTarget.current = { id };
    setIssue(null);
    queue.move(id, delta);
  }

  function remove(index: number) {
    const row = entries[index];
    if (!row) return;
    const adjacent = entries[index + 1] ?? entries[index - 1];
    focusTarget.current = adjacent ? { id: adjacent.id } : "picker";
    setIssue(null);
    queue.remove(row.id);
  }

  function removeSaved() {
    const remaining = entries.find((row) => row.status !== "complete");
    focusTarget.current = remaining ? { id: remaining.id } : "picker";
    setIssue(null);
    queue.clearCompleted();
  }

  async function start() {
    if (admission.current || busy || !online || saved === entries.length) return;
    const attempt = { cancelled: false };
    admission.current = attempt;
    setRequesting(true);
    setIssue(null);
    try {
      const accepted = await runBatch(async () => {
        if (attempt.cancelled || admission.current !== attempt) return;
        await queue.start(async (id, signal) => {
          if (signal.aborted || !live.current.online) return "interrupted";
          if (!live.current.regions.some((item) => item.id === id)) return "unavailable";
          // Another region can supply all the bytes while this region still needs its own references.
          return live.current.download(id, signal);
        });
      });
      if (!accepted && admission.current === attempt && !attempt.cancelled) setIssue("occupied");
    } catch {
      if (admission.current === attempt && !attempt.cancelled) setIssue("startError");
    } finally {
      if (admission.current === attempt) {
        admission.current = null;
        setRequesting(false);
      }
    }
  }

  function summary(): string {
    if (issue) return c[issue];
    if (phase === "pausing") return c.pausing;
    if (activeRow) return `${c.active(name(activeRow.id))} ${c.savedCount(saved, entries.length)}`;
    if (phase === "stopped") {
      if (stopped) return `${c.stopped(name(stopped.id))} ${c.outcomes[stopped.status]}`;
      return c.paused;
    }
    if (phase === "finished") return `${c.closed} ${c.savedCount(saved, entries.length)}`;
    if (requesting) return c.waiting;
    return c.ready(entries.length);
  }

  return (
    <section className="stack" aria-labelledby={titleId} lang={language}>
      <h2 id={titleId} ref={title} tabIndex={-1}>{c.title}</h2>
      <p>{c.introduction}</p>
      <p>{c.session}</p>
      <div className="stack">
        <label htmlFor={pickerId}>{c.picker}</label>
        <select id={pickerId} ref={picker} value={selection} disabled={locked || !available.length}
          style={target} onChange={(event) => setSelected(event.currentTarget.value)}>
          <option value="">{c.choose}</option>
          {available.map(([id, region]) => <option key={id} value={id}>{region.label}</option>)}
        </select>
        <div>
          <button type="button" style={target} disabled={!selection || locked} onClick={add}>{c.add}</button>
        </div>
      </div>
      {!available.length && <p>{choices.size ? c.allListed : c.noCatalog}</p>}
      {entries.length > 0 && (
        <ol aria-label={c.list} className="stack">
          {entries.map((row, index) => (
            <li key={row.id}>
              <strong tabIndex={-1} ref={(node) => {
                if (node) rowNames.current.set(row.id, node);
                else rowNames.current.delete(row.id);
              }}>{name(row.id)}</strong>
              {" — "}{c.outcomes[row.status]}
              {!choices.has(row.id) && <p>{c.absent}</p>}
              <div className="button-row">
                <button type="button" style={target} aria-label={c.moveUp(name(row.id))}
                  disabled={locked || index === 0} onClick={() => move(row.id, -1)}>{c.up}</button>
                <button type="button" style={target} aria-label={c.moveDown(name(row.id))}
                  disabled={locked || index === entries.length - 1} onClick={() => move(row.id, 1)}>{c.down}</button>
                <button type="button" style={target} aria-label={c.remove(name(row.id))}
                  disabled={locked} onClick={() => remove(index)}>{c.removeLabel}</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!online && <p>{c.offline}</p>}
      {busy && !locked && issue !== "occupied" && <p>{c.occupied}</p>}
      <p role="status" aria-label={c.statusLabel} aria-atomic="true">{summary()}</p>
      <div className="button-row">
        <button type="button" style={target}
          disabled={active ? phase === "pausing" : locked || !online || busy || saved === entries.length}
          onClick={() => { if (active) queue.pause(); else void start(); }}>
          {active ? (phase === "pausing" ? c.pausing : c.pause) : (phase === "stopped" ? c.resume : c.start)}
        </button>
        {saved > 0 && <button type="button" style={target} disabled={locked} onClick={removeSaved}>{c.clearCompleted}</button>}
      </div>
    </section>
  );
}
