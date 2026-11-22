import { useEffect, useId, useRef, useState } from "react";
import { panelCopy, type ShellFilter, type ShellLanguage } from "./panelCopy";
import type { ShellReport } from "./probe";
import { readShellReport } from "./read";
import ShellCheckChanges from "./ShellCheckChanges";

type Phase = "idle" | "reading" | "finished" | "cancelled" | "error";
type SnapshotFile = ShellReport["files"][number];
type ReadFiles = (signal: AbortSignal) => Promise<ShellReport>;

const controls = { minWidth: 44, minHeight: 44, maxWidth: "100%" };
const states = ["present", "missing", "unknown"] as const;
const filters = ["all", ...states] as const;
const kinds = ["document", "script", "style", "preload"] as const;

function ShellFileResults({ report, language, current }: {
  report: ShellReport;
  language: ShellLanguage;
  current: boolean;
}) {
  const copy = panelCopy[language];
  const id = useId();
  const [filter, setFilter] = useState<ShellFilter>("all");
  const counts: Record<ShellFilter, number> = {
    all: report.files.length,
    present: 0,
    missing: 0,
    unknown: 0,
  };
  const groups: Record<SnapshotFile["kind"], SnapshotFile[]> = {
    document: [],
    script: [],
    style: [],
    preload: [],
  };
  for (const file of report.files) {
    counts[file.state] += 1;
    if (filter === "all" || filter === file.state) groups[file.kind].push(file);
  }

  return (
    <div className="stack">
      <h3>{current ? copy.resultTitle : copy.earlierTitle}</h3>
      <p>{copy.worker[report.worker]}</p>
      {report.limited && <p><strong>{copy.partial}</strong></p>}
      {report.files.length === 0 ? <p>{copy.empty}</p> : (
        <>
          <div className="stack">
            <label htmlFor={id}>{copy.filter}</label>
            <select
              id={id}
              style={controls}
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value as ShellFilter)}
            >
              {filters.map((option) => (
                <option key={option} value={option}>{copy.options[option]} ({counts[option]})</option>
              ))}
            </select>
          </div>
          <p>{copy.fileCount(counts[filter], counts.all)}</p>
          {counts[filter] === 0 && <p>{copy.emptySelection}</p>}
          {kinds.map((kind) => groups[kind].length > 0 && (
            <div key={kind}>
              <h4 id={`${id}-${kind}`}>{copy.groups[kind]}</h4>
              <ul aria-labelledby={`${id}-${kind}`}>
                {groups[kind].map((file) => (
                  <li key={file.path}>
                    <bdi dir="ltr" style={{ overflowWrap: "anywhere" }}><code>{file.path}</code></bdi>
                    {" — "}{copy.state[file.state]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
      <details>
        <summary style={controls}>{copy.meaning}</summary>
        <dl>
          {states.map((state) => (
            <div key={state}>
              <dt>{copy.state[state]}</dt>
              <dd>{copy.definitions[state]}</dd>
            </div>
          ))}
        </dl>
        <p>{copy.scope}</p>
      </details>
    </div>
  );
}

/** Runs only when the reader asks. A previous completed result stays visible during another check. */
export default function ShellCheckPanel({ language, read = readShellReport }: {
  language: ShellLanguage;
  read?: ReadFiles;
}) {
  const copy = panelCopy[language];
  const [phase, setPhase] = useState<Phase>("idle");
  const [pair, setPair] = useState<{ current: ShellReport; previous: ShellReport | null } | null>(null);
  const report = pair?.current;
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  const check = async () => {
    if (pending.current) {
      pending.current.abort();
      pending.current = null;
      setPhase("cancelled");
      return;
    }

    const controller = new AbortController();
    pending.current = controller;
    setPhase("reading");
    try {
      const result = await read(controller.signal);
      if (controller.signal.aborted) return;
      setPair((last) => ({ current: result, previous: last?.current ?? null }));
      setPhase("finished");
    } catch {
      if (!controller.signal.aborted) setPhase("error");
    } finally {
      // A reader may settle after cancellation and after the next check has begun.
      if (pending.current === controller) pending.current = null;
    }
  };

  const action: Record<Phase, string> = {
    idle: copy.start,
    reading: copy.cancel,
    cancelled: report ? copy.repeat : copy.start,
    error: copy.retry,
    finished: copy.repeat,
  };
  const announcement: Record<Phase, string> = {
    idle: "",
    reading: copy.reading,
    cancelled: copy.cancelled,
    error: copy.error,
    finished: copy.finished(report?.files.length ?? 0),
  };

  return (
    <div className="stack" lang={language}>
      <h2>{copy.title}</h2>
      <p>{copy.intro}</p>
      <div className="button-row">
        <button type="button" style={controls} onClick={() => void check()}>
          {action[phase]}
        </button>
      </div>
      <p role="status" aria-atomic="true">{announcement[phase]}</p>
      {report && <ShellFileResults language={language} report={report} current={phase === "finished"} />}
      {pair?.previous && <ShellCheckChanges previous={pair.previous} current={pair.current} language={language} />}
    </div>
  );
}
