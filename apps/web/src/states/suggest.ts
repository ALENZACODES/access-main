/**
 * "Did you mean" ranking for empty search results (EN and FR).
 *
 * Pure and offline: it compares what the person typed with names that are
 * already on this device. It never guesses an accessibility fact; it only
 * proposes other words to search for. Text is folded before comparing, so
 * "cafe" finds "Café", "ecole" finds "École" and a curly apostrophe matches a
 * straight one.
 */

/** Longest query or label that is compared. Longer text is cut, never rejected. */
export const MAX_QUERY_CHARS = 80;
export const MAX_LABEL_CHARS = 120;
/** At most this many candidates are scanned per call, so a huge pack cannot stall the page. */
export const MAX_CANDIDATES = 5000;
export const DEFAULT_LIMIT = 3;

const LIGATURES: Readonly<Record<string, string>> = { œ: "oe", æ: "ae", ß: "ss", ø: "o", đ: "d", ł: "l" };

/**
 * Lower-case, accent-free, letters and digits only, single spaces.
 * "L’Île-d’Or" → "l ile d or".
 */
export function foldText(input: string): string {
  const lower = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let out = "";
  for (const ch of lower) out += LIGATURES[ch] ?? ch;
  return out.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

/** Words of already-folded text. */
export function tokens(folded: string): string[] {
  return folded === "" ? [] : folded.split(" ");
}

/**
 * Edit distance counting an adjacent swap as one edit (optimal string alignment).
 * Stops early and returns max + 1 once the distance must exceed max.
 */
export function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m <= max ? m : max + 1;
  if (m === 0) return n <= max ? n : max + 1;
  let prev2: number[] = new Array<number>(m + 1).fill(0);
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const cur: number[] = new Array<number>(m + 1).fill(0);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2]! + 1);
      }
      cur[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  const result = prev[m]!;
  return result > max ? max + 1 : result;
}

/** Edits allowed for a word of this length: none for very short words, so "bar" never becomes "car". */
export function allowedEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

export interface Candidate<T = string> {
  /** Stable key, used only to break ties the same way every time. */
  readonly key: string;
  readonly label: string;
  readonly value: T;
}

export interface Suggestion<T = string> {
  readonly key: string;
  readonly label: string;
  readonly value: T;
  /** Lower is closer. 0 means the folded text is identical. */
  readonly score: number;
}

export interface SuggestOptions {
  readonly limit?: number;
  /** Candidates identical to the query are left out by default, since the person already searched for them. */
  readonly includeExact?: boolean;
}

function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Score of one candidate for one query, or null when it is not close enough to suggest. */
export function scoreCandidate(queryFolded: string, labelFolded: string): number | null {
  if (queryFolded === "" || labelFolded === "") return null;
  if (queryFolded === labelFolded) return 0;
  if (labelFolded.startsWith(queryFolded)) return 1;
  if (` ${labelFolded} `.includes(` ${queryFolded} `)) return 2;
  if (labelFolded.includes(queryFolded) && queryFolded.length >= 3) return 3;

  const q = tokens(queryFolded);
  const l = tokens(labelFolded);
  // Every query word must match some word of the label, exactly, as a prefix, or within the allowed edits.
  let total = 0;
  for (const word of q) {
    let best = Number.POSITIVE_INFINITY;
    for (const other of l) {
      if (other === word) { best = 0; break; }
      if (word.length >= 3 && other.startsWith(word)) { best = Math.min(best, 0.5); continue; }
      const limit = allowedEdits(word.length);
      if (limit === 0) continue;
      const d = boundedDistance(word, other, limit);
      if (d <= limit) best = Math.min(best, d);
    }
    if (!Number.isFinite(best)) return null;
    total += best;
  }
  return 4 + total;
}

/**
 * The closest candidates to what was typed, best first. The order is the same on
 * every run: score, then shorter label, then folded label, then key.
 */
export function suggest<T>(query: string, candidates: readonly Candidate<T>[], options: SuggestOptions = {}): Suggestion<T>[] {
  const limit = Math.max(0, Math.min(options.limit ?? DEFAULT_LIMIT, 20));
  const folded = foldText(cap(query, MAX_QUERY_CHARS));
  if (limit === 0 || folded === "") return [];
  const seen = new Set<string>();
  const scored: Array<Suggestion<T> & { readonly folded: string }> = [];
  const count = Math.min(candidates.length, MAX_CANDIDATES);
  for (let i = 0; i < count; i += 1) {
    const candidate = candidates[i]!;
    const label = cap(candidate.label.trim(), MAX_LABEL_CHARS);
    const labelFolded = foldText(label);
    if (labelFolded === "" || seen.has(labelFolded)) continue;
    const score = scoreCandidate(folded, labelFolded);
    if (score === null) continue;
    if (score === 0 && !options.includeExact) continue;
    seen.add(labelFolded);
    scored.push({ key: candidate.key, label, value: candidate.value, score, folded: labelFolded });
  }
  scored.sort((x, y) =>
    x.score - y.score
    || x.label.length - y.label.length
    || (x.folded < y.folded ? -1 : x.folded > y.folded ? 1 : 0)
    || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return scored.slice(0, limit).map(({ key, label, value, score }) => ({ key, label, value, score }));
}
