import { useCallback, useEffect, useRef, useState } from "react";
import { browserStore } from "./useShortlist.ts";
import type { KeyValueStore } from "./submissionQueue.ts";
import { type SetResult, type VisitMark, type VisitStatus, VISIT_MARKS_KEY, clearVisitMark, keepMarksFor, loadVisitMarks, saveVisitMarks, setVisitMark } from "./visitMarks.ts";

export interface VisitMarksState {
  readonly marks: readonly VisitMark[];
  /** False when the marks could not be read from or written to this device: they then last only until the page is closed. */
  readonly kept: boolean;
  set: (id: string, status: VisitStatus) => SetResult;
  clear: (id: string) => void;
  /** Remove marks whose id is not in the set. */
  keepOnly: (ids: ReadonlySet<string>) => void;
}

/** The marks for this device, in the store given (the browser's by default). Changes made in another tab are picked up. */
export function useVisitMarks(today: string, store: KeyValueStore | null = browserStore()): VisitMarksState {
  const initial = useRef(loadVisitMarks(store));
  const [marks, setMarks] = useState<readonly VisitMark[]>(initial.current.marks);
  const [kept, setKept] = useState(initial.current.ok);
  const latest = useRef(marks);
  latest.current = marks;

  const commit = useCallback(
    (next: readonly VisitMark[]) => {
      latest.current = next;
      setMarks(next);
      setKept(saveVisitMarks(store, next));
    },
    [store],
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== VISIT_MARKS_KEY) return;
      const reread = loadVisitMarks(store);
      latest.current = reread.marks;
      setMarks(reread.marks);
      setKept(reread.ok);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  const set = useCallback(
    (id: string, status: VisitStatus): SetResult => {
      const out = setVisitMark(latest.current, id, status, today);
      if (out.result === "set") commit(out.marks);
      return out.result;
    },
    [commit, today],
  );
  const clear = useCallback((id: string) => {
    const next = clearVisitMark(latest.current, id);
    if (next !== latest.current) commit(next);
  }, [commit]);
  const keepOnly = useCallback((ids: ReadonlySet<string>) => {
    const next = keepMarksFor(latest.current, ids);
    if (next !== latest.current) commit(next);
  }, [commit]);
  return { marks, kept, set, clear, keepOnly };
}
