/** Character-class checks written with code points, so no control character sits in a pattern. */

/** True when the text holds a C0 control character or DEL. Tab, line feed and carriage return are allowed unless `strict`. */
export function hasControlCharacter(value: string, options: { strict?: boolean; c1?: boolean } = {}): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      if (options.strict) return true;
      continue;
    }
    if (code <= 0x1f || code === 0x7f) return true;
    if (options.c1 && code >= 0x80 && code <= 0x9f) return true;
  }
  return false;
}
