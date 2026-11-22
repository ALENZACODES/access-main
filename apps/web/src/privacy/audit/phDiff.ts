// Sets a JPEG before and after it was prepared for sharing. A good preparation removes what the file says about the
// person or the place and nothing else: the tables, the frame header and the picture data stay byte for byte, in the
// same order, and the result is still a whole file.

import { auditJpeg, formatPhFinding } from "./phRules";
import type { PhFinding } from "./phRules";
import { isMetadataMarker, isWholeJpeg, parseJpeg, scanBytes, segmentsOf } from "./phJpeg";

export type DiffCode = "scan-changed" | "segment-lost" | "segment-changed" | "segment-added" | "metadata-left" | "not-whole" | "trailer-left" | "order-changed";

export interface DiffProblem {
  code: DiffCode;
  detail: string;
}

export interface StripDiff {
  /** The names of the segments that were removed, with how many of each. */
  removed: Record<string, number>;
  /** The names of the segments that are in both files. */
  kept: string[];
  problems: DiffProblem[];
  /** What the file after still says. */
  leaks: PhFinding[];
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function compareStrip(before: Uint8Array, after: Uint8Array): StripDiff {
  const pb = parseJpeg(before);
  const pa = parseJpeg(after);
  const problems: DiffProblem[] = [];
  const keepBefore = segmentsOf(pb).filter((s) => !isMetadataMarker(s.marker));
  const keepAfter = segmentsOf(pa).filter((s) => !isMetadataMarker(s.marker));
  const removed: Record<string, number> = {};
  for (const s of segmentsOf(pb)) if (isMetadataMarker(s.marker)) removed[s.name] = (removed[s.name] ?? 0) + 1;
  for (const s of segmentsOf(pa)) if (isMetadataMarker(s.marker)) removed[s.name] = (removed[s.name] ?? 0) - 1;
  for (const k of Object.keys(removed)) if ((removed[k] as number) <= 0) delete removed[k];

  if (!isWholeJpeg(pa)) problems.push({ code: "not-whole", detail: "the file after is not a whole JPEG" });
  if (!same(scanBytes(before, pb), scanBytes(after, pa))) problems.push({ code: "scan-changed", detail: "the picture data is not the same" });
  let i = 0;
  let j = 0;
  while (i < keepBefore.length || j < keepAfter.length) {
    const b = keepBefore[i];
    const a = keepAfter[j];
    if (b === undefined) {
      problems.push({ code: "segment-added", detail: a?.name ?? "?" });
      j++;
    } else if (a === undefined) {
      problems.push({ code: "segment-lost", detail: b.name });
      i++;
    } else if (a.marker === b.marker) {
      if (!same(a.payload, b.payload)) problems.push({ code: "segment-changed", detail: b.name });
      i++;
      j++;
    } else if (keepBefore.slice(i + 1).some((s) => s.marker === a.marker)) {
      problems.push({ code: "segment-lost", detail: b.name });
      i++;
    } else if (keepAfter.slice(j + 1).some((s) => s.marker === b.marker)) {
      problems.push({ code: "segment-added", detail: a.name });
      j++;
    } else {
      problems.push({ code: "order-changed", detail: `${b.name} became ${a.name} at place ${i}` });
      i++;
      j++;
    }
  }
  const leaks = auditJpeg(after);
  for (const f of leaks) problems.push({ code: f.code === "ph-trailer" ? "trailer-left" : "metadata-left", detail: formatPhFinding(f) });
  return { removed, kept: keepAfter.map((s) => s.name), problems, leaks };
}

export function formatDiffProblem(p: DiffProblem): string {
  return `${p.code}: ${p.detail}`;
}
