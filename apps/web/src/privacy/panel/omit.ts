// Returns a copy of an object without the named keys. Used instead of
// destructuring into unused variables, which the linter rejects.

export function omit<T extends object, K extends keyof T>(source: T, ...keys: readonly K[]): Omit<T, K> {
  const out: Partial<T> = { ...source };
  for (const k of keys) delete out[k];
  return out as Omit<T, K>;
}
