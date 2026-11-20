/** The id rule the pack uses: non-empty, at most 200 characters, no spaces or control characters. */
// eslint-disable-next-line no-control-regex -- ids may not hold control characters or spaces
const BAD = /[\u0000-\u001F\u007F\s]/;

export function isShortId(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !BAD.test(value);
}
