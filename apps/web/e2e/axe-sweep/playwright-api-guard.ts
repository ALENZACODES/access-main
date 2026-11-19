/**
 * Catch runner-incompatible APIs in Playwright specs before CI spends time
 * starting Chromium. Parsing the source avoids false positives in comments,
 * documentation and string literals.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as ts from "typescript";

export interface ApiFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly call: string;
}

const PLAYWRIGHT_FACTORIES = new Set(["test", "describe"]);
const UNSUPPORTED = new Set(["each", "skipIf", "runIf", "concurrent", "fails"]);

/** Extract the root identifier of a chained property access. */
function rootName(value: ts.Expression): string | null {
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isPropertyAccessExpression(value)) return rootName(value.expression);
  return null;
}

/** Inspect actual executable property calls, rather than matching comment text. */
export function incompatiblePlaywrightCalls(source: string, file: string): ApiFinding[] {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: ApiFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const access = node.expression;
      const root = rootName(access.expression);
      if (root !== null && PLAYWRIGHT_FACTORIES.has(root) && UNSUPPORTED.has(access.name.text)) {
        const position = ast.getLineAndCharacterOfPosition(access.getStart(ast));
        findings.push({
          file,
          line: position.line + 1,
          column: position.character + 1,
          call: `${root}.${access.name.text}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
}

/** Only source specs, never generated output or fixtures outside e2e. */
export function playwrightSpecPaths(root: string): string[] {
  const output: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") walk(path);
      } else if (entry.isFile() && /\.spec\.[cm]?[jt]sx?$/.test(entry.name)) {
        output.push(path);
      }
    }
  };
  walk(root);
  return output.sort();
}

export function auditPlaywrightSpecs(root: string): ApiFinding[] {
  return playwrightSpecPaths(root).flatMap((file) =>
    incompatiblePlaywrightCalls(readFileSync(file, "utf8"), relative(root, file)));
}
