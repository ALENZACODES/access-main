/** An address from a pack, kept only when it is a plain https address with a host. */
export function readHttpsLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s.length > 500 || !/^https:\/\/[^\s/?#]+[^\s]*$/.test(s)) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}
