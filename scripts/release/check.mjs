#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_BUDGET_BYTES = 4_141_875;
const TEXT_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.txt', '.svg', '.xml', '.webmanifest',
  '.md', '.csv', '.geojson', '.map', '.vtt',
]);
const encoder = new TextDecoder('utf-8', { fatal: true });

// Assemble the prohibited names in fragments to avoid emitting them in release source.
export const BANNED_PATTERNS = Object.freeze([
  /spinal\s+cord\s+injury\s+ontario/i,
  new RegExp(['sci', 'ontario'].join(''), 'i'),
  new RegExp(['sc', 'io'].join(''), 'i'),
  /aaa[ -]?conformant/i,
]);

/**
 * Every user-facing form of verify / verified / vérifier / vérifié(e)(s),
 * including "not verified", "unverified", and "verified source".
 * Applied after non-user-facing allowlisted tokens are masked.
 */
export const USER_FACING_VERIF_PATTERN =
  /unverified|verif(?:y|ied|iable|ication|ying|ies)?|vérifi(?:er|é|ée|és|ées|able|cation|ant|a)/giu;

/**
 * Machine tokens that may remain in the bundle. None of these is user-facing copy.
 * Tokens are removed before the user-facing pattern runs, and must be exact.
 */
// The only permitted token in a release is this exact machine label.
export const ALLOWLISTED_TOKENS = Object.freeze([
  'PROTOTYPE-UNVERIFIED',
]);

export function maskAllowlistedTokens(content) {
  let masked = content;
  for (const token of ALLOWLISTED_TOKENS) {
    if (token && masked.includes(token)) {
      masked = masked.split(token).join(' '.repeat(token.length));
    }
  }
  return masked;
}

export function findUserFacingVerif(content) {
  const masked = maskAllowlistedTokens(content);
  return masked.match(USER_FACING_VERIF_PATTERN) ?? [];
}

/** Source maps are not shown to people using the App; still counted in the budget. */
const WORDING_SKIP_EXTENSIONS = new Set(['.map']);

export async function inspectRelease(directory, { budgetBytes = DEFAULT_BUDGET_BYTES } = {}) {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) {
    throw new TypeError('Invalid byte budget / Budget en octets invalide');
  }
  const root = resolve(directory);
  const files = [];
  async function walk(folder) {
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(folder, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic link rejected / Lien symbolique refusé : ${relative(root, full)}`);
      }
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      } else {
        throw new Error(`Unsupported entry / Entrée non prise en charge : ${relative(root, full)}`);
      }
    }
  }
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error('Release path is not a directory / Le chemin de publication n’est pas un dossier');
  }
  await walk(root);
  if (files.length === 0) {
    throw new Error('Release directory is empty / Le dossier de publication est vide');
  }

  let totalBytes = 0;
  const issues = [];
  for (const file of files) {
    const bytes = await readFile(file);
    totalBytes += bytes.byteLength;
    const name = relative(root, file).split('\\').join('/');
    const ext = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    let content;
    try {
      content = encoder.decode(bytes);
    } catch {
      issues.push(`${name}: invalid UTF-8 / UTF-8 invalide`);
      continue;
    }
    if (content.includes('\uFFFD')) {
      issues.push(`${name}: replacement character U+FFFD / caractère de remplacement U+FFFD`);
    }
    if (WORDING_SKIP_EXTENSIONS.has(ext)) continue;
    for (const pattern of BANNED_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`${name}: prohibited release text / texte de publication interdit (${pattern.source})`);
      }
    }
    const verifHits = findUserFacingVerif(content);
    if (verifHits.length > 0) {
      const unique = [...new Set(verifHits.map((hit) => hit.toLowerCase()))].join(', ');
      issues.push(`${name}: prohibited user-facing verification wording / formulation de confirmation interdite (${unique})`);
    }
  }
  if (totalBytes > budgetBytes) {
    issues.push(`Size ${totalBytes} exceeds ${budgetBytes} bytes / Taille ${totalBytes} supérieure à ${budgetBytes} octets`);
  }
  return { files: files.length, totalBytes, budgetBytes, issues };
}

export function parseArgs(args) {
  let directory;
  let budgetBytes = DEFAULT_BUDGET_BYTES;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
      directory = args[++i];
    } else if (args[i] === '--budget' && args[i + 1]) {
      const value = args[++i];
      if (!/^\d+$/.test(value)) throw new Error('Invalid budget / Budget invalide');
      budgetBytes = Number(value);
    } else {
      throw new Error(`Unexpected argument / Argument inattendu : ${args[i]}`);
    }
  }
  if (!directory) throw new Error('Required --dir / --dir requis');
  return { directory, budgetBytes };
}

export async function main(args = process.argv.slice(2)) {
  try {
    const { directory, budgetBytes } = parseArgs(args);
    const result = await inspectRelease(directory, { budgetBytes });
    if (result.issues.length) {
      console.error(result.issues.join('\n'));
      return 1;
    }
    console.log(`Release checks passed / Contrôles réussis : ${result.files} files / fichiers, ${result.totalBytes} bytes / octets`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
