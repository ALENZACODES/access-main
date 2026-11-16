#!/usr/bin/env node
/** Single fail-closed pre-release gate: root wiring, no cron, and artifact limits. */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectBundle, formatBundleSummary } from './bundle-policy.mjs';
import { inspectRepositoryPolicy } from './preflight-policy.mjs';
import { scanShippedCopy } from './shipped-copy-policy.mjs';

export function parsePreflightArgs(argv) {
  let root;
  let dist;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if ((flag === '--root' || flag === '--dist') && argv[index + 1]) {
      const value = argv[++index];
      if (flag === '--root') {
        if (root !== undefined) throw new Error('Duplicate --root');
        root = value;
      } else {
        if (dist !== undefined) throw new Error('Duplicate --dist');
        dist = value;
      }
    } else {
      throw new Error(`Unsupported preflight argument: ${flag}`);
    }
  }
  if (!root || !dist) throw new Error('Both --root and --dist must be provided');
  return { root: resolve(root), dist: resolve(dist) };
}

export async function runPreflight(root, dist) {
  // Accumulate findings across independently readable areas. A missing or
  // malformed build is always a failure, never an empty passing report.
  const [policy, bundle, copy] = await Promise.all([
    inspectRepositoryPolicy(root),
    collectBundle(dist),
    scanShippedCopy(dist),
  ]);
  return { policy, bundle, copy, ok: policy.length === 0 && bundle.issues.length === 0 && copy.length === 0 };
}

export function formatPreflight(result) {
  const lines = [formatBundleSummary(result.bundle)];
  for (const issue of result.policy) {
    lines.push(`${issue.file}: ${issue.rule}: ${issue.message}`);
  }
  for (const issue of result.bundle.issues) {
    lines.push(`${issue.file}: ${issue.rule}: ${issue.detail}`);
  }
  for (const issue of result.copy) {
    lines.push(`${issue.file}: ${issue.rule}: line ${issue.line}`);
  }
  return lines.join('\n');
}

export async function preflightMain(argv = process.argv.slice(2)) {
  try {
    const { root, dist } = parsePreflightArgs(argv);
    const result = await runPreflight(root, dist);
    if (result.ok) console.log(formatPreflight(result));
    else console.error(formatPreflight(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await preflightMain();
}
