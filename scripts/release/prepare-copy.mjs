#!/usr/bin/env node
/**
 * Repair display wording in pinned, locally copied module source BEFORE Vite
 * sees it. Never edit the upstream checkout, schema identifiers or generated
 * web assets. This is an explicit source transformation, not a minified-JS
 * replacement: imported field names and provenance contracts stay unchanged.
 *
 * The transformed inputs are .lanes copies produced by lanes:ensure and
 * hub:sync. Re-running produces exactly the same bytes.
 */
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPreparedModule, formatCopyFinding } from './copy-source-audit.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const IGNORED = new Set(['.git', 'node_modules', 'dist', 'test', 'tests', 'e2e', 'coverage', 'build']);
const MAX_BYTES = 2_000_000;
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

/** Source status identifiers must not be altered to make a text checker pass. */
export const TECHNICAL_VALUES = new Set([
  'PROTOTYPE-UNVERIFIED', 'SEEDED-OPEN-DATA', 'VERIFIED', 'UNVERIFIED',
  'verificationTier', 'verifiedClaimCount', 'isVerified',
  'verification_tier', 'verification_date', 'source_verification',
  'verified', 'unverified', 'verification',
]);

// Longest phrases first: bilingual replacements protect meaning better than
// blind substitution of entire files or opaque runtime protocols.
const PAIRS = [
  ['not a verified listing', 'not a published listing'],
  ['not verified local service information', 'not a published local service listing'],
  ['No verified listings', 'No published listings'],
  ['not verified vacancies', 'not published vacancies'],
  ['not field-verified', 'not based on a field visit'],
  ['No verification is provided', 'No independent review is provided'],
  ['verification tier', 'source tier'],
  ['verification status', 'source status'],
  ['verification date', 'source date'],
  ['verification process', 'review process'],
  ['Verification', 'Review'],
  ['verification', 'review'],
  ['unverified', 'not independently checked'],
  ['verified', 'recorded'],
  ['verifying', 'checking'],
  ['verify', 'check'],
  ['vérifications', 'contrôles'],
  ['vérification', 'contrôle'],
  ['revérifier', 'contrôler de nouveau'],
  ['vérifiez', 'contrôlez'],
  ['vérifier', 'contrôler'],
  ['vérifiées', 'contrôlées'],
  ['vérifiée', 'contrôlée'],
  ['vérifiés', 'contrôlés'],
  ['vérifié', 'contrôlé'],
];

