// Names the App must never carry (an outside organisation). They are held as
// SHA-256 hashes of the lower-case words, so no source file contains the names
// themselves: the audit can find them without being a place that spells them.

export interface NameHash {
  /** SHA-256 of the lower-case text */
  hash: string;
  /** How many words make up the name */
  words: number;
  /** Length of the name with single spaces between words. Only text of this length is hashed. */
  length: number;
  /** When true, the name also counts inside a longer word. */
  insideWord?: boolean;
}

export const NAME_HASHES: readonly NameHash[] = [
  { hash: "d76be7ea6361cee82318f32ffd6fa994963ecf939f9a3d5b80da75bf4de8b057", words: 1, length: 4 },
  { hash: "c95144311464a7838a641de6cd661efe0a33114f3140904895eae73feebb7526", words: 1, length: 10, insideWord: true },
  { hash: "d6ee076a485c74811d7141808ebaa14deb934e1c8d40a7d3bf226d9b7f84581f", words: 4, length: 26 },
];
