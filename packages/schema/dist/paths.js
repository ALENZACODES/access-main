import path from "node:path";
import { fileURLToPath } from "node:url";
/** Package root both for src/ (vitest) and dist/ (node). */
export function packageRoot() {
    return fileURLToPath(new URL("..", import.meta.url));
}
export function schemaFile(relative) {
    return path.join(packageRoot(), "schema", relative);
}
export function schemaDir() {
    return path.join(packageRoot(), "schema");
}
//# sourceMappingURL=paths.js.map