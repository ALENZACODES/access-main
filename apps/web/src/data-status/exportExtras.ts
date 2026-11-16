/**
 * Two extra downloads built from the same records as the main export files: a Markdown copy
 * of the audit and a checksum list for the saved set. The checksum list covers the files the
 * page offers, in the `sha256sum` layout, so a saved set can be checked with ordinary tools.
 */
import type { Locale } from './dataStatus';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import type { ExportFile } from './exportFiles';
import { createTranslator, type Messages } from './localText';
import { buildManifest, manifestToText } from './manifest';
import { buildMarkdownReport } from './markdownReport';
import type { Thresholds } from './thresholds';

export type ExtraExportId = 'markdown' | 'checksums';

export interface ExtraExportFile {
  id: ExtraExportId;
  filename: string;
  mime: string;
  label: string;
  text: string;
}

export const EXTRA_EXPORT_IDS: readonly ExtraExportId[] = ['markdown', 'checksums'];

type Key = 'ex.markdown' | 'ex.checksums';

const MESSAGES: Messages<Key> = {
  en: { 'ex.markdown': 'Download the audit report (Markdown)', 'ex.checksums': 'Download the checksum list (text)' },
  fr: { 'ex.markdown': 'Télécharger le rapport d’audit (Markdown)', 'ex.checksums': 'Télécharger la liste des sommes de contrôle (texte)' },
};

export const EXPORT_EXTRAS_MESSAGES = MESSAGES;
const tx = createTranslator(MESSAGES);

export function extraLabel(id: ExtraExportId, locale: Locale): string {
  return tx(locale, id === 'markdown' ? 'ex.markdown' : 'ex.checksums');
}

export function buildMarkdownFile(records: readonly DatasetRecord[], locale: Locale, now: Date, thresholds: Thresholds = {}): ExtraExportFile {
  return {
    id: 'markdown',
    filename: 'data-status.md',
    mime: 'text/markdown;charset=utf-8',
    label: extraLabel('markdown', locale),
    text: buildMarkdownReport(auditRegistry(records, now, thresholds), now, locale),
  };
}

/** The checksum list for the given files, or null when the browser cannot make checksums. */
export async function buildChecksumFile(files: readonly Pick<ExportFile, 'filename' | 'text'>[], locale: Locale): Promise<ExtraExportFile | null> {
  const manifest = await buildManifest(files.map((f) => ({ filename: f.filename, text: f.text })));
  if (manifest === null) return null;
  return { id: 'checksums', filename: 'checksums.txt', mime: 'text/plain;charset=utf-8', label: extraLabel('checksums', locale), text: manifestToText(manifest) };
}
