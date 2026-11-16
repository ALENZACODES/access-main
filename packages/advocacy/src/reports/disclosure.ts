/**
 * Cell suppression for one table of counts with published row and column totals.
 *
 * Primary suppression: a count from 1 to minimum - 1 is withheld.
 * Complementary suppression: more cells are withheld until, for every withheld cell, the values
 * that fit the published cells and totals span at least `minimum`. A reader who subtracts
 * published numbers from the totals therefore cannot recover a withheld count, or narrow it to
 * a range smaller than the minimum cell size.
 *
 * The check is exact for a reader who knows the published numbers and that counts are whole and
 * not negative. Withheld cells and totals form a transportation problem, so the smallest and
 * largest value a withheld cell can take are found with two maximum-flow searches.
 */

export interface SuppressionMask {
  /** True where the cell is withheld. Same shape as the counts. */
  suppressed: boolean[][];
  primary: number;
  complementary: number;
}

function cell(matrix: readonly (readonly number[])[], r: number, c: number): number {
  return matrix[r]?.[c] ?? 0;
}

/** Maximum flow from `source` to `sink`, stopping once `enough` is reached. Edmonds-Karp on a dense matrix. */
function maxFlow(capacity: number[][], source: number, sink: number, enough: number): number {
  const n = capacity.length;
  let flow = 0;
  while (flow < enough) {
    const parent = new Array<number>(n).fill(-1);
    parent[source] = source;
    const queue = [source];
    for (let head = 0; head < queue.length && parent[sink] === -1; head += 1) {
      const u = queue[head] ?? 0;
      for (let v = 0; v < n; v += 1) {
        if (parent[v] === -1 && (capacity[u]?.[v] ?? 0) > 0) {
          parent[v] = u;
          queue.push(v);
        }
      }
    }
    if (parent[sink] === -1) break;
    let push = enough - flow;
    for (let v = sink; v !== source; v = parent[v] ?? source) {
      const u = parent[v] ?? source;
      push = Math.min(push, capacity[u]?.[v] ?? 0);
    }
    for (let v = sink; v !== source; v = parent[v] ?? source) {
      const u = parent[v] ?? source;
      const forward = capacity[u];
      const backward = capacity[v];
      if (forward) forward[v] = (forward[v] ?? 0) - push;
      if (backward) backward[u] = (backward[u] ?? 0) + push;
    }
    flow += push;
  }
  return flow;
}

/**
 * How far a withheld cell could move, up and down, while every published cell and total stays
 * as it is. Raising one withheld cell means lowering another in its row, raising another in
 * that cell's column, and so on round a loop; a cell can only be lowered as far as zero.
 * Both distances are capped at `cap`.
 */
export function feasibleSlack(
  counts: readonly (readonly number[])[],
  suppressed: readonly (readonly boolean[])[],
  row: number,
  col: number,
  cap: number,
): { up: number; down: number } {
  const rows = counts.length;
  const cols = counts[0]?.length ?? 0;
  const unbounded = cap + 1;
  const build = (): number[][] => {
    const capacity = Array.from({ length: rows + cols }, () => new Array<number>(rows + cols).fill(0));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!suppressed[r]?.[c] || (r === row && c === col)) continue;
        // Row to column: this cell goes up. Column to row: this cell goes down, at most to zero.
        (capacity[r] as number[])[rows + c] = unbounded;
        (capacity[rows + c] as number[])[r] = cell(counts, r, c);
      }
    }
    return capacity;
  };
  const up = maxFlow(build(), rows + col, row, cap);
  const own = Math.min(cell(counts, row, col), cap);
  const down = own === 0 ? 0 : maxFlow(build(), row, rows + col, own);
  return { up, down };
}

/** Withheld cells whose possible values span less than `minimum`. Empty when the mask is safe. */
export function exposedCells(
  counts: readonly (readonly number[])[],
  suppressed: readonly (readonly boolean[])[],
  minimum: number,
): Array<{ row: number; col: number }> {
  const exposed: Array<{ row: number; col: number }> = [];
  counts.forEach((line, row) => {
    line.forEach((_, col) => {
      if (!suppressed[row]?.[col]) return;
      const { up, down } = feasibleSlack(counts, suppressed, row, col, minimum);
      if (up + down < minimum) exposed.push({ row, col });
    });
  });
  return exposed;
}

/**
 * Choose the cells to withhold. Columns whose total is zero are left alone: their cells are
 * known to be zero from the total, so withholding them would protect nothing.
 *
 * When every row total and every non-zero column total is at least `minimum`, withholding all
 * cells of the non-zero columns always passes the check, so the loop ends with a safe mask.
 * A table that cannot be made safe throws; the caller must not publish it.
 */
export function suppressTable(counts: readonly (readonly number[])[], minimum: number): SuppressionMask {
  const rows = counts.length;
  const cols = counts[0]?.length ?? 0;
  const columnTotal = Array.from({ length: cols }, (_, c) => counts.reduce((sum, line) => sum + (line[c] ?? 0), 0));
  const suppressed = counts.map((line) => line.map((n) => n > 0 && n < minimum));
  const primary = suppressed.flat().filter(Boolean).length;
  let complementary = 0;

  for (;;) {
    const exposed = exposedCells(counts, suppressed, minimum);
    const target = exposed[0];
    if (!target) return { suppressed, primary, complementary };

    let best: { row: number; col: number; rank: number[] } | null = null;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (suppressed[r]?.[c] || columnTotal[c] === 0) continue;
        const n = cell(counts, r, c);
        const rank = [r === target.row || c === target.col ? 0 : 1, n === 0 ? 1 : 0, n, r, c];
        if (!best || compareRank(rank, best.rank) < 0) best = { row: r, col: c, rank };
      }
    }
    if (!best) throw new Error("table cannot be protected by cell suppression");
    (suppressed[best.row] as boolean[])[best.col] = true;
    complementary += 1;
  }
}

function compareRank(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
