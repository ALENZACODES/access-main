import { describe, expect, it, vi } from "vitest";
import {
  DownloadQueue,
  type QueueOutcome,
  type QueueSnapshot,
  type QueueStatus,
  type RegionDownload,
} from "./queue";

function queued(...ids: string[]): DownloadQueue {
  const queue = new DownloadQueue();
  for (const id of ids) queue.add(id);
  return queue;
}

function states(queue: DownloadQueue): [string, QueueStatus][] {
  return queue.getSnapshot().entries.map(({ id, status }) => [id, status]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

interface Attempt {
  id: string;
  signal: AbortSignal;
  complete: (outcome: QueueOutcome) => void;
  fail: (reason: unknown) => void;
}

/** Advance one actual transport call at a time without sleeps or mock timers. */
function transport() {
  const attempts: Attempt[] = [];
  const upcoming = new Map<number, ReturnType<typeof deferred<Attempt>>>();
  const download = vi.fn<RegionDownload>((id, signal) => {
    const result = deferred<QueueOutcome>();
    const attempt = { id, signal, complete: result.resolve, fail: result.reject };
    const index = attempts.push(attempt) - 1;
    upcoming.get(index)?.resolve(attempt);
    upcoming.delete(index);
    return result.promise;
  });
  function attempt(index: number): Promise<Attempt> {
    const arrived = attempts[index];
    if (arrived) return Promise.resolve(arrived);
    const waiter = upcoming.get(index) ?? deferred<Attempt>();
    upcoming.set(index, waiter);
    return waiter.promise;
  }
  return { download, attempt, attempts };
}

describe("building a region download queue", () => {
  it("starts with an empty idle snapshot and accepts an empty start", async () => {
    const queue = new DownloadQueue();
    const initial = queue.getSnapshot();
    const notify = vi.fn();
    const download = vi.fn<RegionDownload>();
    queue.subscribe(notify);
    queue.pause();
    await queue.start(download);
    expect(initial).toEqual({ phase: "idle", entries: [] });
    expect(queue.getSnapshot()).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("preserves caller order and exact opaque keys", () => {
    const ids = ["Nord / rive", "nord / rive", "__proto__", "南", " région "];
    const queue = queued(...ids);
    expect(states(queue)).toEqual(ids.map((id) => [id, "pending"]));
    expect(queue.getSnapshot().phase).toBe("idle");
  });

  it.each(["", "  ", "\t", "north\nline", "a\u0000b", "a\u007fb"])(
    "discards an empty or control-bearing id %j", (id) => {
      const queue = queued("lake");
      const initial = queue.getSnapshot();
      queue.add(id);
      expect(queue.getSnapshot()).toBe(initial);
    },
  );

  it("ignores a missing id from an untyped caller without throwing", () => {
    const queue = queued("lake");
    queue.add(undefined as unknown as string);
    expect(states(queue)).toEqual([["lake", "pending"]]);
  });

  it("keeps a single editable row for the same region", () => {
    const queue = queued("west", "east");
    const first = queue.getSnapshot();
    queue.add("west");
    expect(queue.getSnapshot()).toBe(first);
    queue.remove("west");
    queue.add("west");
    expect(states(queue)).toEqual([["east", "pending"], ["west", "pending"]]);
  });

  it("moves one row in either direction without replacing its identity", () => {
    const queue = queued("a", "b", "c", "d");
    const b = queue.getSnapshot().entries[1];
    queue.move("b", 1);
    expect(queue.getSnapshot().entries.map((item) => item.id)).toEqual(["a", "c", "b", "d"]);
    expect(queue.getSnapshot().entries[2]).toBe(b);
    queue.move("b", -1);
    queue.move("b", -1);
    expect(queue.getSnapshot().entries.map((item) => item.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("treats endpoint moves and unknown ids as no-ops", () => {
    const queue = queued("left", "right");
    const initial = queue.getSnapshot();
    const notify = vi.fn();
    queue.subscribe(notify);
    queue.move("left", -1);
    queue.move("right", 1);
    queue.move("third", 1);
    queue.move("third", -1);
    queue.move("left", 2 as 1);
    queue.remove("third");
    queue.clearCompleted();
    expect(queue.getSnapshot()).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
  });

  it("keeps prior snapshots immutable when the list is edited", () => {
    const queue = queued("north");
    const first = queue.getSnapshot();
    queue.add("south");
    expect(first.entries).toEqual([{ id: "north", status: "pending" }]);
    expect(queue.getSnapshot()).not.toBe(first);
    expect(queue.getSnapshot().entries[0]).toBe(first.entries[0]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entries)).toBe(true);
    expect(Object.isFrozen(first.entries[0])).toBe(true);
  });

  it("clearing completed items preserves the ones that still need a download", async () => {
    const queue = queued("one", "two", "three");
    await queue.start(async (id) => id === "one" ? "complete" : "quota");
    const retained = queue.getSnapshot().entries.slice(1);
    queue.clearCompleted();
    expect(states(queue)).toEqual([["two", "quota"], ["three", "pending"]]);
    expect(queue.getSnapshot().entries[0]).toBe(retained[0]);
    expect(queue.getSnapshot().phase).toBe("stopped");
  });

  it("returns to idle when the last selected or completed region is removed", async () => {
    const queue = queued("only");
    queue.remove("only");
    expect(queue.getSnapshot()).toEqual({ phase: "idle", entries: [] });
    queue.add("later");
    await queue.start(async () => "complete");
    queue.clearCompleted();
    expect(queue.getSnapshot()).toEqual({ phase: "idle", entries: [] });
  });

  it("returns to finished when an unresolved item is the only one removed", async () => {
    const queue = queued("done", "not-yet");
    await queue.start(async (id) => id === "done" ? "complete" : "unavailable");
    queue.remove("not-yet");
    expect(queue.getSnapshot().phase).toBe("finished");
    expect(states(queue)).toEqual([["done", "complete"]]);
  });
});

describe("running selected regions", () => {
  it("reserves the first active item immediately but does no work while editing", async () => {
    const queue = queued("lake", "hill");
    const io = transport();
    queue.move("hill", -1);
    const done = queue.start(io.download);
    expect(queue.getSnapshot().phase).toBe("running");
    expect(states(queue)).toEqual([["hill", "active"], ["lake", "pending"]]);
    const first = await io.attempt(0);
    expect(first.id).toBe("hill");
    expect(io.attempts).toHaveLength(1);
    first.complete("complete");
    const second = await io.attempt(1);
    expect(states(queue)).toEqual([["hill", "complete"], ["lake", "active"]]);
    expect(second.id).toBe("lake");
    expect(second.signal).not.toBe(first.signal);
    second.complete("complete");
    await done;
    expect(queue.getSnapshot().phase).toBe("finished");
    expect(states(queue)).toEqual([["hill", "complete"], ["lake", "complete"]]);
  });

  it("never overlaps asynchronous region downloads", async () => {
    const queue = queued("start", "middle", "last");
    const io = transport();
    let inflight = 0;
    let peak = 0;
    const done = queue.start(async (id, signal) => {
      inflight++;
      peak = Math.max(peak, inflight);
      try {
        return await io.download(id, signal);
      } finally {
        inflight--;
      }
    });
    for (const [i, id] of ["start", "middle", "last"].entries()) {
      const current = await io.attempt(i);
      expect(current.id).toBe(id);
      expect(inflight).toBe(1);
      current.complete("complete");
    }
    await done;
    expect(peak).toBe(1);
    expect(inflight).toBe(0);
  });

  it("shares the in-flight promise and transport on consecutive start calls", async () => {
    const queue = queued("one");
    const io = transport();
    const alternate = vi.fn<RegionDownload>().mockResolvedValue("error");
    const first = queue.start(io.download);
    const immediate = queue.start(alternate);
    const current = await io.attempt(0);
    const duringDownload = queue.start(alternate);
    expect(immediate).toBe(first);
    expect(duringDownload).toBe(first);
    current.complete("complete");
    await Promise.all([first, immediate, duringDownload]);
    expect(alternate).not.toHaveBeenCalled();
    expect(io.attempts).toHaveLength(1);
  });

  it("does not restart a finished batch just because a start button is pressed again", async () => {
    const queue = queued("only");
    const download = vi.fn<RegionDownload>().mockResolvedValue("complete");
    await queue.start(download);
    const complete = queue.getSnapshot();
    queue.add("only");
    await queue.start(download);
    expect(queue.getSnapshot()).toBe(complete);
    expect(download).toHaveBeenCalledTimes(1);
    queue.add("fresh");
    expect(queue.getSnapshot().phase).toBe("idle");
    expect(download).toHaveBeenCalledTimes(1);
    await queue.start(download);
    expect(download.mock.calls.map(([id]) => id)).toEqual(["only", "fresh"]);
  });

  it.each(["quota", "unavailable", "interrupted", "error"] as const)(
    "retains %s and waits for an explicit retry before later regions", async (outcome) => {
      const queue = queued("complete", "blocked", "later");
      const download = vi.fn<RegionDownload>()
        .mockResolvedValueOnce("complete")
        .mockResolvedValueOnce(outcome)
        .mockResolvedValue("complete");
      await queue.start(download);
      expect(states(queue)).toEqual([["complete", "complete"], ["blocked", outcome], ["later", "pending"]]);
      expect(queue.getSnapshot().phase).toBe("stopped");
      expect(download.mock.calls.map(([id]) => id)).toEqual(["complete", "blocked"]);
      await queue.start(download);
      expect(download.mock.calls.map(([id]) => id)).toEqual(["complete", "blocked", "blocked", "later"]);
      expect(queue.getSnapshot().phase).toBe("finished");
    },
  );

  it("can remove an unavailable region and continue with the rest of the list", async () => {
    const queue = queued("saved", "removed-from-catalogue", "ready");
    const download = vi.fn<RegionDownload>(async (id) => id === "removed-from-catalogue" ? "unavailable" : "complete");
    await queue.start(download);
    queue.remove("removed-from-catalogue");
    expect(states(queue)).toEqual([["saved", "complete"], ["ready", "pending"]]);
    await queue.start(download);
    expect(download.mock.calls.map(([id]) => id)).toEqual(["saved", "removed-from-catalogue", "ready"]);
  });

  it("reorders an interrupted queue including completed rows without redownloading them", async () => {
    const queue = queued("old", "first", "second");
    await queue.start(async (id) => id === "old" ? "complete" : "interrupted");
    queue.move("second", -1);
    queue.move("second", -1);
    const retry = vi.fn<RegionDownload>().mockResolvedValue("complete");
    await queue.start(retry);
    expect(retry.mock.calls.map(([id]) => id)).toEqual(["second", "first"]);
    expect(states(queue)).toEqual([["second", "complete"], ["old", "complete"], ["first", "complete"]]);
  });

  it("turns a synchronous throw into a stopped entry without leaking the exception", async () => {
    const queue = queued("region");
    const broken: RegionDownload = () => { throw new Error("internal service message"); };
    await expect(queue.start(broken)).resolves.toBeUndefined();
    expect(queue.getSnapshot()).toEqual({ phase: "stopped", entries: [{ id: "region", status: "error" }] });
  });

  it("does not dispatch a later region after an asynchronous rejection", async () => {
    const queue = queued("region", "untouched");
    const io = transport();
    const done = queue.start(io.download);
    const first = await io.attempt(0);
    first.fail(new Error("internal storage error"));
    await expect(done).resolves.toBeUndefined();
    expect(states(queue)).toEqual([["region", "error"], ["untouched", "pending"]]);
    expect(io.attempts).toHaveLength(1);
  });

  it("treats an unrecognized adapter result as a stopped error", async () => {
    const queue = queued("first", "second");
    await queue.start(async () => "ok" as QueueOutcome);
    expect(queue.getSnapshot().phase).toBe("stopped");
    expect(states(queue)).toEqual([["first", "error"], ["second", "pending"]]);
  });

  it("rejects list edits while a download is unsettled", async () => {
    const queue = queued("saved", "running", "waiting");
    const io = transport();
    const done = queue.start(io.download);
    (await io.attempt(0)).complete("complete");
    const active = await io.attempt(1);
    const locked = queue.getSnapshot();
    queue.remove("running");
    queue.remove("waiting");
    queue.add("unselected");
    queue.move("saved", 1);
    queue.move("waiting", -1);
    queue.clearCompleted();
    expect(queue.getSnapshot()).toBe(locked);
    active.complete("quota");
    await done;
    expect(states(queue)).toEqual([["saved", "complete"], ["running", "quota"], ["waiting", "pending"]]);
  });
});

describe("pausing an explicit batch", () => {
  it("supports a pause before the first transport call is dispatched", async () => {
    const queue = queued("first", "second");
    const io = transport();
    const done = queue.start(io.download);
    queue.pause();
    expect(queue.getSnapshot().phase).toBe("pausing");
    await done;
    expect(io.download).not.toHaveBeenCalled();
    expect(queue.getSnapshot().phase).toBe("stopped");
    expect(states(queue)).toEqual([["first", "interrupted"], ["second", "pending"]]);
  });

  it("keeps the edit lock through cancellation until the underlying download settles", async () => {
    const queue = queued("a", "b", "c");
    const io = transport();
    const done = queue.start(io.download);
    const active = await io.attempt(0);
    const onAbort = vi.fn();
    active.signal.addEventListener("abort", onAbort);
    queue.pause();
    const pausing = queue.getSnapshot();
    expect(pausing.phase).toBe("pausing");
    expect(active.signal.aborted).toBe(true);
    queue.pause();
    queue.remove("a");
    queue.move("c", -1);
    queue.clearCompleted();
    queue.add("extra");
    expect(queue.getSnapshot()).toBe(pausing);
    expect(queue.start(io.download)).toBe(done);
    expect(onAbort).toHaveBeenCalledTimes(1);
    active.complete("interrupted");
    await done;
    expect(io.attempts).toHaveLength(1);
    expect(states(queue)).toEqual([["a", "interrupted"], ["b", "pending"], ["c", "pending"]]);
    queue.remove("a");
    expect(states(queue)).toEqual([["b", "pending"], ["c", "pending"]]);
  });

  it("keeps a completed region when pause races with its final commit", async () => {
    const queue = queued("first", "second");
    const io = transport();
    const done = queue.start(io.download);
    const first = await io.attempt(0);
    first.complete("complete");
    queue.pause();
    await done;
    expect(queue.getSnapshot().phase).toBe("stopped");
    expect(states(queue)).toEqual([["first", "complete"], ["second", "pending"]]);
    expect(io.attempts).toHaveLength(1);
    const resume = queue.start(io.download);
    const second = await io.attempt(1);
    expect(second.id).toBe("second");
    expect(second.signal.aborted).toBe(false);
    second.complete("complete");
    await resume;
    expect(queue.getSnapshot().phase).toBe("finished");
  });

  it("finishes when the last committed download settles after the pause", async () => {
    const queue = queued("last");
    const io = transport();
    const done = queue.start(io.download);
    const last = await io.attempt(0);
    queue.pause();
    last.complete("complete");
    await done;
    expect(queue.getSnapshot().phase).toBe("finished");
    expect(states(queue)).toEqual([["last", "complete"]]);
    const snapshot = queue.getSnapshot();
    queue.pause();
    expect(queue.getSnapshot()).toBe(snapshot);
  });

  it("marks a rejected aborted download as interrupted, preserving saved rows", async () => {
    const queue = queued("one", "two", "three");
    const io = transport();
    const done = queue.start(io.download);
    const first = await io.attempt(0);
    first.complete("complete");
    const second = await io.attempt(1);
    queue.pause();
    expect(first.signal.aborted).toBe(false);
    expect(second.signal.aborted).toBe(true);
    second.fail(new DOMException("Stopped", "AbortError"));
    await done;
    expect(states(queue)).toEqual([["one", "complete"], ["two", "interrupted"], ["three", "pending"]]);
  });

  it("preserves a specific reported quota outcome during a pause", async () => {
    const queue = queued("one", "two");
    const io = transport();
    const done = queue.start(io.download);
    const first = await io.attempt(0);
    queue.pause();
    first.complete("quota");
    await done;
    expect(states(queue)).toEqual([["one", "quota"], ["two", "pending"]]);
  });
});

describe("queue subscriptions and lifecycle boundaries", () => {
  it("supports detached read and subscribe methods for external-store consumers", () => {
    const queue = queued("one");
    const read = queue.getSnapshot;
    const listen = queue.subscribe;
    const snapshots: QueueSnapshot[] = [];
    const unsubscribe = listen(() => snapshots.push(read()));
    queue.add("two");
    expect(snapshots).toEqual([read()]);
    unsubscribe();
    unsubscribe();
    queue.remove("two");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.entries).toHaveLength(2);
  });

  it("publishes complete ordered snapshots without parallel active rows", async () => {
    const queue = queued("lake", "hill");
    const snapshots: QueueSnapshot[] = [];
    queue.subscribe(() => snapshots.push(queue.getSnapshot()));
    await queue.start(async () => "complete");
    expect(snapshots.map(({ phase, entries }) => [phase, entries.map((item) => item.status)])).toEqual([
      ["running", ["active", "pending"]],
      ["running", ["complete", "active"]],
      ["finished", ["complete", "complete"]],
    ]);
    expect(snapshots[0]?.entries[1]?.id).toBe("hill");
  });

  it("removes exactly the requested subscription when two share a callback", () => {
    const queue = new DownloadQueue();
    const notify = vi.fn();
    const first = queue.subscribe(notify);
    const second = queue.subscribe(notify);
    queue.add("one");
    expect(notify).toHaveBeenCalledTimes(2);
    first();
    first();
    queue.add("two");
    expect(notify).toHaveBeenCalledTimes(3);
    second();
    queue.add("three");
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("honors unsubscribe and replacement subscription during a notification", () => {
    const queue = new DownloadQueue();
    const previous = vi.fn();
    const replacement = vi.fn();
    const offFirst = queue.subscribe(() => {
      offFirst();
      offPrevious();
      queue.subscribe(replacement);
    });
    const offPrevious = queue.subscribe(previous);
    queue.add("one");
    expect(previous).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    queue.add("two");
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  it("blocks a second transport started synchronously by a listener", async () => {
    const queue = queued("one");
    const alternate = vi.fn<RegionDownload>().mockResolvedValue("error");
    const first = vi.fn<RegionDownload>().mockResolvedValue("complete");
    const runs: Promise<void>[] = [];
    queue.subscribe(() => {
      if (queue.getSnapshot().phase === "running") runs.push(queue.start(alternate));
    });
    const done = queue.start(first);
    expect(runs).toEqual([done]);
    await done;
    expect(first).toHaveBeenCalledTimes(1);
    expect(alternate).not.toHaveBeenCalled();
  });

  it("can stop from an announced boundary before issuing the next request", async () => {
    const queue = queued("first", "second", "third");
    const download = vi.fn<RegionDownload>().mockResolvedValue("complete");
    queue.subscribe(() => {
      const state = queue.getSnapshot();
      if (state.phase === "running" && state.entries[1]?.status === "active") queue.pause();
    });
    await queue.start(download);
    expect(download.mock.calls.map(([id]) => id)).toEqual(["first"]);
    expect(states(queue)).toEqual([["first", "complete"], ["second", "interrupted"], ["third", "pending"]]);
  });

  it("releases the old reservation before reporting failure to a listener", async () => {
    const queue = queued("first", "second");
    const io = transport();
    let resumed: Promise<void> | undefined;
    const unsubscribe = queue.subscribe(() => {
      if (queue.getSnapshot().phase === "stopped") {
        unsubscribe();
        resumed = queue.start(io.download);
      }
    });
    const firstRun = queue.start(io.download);
    (await io.attempt(0)).complete("quota");
    await firstRun;
    expect(resumed).toBeDefined();
    const retry = await io.attempt(1);
    expect(queue.start(io.download)).toBe(resumed);
    expect(retry.id).toBe("first");
    retry.complete("complete");
    (await io.attempt(2)).complete("complete");
    await resumed;
    expect(queue.getSnapshot().phase).toBe("finished");
  });
});
