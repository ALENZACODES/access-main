import path from "node:path";
import { fileURLToPath } from "node:url";

/** Package root both for src/ (vitest) and dist/ (node). */
export function packageRoot(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

export function schemaFile(relative: string): string {
  return path.join(packageRoot(), "schema", relative);
}

export function schemaDir(): string {
  return path.join(packageRoot(), "schema");
}
