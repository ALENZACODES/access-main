// A word-by-word comparison of two texts, for showing a person what changed in a wording they agreed to. It keeps
// the longest run of words both texts share and reports the rest as removed or added, in reading order. Spaces,
// including the no-break spaces French uses, are kept inside the words they touch so the result can be joined
// back into the same text.

export type DiffKind = "same" | "removed" | "added";

export interface DiffSegment {
  kind: DiffKind;
  text: string;
}

/** Words with their trailing space, so joining the words gives back the text. */
export function words(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

const bare = (w: string): string => w.replace(/\s+$/, "");

export function diffWords(before: string, after: string): DiffSegment[] {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;
  // lengths[i][j]: the longest shared run of a[i..] and b[j..]
  const lengths: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const row = lengths[i] as number[];
      row[j] = bare(a[i] ?? "") === bare(b[j] ?? "") ? ((lengths[i + 1] as number[])[j + 1] ?? 0) + 1 : Math.max((lengths[i + 1] as number[])[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const out: DiffSegment[] = [];
  const push = (kind: DiffKind, text: string): void => {
    const last = out[out.length - 1];
    if (last !== undefined && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (bare(a[i] ?? "") === bare(b[j] ?? "")) {
      push("same", b[j] ?? "");
      i += 1;
      j += 1;
    } else if (((lengths[i + 1] as number[])[j] ?? 0) >= ((lengths[i] as number[])[j + 1] ?? 0)) {
      push("removed", a[i] ?? "");
      i += 1;
    } else {
      push("added", b[j] ?? "");
      j += 1;
    }
  }
  while (i < n) push("removed", a[i++] ?? "");
  while (j < m) push("added", b[j++] ?? "");
  return out;
}

/** True when the two texts differ in any word. Spacing alone is not a change. */
export function hasChange(before: string, after: string): boolean {
  return diffWords(before, after).some((s) => s.kind !== "same");
}

/** The text of a comparison with only the kind asked for left out: `"removed"` gives the earlier text, `"added"` the later. */
export function sideOf(segments: readonly DiffSegment[], side: "before" | "after"): string {
  return segments
    .filter((s) => s.kind === "same" || s.kind === (side === "before" ? "removed" : "added"))
    .map((s) => s.text)
    .join("");
}
