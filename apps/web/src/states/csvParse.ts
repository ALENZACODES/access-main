/**
 * A small CSV reader for files the App wrote itself (RFC 4180 quoting, CRLF or LF line ends, an
 * optional byte order mark). It is strict about quotes: a quote that never closes is an error, not a guess.
 *
 * csvCell in exportData.ts prefixes a cell that starts with = + - @ tab or CR with an apostrophe so
 * a spreadsheet cannot read it as a formula. readCsvCell undoes exactly that, so a file read back
 * gives the original text.
 */

export const MAX_CSV_BYTES = 5_000_000;
export const MAX_CSV_ROWS = 100_000;

export type CsvError = "too-large" | "too-many-rows" | "unterminated-quote";

export type CsvResult =
  | { readonly ok: true; readonly rows: readonly (readonly string[])[] }
  | { readonly ok: false; readonly error: CsvError };

/** Undo the apostrophe that csvCell adds before a formula character. Anything else is left alone. */
export function undoFormulaGuard(cell: string): string {
  return /^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell;
}

export function parseCsv(input: string): CsvResult {
  if (new TextEncoder().encode(input).length > MAX_CSV_BYTES) return { ok: false, error: "too-large" };
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStarted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    // A line with one empty cell is a blank line, not a row.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
    } else if (ch === ",") endCell();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
      if (rows.length > MAX_CSV_ROWS) return { ok: false, error: "too-many-rows" };
    } else {
      cell += ch;
      cellStarted = true;
    }
  }
  if (quoted) return { ok: false, error: "unterminated-quote" };
  if (cellStarted || cell !== "" || row.length > 0) endRow();
  if (rows.length > MAX_CSV_ROWS) return { ok: false, error: "too-many-rows" };
  return { ok: true, rows };
}
