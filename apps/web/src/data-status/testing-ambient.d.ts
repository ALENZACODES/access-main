// Minimal typing for the one Node API the page tests use, so the tests type-check even
// when @types/node is not installed. If @types/node is present, the declarations merge.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