function escapeReplacement(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Unicode boundaries, unlike \b, also work with accented French letters. */
function isWordLetter(value) {
  return value != null && /[\p{L}\p{N}_-]/u.test(value);
}

export function replaceDisplayPhrase(value, { visible = false } = {}) {
  if (!visible && TECHNICAL_VALUES.has(value)) return value;
  // Module specifiers, URLs, filesystem paths, MIME identifiers, and CSS
  // selectors are executable/data contracts. A copy rewrite must not change
  // their spelling, even if the path contains a forbidden display term.
  if (!visible && (/^(?:[a-z][a-z0-9+.-]*:|\.?\.?\/|@[^\s]+\/|\/)/i.test(value)
    || /^(?:[\w.-]+\/)+[\w./-]+$/.test(value)
    || /^[.#][A-Za-z_][\w-]*$/.test(value))) return value;
  // Do not rewrite code or protocol values that happen to be string literals.
  // Human sentences or visible labels may include punctuation, apostrophes,
  // whitespace or accents. Internal snake_case and camelCase are protected.
  if (!visible && /^[\w.-]+$/.test(value) && !/^(?:verify|verified|unverified|verification)$/i.test(value)) return value;
  let result = value;
  for (const [from, to] of PAIRS) {
    const lower = result.toLocaleLowerCase('fr-CA');
    const needle = from.toLocaleLowerCase('fr-CA');
    let start = 0;
    let output = '';
    while (start < result.length) {
      const found = lower.indexOf(needle, start);
      if (found < 0) { output += result.slice(start); break; }
      const before = result[found - 1];
      const after = result[found + needle.length];
      if (isWordLetter(before) || isWordLetter(after)) {
        output += result.slice(start, found + needle.length);
        start = found + needle.length;
        continue;
      }
      const original = result.slice(found, found + needle.length);
      output += result.slice(start, found) + escapeReplacement(original, to);
      start = found + needle.length;
    }
    result = output;
  }
  return result;
}

function readLiteral(source, offset) {
  const quote = source[offset];
  let cursor = offset + 1;
  let text = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      if (cursor + 1 === source.length) return null;
      text += source.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    if (char === quote) return { text, end: cursor + 1 };
    if (quote !== '`' && (char === '\r' || char === '\n')) return null;
    text += char;
    cursor += 1;
  }
  return null;
}

/** Token-aware: comments, regex expressions and identifiers are left intact. */
export function rewriteModuleDisplayStrings(source) {
  let output = '';
  let index = 0;
  let changed = 0;
  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === '/' && next === '/') {
      const until = source.indexOf('\n', index + 2);
      const end = until === -1 ? source.length : until;
      output += source.slice(index, end);
      index = end;
      continue;
    }
    if (current === '/' && next === '*') {
      const until = source.indexOf('*/', index + 2);
      const end = until === -1 ? source.length : until + 2;
      output += source.slice(index, end);
      index = end;
      continue;
    }
    // Regex expressions may contain quotes. Skip those expressions without
    // assuming the quoted text is a shipped display string.
    if (current === '/' && next !== '=' && next !== '*' && next !== '/') {
      const preceding = source.slice(0, index).trimEnd();
      if (preceding.length === 0 || /(?:[=(:,!\[?]|\breturn|\bcase)$/.test(preceding)) {
        let end = index + 1;
        let charClass = false;
        for (; end < source.length; end++) {
          const char = source[end];
          if (char === '\\') { end++; continue; }
          if (char === '[') charClass = true;
          if (char === ']') charClass = false;
          if (char === '/' && !charClass) break;
          if (char === '\n' || char === '\r') break;
        }
        if (source[end] === '/') {
          end++;
          while (/[a-z]/i.test(source[end] ?? '')) end++;
          output += source.slice(index, end);
          index = end;
          continue;
        }
      }
    }
    if (current === '"' || current === "'" || current === '`') {
      const literal = readLiteral(source, index);
      if (literal === null) {
        // Lexical ambiguity is not permission to rewrite data.
        output += source.slice(index);
        break;
      }
      const altered = replaceDisplayPhrase(literal.text);
      // A template expression may contain code. Leave it alone.
      const safe = current === '`' && literal.text.includes('${') ? literal.text : altered;
      output += current + safe + current;
      if (safe !== literal.text) changed++;
      index = literal.end;
      continue;
    }
    output += current;
    index++;
  }
  return { content: output, changed };
}

/**
 * Rewrite only complete, plain JSX text elements. Restricting the grammar to
 * paired, unadorned tags avoids edits to comparisons, template expressions,
 * attribute values, identifiers and object property names. Rich JSX remains
 * the responsibility of the post-build gate.
 */
export function rewriteStaticJsxText(source) {
  let changed = 0;
  const tag = /<(p|span|div|li|strong|em|label|button|a|h[1-6]|option|legend|summary|title|td|th|caption|textarea)>([^<>{}\r\n]+)<\/\1>/gi;
  const content = source.replace(tag, (full, name, text, offset) => {
    // Ignore examples written in a JavaScript line comment.
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
    const linePrefix = source.slice(lineStart, offset);
    if (linePrefix.includes('//')) return full;
    const altered = replaceDisplayPhrase(text, { visible: true });
    if (altered === text) return full;
    changed++;
    return `<${name}>${altered}</${name}>`;
  });
  return { content, changed };
}

async function visit(dir, collected) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (IGNORED.has(entry.name)) continue;
    const file = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link in module copy: ${file}`);
    if (entry.isDirectory()) await visit(file, collected);
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      const info = await lstat(file);
      if (info.size > MAX_BYTES) throw new Error(`Module source exceeds input budget: ${file}`);
      collected.push(file);
    }
  }
}

/** Do not silently ignore a missing copy directory. */
export async function prepareCopiedModules(root, { strict = false } = {}) {
  const directory = resolve(root, '.lanes');
  let stat;
  try { stat = await lstat(directory); } catch (error) {
    if (strict) throw new Error('Expected pinned module copies under .lanes', { cause: error });
    return { files: 0, changed: 0, skipped: true };
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid pinned module directory');
  const files = [];
  await visit(directory, files);
  if (strict && files.length === 0) throw new Error('Pinned module directory has no sources');
  let changed = 0;
  const findings = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const content = fatalDecoder.decode(bytes);
    if (content.includes('\uFFFD')) throw new Error(`Invalid source character: ${relative(root, file)}`);
    const strings = rewriteModuleDisplayStrings(content);
    const output = /\.[jt]sx$/i.test(file)
      ? rewriteStaticJsxText(strings.content)
      : { content: strings.content, changed: 0 };
    const edits = strings.changed + output.changed;
    if (edits > 0) {
      await writeFile(file, output.content, 'utf8');
      changed += edits;
    }
    findings.push(...auditPreparedModule(output.content, relative(root, file).split('\\').join('/')));
  }
  if (findings.length > 0) {
    throw new Error(`Copied source contains ${findings.length} unresolved display issue(s):\n${findings.map(formatCopyFinding).join('\n')}`);
  }
  return { files: files.length, changed, skipped: false };
}

export function parsePrepareArgs(argv) {
  let root = '.';
  let strict = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) root = argv[++i];
    else if (argv[i] === '--strict') strict = true;
    else throw new Error(`Unexpected argument: ${argv[i]}`);
  }
  return { root, strict };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const opts = parsePrepareArgs(process.argv.slice(2));
    const result = await prepareCopiedModules(opts.root, { strict: opts.strict });
    console.log(`Pinned copy wording: ${result.files} source files, ${result.changed} literals updated`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
