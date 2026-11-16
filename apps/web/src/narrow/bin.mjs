#!/usr/bin/env node
// Launcher for the narrow-screen audit.
//   npx tsx apps/web/src/narrow/bin.mjs --help
// Needs playwright-core or @playwright/test, plus a Chromium it can start.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runCli } from './cli.ts';

async function loadChromium() {
  for (const name of ['playwright-core', '@playwright/test']) {
    try {
      const mod = await import(name);
      const chromium = (mod.default ?? mod).chromium ?? mod.chromium;
      if (chromium) return chromium;
    } catch {
      // try the next package
    }
  }
  throw new Error('playwright-core or @playwright/test is needed / playwright-core ou @playwright/test est requis');
}

async function launch() {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  // tsx adds a __name helper to functions that Playwright sends into the page.
  await context.addInitScript('globalThis.__name = globalThis.__name || ((f) => f);');
  const page = await context.newPage();
  return { page, context, close: () => browser.close() };
}

process.exitCode = await runCli(process.argv.slice(2), {
  launch,
  readText: (path) => readFile(path, 'utf8'),
  writeText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  },
  log: (line) => console.log(line),
  now: () => new Date(),
});
