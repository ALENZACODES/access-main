/** True for a real calendar day written YYYY-MM-DD. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Whole days from `earlierIso` to `laterIso`. Both must be real YYYY-MM-DD dates. */
export function daysBetween(laterIso: string, earlierIso: string): number {
  return Math.round((Date.parse(`${laterIso}T00:00:00Z`) - Date.parse(`${earlierIso}T00:00:00Z`)) / 86_400_000);
}
