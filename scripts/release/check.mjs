#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findForbiddenShippedCopy } from './bundle-copy.mjs';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';

export const DEFAULT_BUDGET_BYTES = 4_141_875;
const TEXT_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.cjs', '.css', '.json', '.txt', '.svg', '.xml', '.webmanifest',
  '.md', '.csv', '.geojson', '.map', '.vtt',
]);
const encoder = new TextDecoder('utf-8', { fatal: true });

// Reject prohibited release wording in inspected text.
export const BANNED_PATTERNS = Object.freeze([
  ...forbiddenOrgNeedles().map((needle) => new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')),
  /aaa[ -]?conformant/i,
  /\bverified\b/i,
  /v[ée]rif[\p{L}]*/iu,
]);

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
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
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
    if (/\.[cm]?js$/i.test(name)) {
      const scan = findForbiddenShippedCopy(content, BANNED_PATTERNS);
      for (const issue of scan.issues) {
        issues.push(`${name}: prohibited release text / texte de publication interdit (${issue})`);
      }
    } else {
      for (const pattern of BANNED_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          issues.push(`${name}: prohibited release text / texte de publication interdit (${pattern.source})`);
        }
      }
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
