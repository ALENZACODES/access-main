#!/usr/bin/env node
/** Run alongside check.mjs through the scoped release verify entry point. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditSite } from './site-audit.mjs';

export function parseAuditArgs(args) {
  let dir;
  let maxFiles = 100_000;
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (option === '--dir' && args[i + 1]) {
      dir = args[++i];
    } else if (option === '--max-files' && args[i + 1]) {
      const raw = args[++i];
      if (!/^[1-9]\d*$/.test(raw)) throw new Error('Invalid file limit');
      maxFiles = Number(raw);
      if (!Number.isSafeInteger(maxFiles)) throw new Error('Invalid file limit');
    } else {
      throw new Error(`Unexpected option: ${option}`);
    }
  }
  if (!dir) throw new Error('Required --dir');
  return { dir, maxFiles };
}

export function formatFinding(issue) {
  return `${issue.level.toUpperCase()} ${issue.code} ${issue.file}: ${issue.detail}`;
}

export async function auditMain(args = process.argv.slice(2), log = console) {
  try {
    const { dir, maxFiles } = parseAuditArgs(args);
    const report = await auditSite(dir, { maxFiles });
    for (const issue of report.issues) {
      log.error(formatFinding(issue));
    }
    if (report.issues.some((issue) => issue.level === 'error')) {
      log.error(`Release audit failed / Contrôle de publication échoué\u00a0: ${report.issues.length}`);
      return 1;
    }
    log.log(`Release audit passed / Contrôle réussi\u00a0: ${report.files} files / fichiers, ${report.inspected} text files / fichiers texte`);
    return 0;
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await auditMain();
}
