// A small CSV reader for the audits. It follows the rules the App's own writer follows: cells are separated by one
// delimiter, rows end with CRLF, a cell that holds the delimiter, a quotation mark or a line break is wrapped in
// quotation marks, and a quotation mark inside a cell is written twice. It reports a file that breaks those rules
// instead of guessing what was meant. Node only, never shipped.

export interface CsvResult {
  rows: string[][];
  /** Problems with the file's form, in order. Empty for a well-formed file. */
  problems: string[];
}

export function parseCsv(text: string, delimiter: string): CsvResult {
  const rows: string[][] = [];
  const problems: string[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStart = true;
  let wasQuoted = false;
  let line = 1;
  const endCell = (): void => {
    row.push(cell);
    cell = "";
    cellStart = true;
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
          const next = text[i + 1];
          if (next !== undefined && next !== delimiter && next !== "\r" && next !== "\n") problems.push(`line ${line}: text after a closing quotation mark`);
        }
      } else {
        if (ch === "\n") line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cellStart) {
      quoted = true;
      cellStart = false;
      wasQuoted = true;
      continue;
    }
    if (ch === '"') {
      problems.push(`line ${line}: a quotation mark inside a cell that is not wrapped in quotation marks`);
      cell += ch;
      cellStart = false;
      continue;
    }
    if (ch === delimiter) {
      endCell();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] !== "\n") problems.push(`line ${line}: a carriage return without a line feed`);
      continue;
    }
    if (ch === "\n") {
      if (text[i - 1] !== "\r") problems.push(`line ${line}: a line ends with a line feed and no carriage return`);
      endCell();
      rows.push(row);
      row = [];
      line += 1;
      continue;
    }
    cell += ch;
    cellStart = false;
  }
  if (quoted) problems.push(`line ${line}: a quotation mark is never closed`);
  if (cell !== "" || row.length > 0 || wasQuoted) {
    problems.push("the file does not end with a line break");
    endCell();
    rows.push(row);
  }
  return { rows, problems };
}
