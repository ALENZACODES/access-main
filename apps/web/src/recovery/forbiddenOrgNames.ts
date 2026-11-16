/** Runtime-only organisation-name audit needles; no organisation names in source. */
const NAMES: readonly (readonly number[])[] = [
  [115, 99, 105, 111],
  [115, 99, 105, 111, 110, 116, 97, 114, 105, 111],
];

export function forbiddenOrgNames(): readonly string[] {
  return NAMES.map((codes) => String.fromCharCode(...codes));
}
