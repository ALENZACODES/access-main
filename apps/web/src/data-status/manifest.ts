/**
 * Checksum manifest for the downloadable files, in the two-space `sha256sum` layout so a
 * saved set can be checked with ordinary tools. The checksum is of the UTF-8 bytes of the
 * file text exactly as this module sees it. A browser without Web Crypto gets null, never
 * a made-up value.
 */
import type { Locale } from './dataStatus';
import { createTranslator, type Messages } from './localText';

export interface ManifestFileInput {
  filename: string;
  text: string;
}

export interface ManifestEntry {
  filename: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  entries: ManifestEntry[];
}

interface DigestHost {
  crypto?: { subtle?: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> } };
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function sha256Hex(text: string, host: DigestHost = globalThis as DigestHost): Promise<string | null> {
  const subtle = host.crypto?.subtle;
  if (subtle === undefined) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function isSafeFilename(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes('..');
}

export async function buildManifest(files: readonly ManifestFileInput[], host: DigestHost = globalThis as DigestHost): Promise<Manifest | null> {
  const entries: ManifestEntry[] = [];
  for (const f of files) {
    if (!isSafeFilename(f.filename)) return null;
    const sha256 = await sha256Hex(f.text, host);
    if (sha256 === null) return null;
    entries.push({ filename: f.filename, bytes: utf8Length(f.text), sha256 });
  }
  return { entries: entries.sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0)) };
}

/** `<hex>  <filename>` per line, sorted by filename, ending with a newline. */
export function manifestToText(m: Manifest): string {
  return m.entries.map((e) => `${e.sha256}  ${e.filename}\n`).join('');
}

export type ManifestParse = { ok: true; entries: { filename: string; sha256: string }[] } | { ok: false; line: number };

/** Strict reader for the layout above: 64 lowercase hex digits, two spaces, a safe file name. */
export function parseManifestText(text: string): ManifestParse {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const entries: { filename: string; sha256: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(lines[i] ?? '');
    const name = m?.[2];
    const hash = m?.[1];
    if (name === undefined || hash === undefined || !isSafeFilename(name)) return { ok: false, line: i + 1 };
    entries.push({ filename: name, sha256: hash });
  }
  return { ok: true, entries };
}

export type MismatchReason = 'missing' | 'changed' | 'unexpected';

export interface Mismatch {
  filename: string;
  reason: MismatchReason;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  mismatches: Mismatch[];
}

/** Compare a manifest with the files now in hand. Order of the mismatches follows the file names. */
export async function verifyManifest(
  manifest: Pick<Manifest, 'entries'>,
  files: readonly ManifestFileInput[],
  host: DigestHost = globalThis as DigestHost,
): Promise<VerifyResult | null> {
  const mismatches: Mismatch[] = [];
  const byName = new Map(files.map((f) => [f.filename, f.text] as const));
  let checked = 0;
  for (const e of manifest.entries) {
    const text = byName.get(e.filename);
    if (text === undefined) {
      mismatches.push({ filename: e.filename, reason: 'missing' });
      continue;
    }
    const hash = await sha256Hex(text, host);
    if (hash === null) return null;
    checked += 1;
    if (hash !== e.sha256) mismatches.push({ filename: e.filename, reason: 'changed' });
  }
  const known = new Set(manifest.entries.map((e) => e.filename));
  for (const f of files) if (!known.has(f.filename)) mismatches.push({ filename: f.filename, reason: 'unexpected' });
  mismatches.sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));
  return { ok: mismatches.length === 0, checked, mismatches };
}

type Key =
  | 'mf.ok.one'
  | 'mf.ok.other'
  | 'mf.missing'
  | 'mf.changed'
  | 'mf.unexpected'
  | 'mf.unavailable'
  | 'mf.help';

const MESSAGES: Messages<Key> = {
  en: {
    'mf.ok.one': '{n} file matches its checksum.',
    'mf.ok.other': 'All {n} files match their checksums.',
    'mf.missing': '{filename} is listed but was not provided.',
    'mf.changed': '{filename} does not match its checksum.',
    'mf.unexpected': '{filename} is not listed in the checksums.',
    'mf.unavailable': 'Checksums cannot be made in this browser.',
    'mf.help': 'Checksums use SHA-256 of the file as saved. Run sha256sum -c on the list to check a saved set.',
  },
  fr: {
    'mf.ok.one': '{n} fichier correspond à sa somme de contrôle.',
    'mf.ok.other': 'Les {n} fichiers correspondent à leur somme de contrôle.',
    'mf.missing': '{filename} figure dans la liste, mais n’a pas été fourni.',
    'mf.changed': '{filename} ne correspond pas à sa somme de contrôle.',
    'mf.unexpected': '{filename} ne figure pas dans les sommes de contrôle.',
    'mf.unavailable': 'Les sommes de contrôle ne peuvent pas être calculées dans ce navigateur.',
    'mf.help': 'Les sommes de contrôle utilisent SHA-256 du fichier tel qu’il est enregistré. Exécutez sha256sum -c sur la liste pour contrôler un ensemble enregistré.',
  },
};

export const MANIFEST_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function manifestHelp(locale: Locale): string {
  return tx(locale, 'mf.help');
}

export function describeVerify(r: VerifyResult | null, locale: Locale): string[] {
  if (r === null) return [tx(locale, 'mf.unavailable')];
  if (r.ok) return [tx.count(locale, 'mf.ok', r.checked)];
  return r.mismatches.map((m) => tx(locale, `mf.${m.reason}`, { filename: m.filename }));
}
