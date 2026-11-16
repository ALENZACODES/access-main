#!/usr/bin/env node
/** Artifact-level offline, interaction, locale and evidence release gates. */
import { readFile } from 'node:fs/promises';
import { inspectNavigationHtml, inspectNavigationGraph } from './navigation-audit.mjs';
import { inspectPrivacyHtml, inspectPrivacyScript, inspectHttpHeaders } from './privacy-audit.mjs';
import { inspectSemanticHtml } from './semantics-audit.mjs';
import { inspectContentJson } from './content-audit.mjs';
import { inspectSvgDocument, inspectInlineSvg } from './svg-audit.mjs';
import { inspectHtmlTables } from './table-audit.mjs';
import { inspectDownloadAnchors, inspectExportManifest, inspectCsv } from './download-audit.mjs';
import { inspectGeoJson } from './geo-audit.mjs';
import { inspectHtmlMedia, inspectWebVtt } from './media-audit.mjs';
import { inspectBinaryFile } from './binary-audit.mjs';
import { inspectBilingualCaptions } from './caption-pair-audit.mjs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectFiles, decodeUtf8, finding } from './site-audit.mjs';
import {
  inspectOfflineHtml, inspectOfflineCss, inspectManifest,
  inspectPrecache, inspectServiceWorker, isServiceWorkerName,
  classifyOfflineDependencies,
} from './offline-audit.mjs';
import { inspectHtmlInteractions, inspectCssInteractions,
  documentInteractionSummary } from './interaction-audit.mjs';
import { inspectTranslationPairs, inspectHtmlLocale,
  inspectKeyedCatalogue, isCatalogueName,
} from './locale-audit.mjs';
import { inspectReleasedRecords, inspectEvidenceLists,
  sourceSummary } from './evidence-audit.mjs';

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs',
  '.json', '.webmanifest', '.svg', '.csv', '.geojson', '.vtt']);

export function parseDeepArgs(args) {
  let dir;
  let maxFiles = 100_000;
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (option === '--dir' && args[i + 1]) dir = args[++i];
    else if (option === '--max-files' && args[i + 1]) {
      const raw = args[++i];
      if (!/^[1-9]\d*$/.test(raw)) throw new Error('Invalid --max-files');
      maxFiles = Number(raw);
      if (!Number.isSafeInteger(maxFiles)) throw new Error('Invalid --max-files');
    } else throw new Error(`Unexpected option: ${option}`);
  }
  if (!dir) throw new Error('Required --dir');
  return { dir, maxFiles };
}

export function stableIssues(issues) {
  return issues.sort((a, b) => a.file.localeCompare(b.file, 'en') ||
    a.code.localeCompare(b.code, 'en') ||
    a.detail.localeCompare(b.detail, 'en'));
}

export async function deepAudit(root, options = {}) {
  const entries = await collectFiles(root, options);
  const names = new Set(entries.keys());
  const issues = [];
  const documents = [];
  const pages = new Map();
  const captions = new Map();
  const totals = { html: 0, css: 0, json: 0, scripts: 0,
    controls: 0, links: 0, records: 0, unknown: 0 };
  for (const [name, entry] of entries) {
    issues.push(...await inspectBinaryFile(entry, name));
    const extension = extname(name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension) && name !== '_headers') continue;
    const decoded = decodeUtf8(await readFile(entry.absolute), name);
    issues.push(...decoded.issues);
    if (decoded.text === null) continue;
    const text = decoded.text;
    if (name === '_headers') {
      issues.push(...inspectHttpHeaders(text, name));
      continue;
    }
    if (extension === '.html') {
      totals.html += 1;
      pages.set(name, text);
      issues.push(...inspectNavigationHtml(text, name));
      issues.push(...inspectInlineSvg(text, name));
      issues.push(...inspectHtmlTables(text, name));
      issues.push(...inspectDownloadAnchors(text, name, names));
      issues.push(...inspectHtmlMedia(text, name, names));
      issues.push(...inspectPrivacyHtml(text, name));
      issues.push(...inspectSemanticHtml(text, name));
      documents.push({ kind: 'html', file: name, text });
      issues.push(...inspectOfflineHtml(text, name, names));
      issues.push(...inspectHtmlInteractions(text, name));
      issues.push(...inspectHtmlLocale(text, name));
      const summary = documentInteractionSummary(text);
      totals.controls += summary.controls;
      totals.links += summary.links;
    } else if (extension === '.vtt') {
      issues.push(...inspectWebVtt(text, name));
    } else if (extension === '.svg') {
      issues.push(...inspectSvgDocument(text, name));
    } else if (extension === '.csv') {
      issues.push(...inspectCsv(text, name));
    } else if (extension === '.css') {
      totals.css += 1;
      documents.push({ kind: 'css', file: name, text });
      issues.push(...inspectOfflineCss(text, name, names));
      issues.push(...inspectCssInteractions(text, name));
    } else if (extension === '.js' || extension === '.mjs') {
      totals.scripts += 1;
      issues.push(...inspectPrivacyScript(text, name));
      if (isServiceWorkerName(name)) {
        issues.push(...inspectPrecache(text, name, names));
        issues.push(...inspectServiceWorker(text, name));
      }
    } else if (extension === '.json' || extension === '.webmanifest' || extension === '.geojson') {
      totals.json += 1;
      let value;
      try { value = JSON.parse(text); } catch {
        issues.push(finding('DEEP_JSON_PARSE', name, 'Invalid JSON'));
        continue;
      }
      if (extension === '.geojson') {
        issues.push(...inspectGeoJson(value, name));
      } else if (extension === '.webmanifest') {
        issues.push(...inspectManifest(value, name, names));
      } else {
        if (isCatalogueName(name)) issues.push(...inspectKeyedCatalogue(value, name));
        else issues.push(...inspectTranslationPairs(value, name));
        issues.push(...inspectReleasedRecords(value, name));
        issues.push(...inspectEvidenceLists(value, name));
        issues.push(...inspectContentJson(value, name));
        if (/^|[/.-]exports?[/.-]/i.test(name)) {
          issues.push(...inspectExportManifest(value, name, names));
        }
        const summary = sourceSummary(value);
        totals.records += summary.records;
        totals.unknown += summary.unknown;
      }
    }
  }
  issues.push(...inspectNavigationGraph(pages, names));
  for (const [name, html] of pages) {
    issues.push(...inspectBilingualCaptions(html, name, captions));
  }
  const graph = classifyOfflineDependencies(documents);
  return {
    files: entries.size,
    totals,
    reachable: graph.reachable.size,
    issues: stableIssues(issues),
  };
}

export async function deepMain(args = process.argv.slice(2), log = console) {
  try {
    const { dir, maxFiles } = parseDeepArgs(args);
    const report = await deepAudit(dir, { maxFiles });
    for (const issue of report.issues) {
      log.error(`${issue.level.toUpperCase()} ${issue.code} ${issue.file}: ${issue.detail}`);
    }
    if (report.issues.some((issue) => issue.level === 'error')) {
      log.error(`Release gate failed / Contrôle de publication échoué : ${report.issues.length}`);
      return 1;
    }
    log.log(`Release gate passed / Contrôle de publication réussi : ${report.files} files / fichiers`);
    return 0;
  } catch (error) {
    log.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await deepMain();
}
