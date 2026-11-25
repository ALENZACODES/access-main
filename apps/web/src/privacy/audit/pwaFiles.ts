// Reads the build configuration and the picture files it names from a checkout. Node only (tests and CI), never shipped.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assetPath, namedAssets } from "./pwaCompare";
import { parsePwaConfig, type PwaConfig } from "./pwaModel";

export const PWA_CONFIG_PATH = "apps/web/vite.config.ts";
export const PWA_PUBLIC_DIR = "apps/web/public";
export const PWA_HTML_PATH = "apps/web/index.html";

export interface PwaLoaded {
  config: PwaConfig;
  /** The files under the public folder that the configuration names, by their path in that folder; null when not there. */
  files: Map<string, Uint8Array | null>;
  /** The text of the start page, or null when it is not there. */
  html: string | null;
}

// The page tests type node:fs with the one call they use (see data-status/testing-ambient.d.ts), so a read with another
// encoding is typed here.
const readLatin1 = readFileSync as unknown as (path: string, encoding: "latin1") => string;

/** The bytes of a file that was read as latin1 text, which keeps every byte as one character. */
export function bytesOf(latin1: string): Uint8Array {
  return Uint8Array.from(latin1, (ch) => ch.charCodeAt(0) & 0xff);
}

/** The text of the configuration, or null when the file is not there. */
export function readConfigText(root: string): string | null {
  const p = join(root, PWA_CONFIG_PATH);
  return existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : null;
}

/** Reads the configuration and the files it names. A missing configuration gives a config with found false. */
export function loadPwa(root: string): PwaLoaded {
  const text = readConfigText(root);
  const config = parsePwaConfig(PWA_CONFIG_PATH, text ?? "");
  const files = new Map<string, Uint8Array | null>();
  for (const name of namedAssets(config)) {
    const clean = assetPath(name);
    const full = join(root, PWA_PUBLIC_DIR, clean);
    const inside = !clean.split("/").includes("..");
    const there = inside && existsSync(full) && statSync(full).isFile();
    files.set(clean, there ? bytesOf(readLatin1(full, "latin1")) : null);
  }
  const hp = join(root, PWA_HTML_PATH);
  const html = existsSync(hp) && statSync(hp).isFile() ? readFileSync(hp, "utf8") : null;
  return { config, files, html };
}
