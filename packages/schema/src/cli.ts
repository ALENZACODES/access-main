#!/usr/bin/env node
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { RecordCounter } from "./count.js";
import { migrateImportRecord, type ImportRecord } from "./migrate.js";
import { getValidator } from "./validate.js";

interface Loaded {
  file: string;
  index: number;
  value?: unknown;
  parseError?: string;
}

function ignoreEpipe(stream: NodeJS.WriteStream): void {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
  });
}

export async function runCli(argv: string[]): Promise<number> {
  ignoreEpipe(process.stdout);
  const [command, ...rest] = argv;
  if (command === "validate") return validateCommand(rest);
  if (command === "count") return countCommand(rest);
  if (command === "migrate") return migrateCommand(rest);
  process.stderr.write("usage: access-schema validate|count|migrate <files...>\n");
  return 2;
}

function label(item: Loaded): string {
  return `${item.file}#${item.index}`;
}

async function validateCommand(args: string[]): Promise<number> {
  const validator = getValidator();
  let failed = 0;
  for await (const item of eachRecord(args)) {
    if (item.parseError) {
      failed += 1;
      process.stdout.write(`FAIL ${label(item)}\n  / ${item.parseError}\n`);
      continue;
    }
    const result = validator.validateDetected(item.value);
    if (result.ok) {
      process.stdout.write(`PASS ${label(item)}\n`);
    } else {
      failed += 1;
      process.stdout.write(`FAIL ${label(item)}\n`);
      for (const error of result.errors) {
        process.stdout.write(`  ${error.instancePath} ${error.message}\n`);
      }
    }
  }
  return failed === 0 ? 0 : 1;
}

async function countCommand(args: string[]): Promise<number> {
  let asOf = "2026-11-13";
  const paths: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--as-of") {
      asOf = args[i + 1] ?? asOf;
      i += 1;
    } else if (arg) paths.push(arg);
  }
  const counter = new RecordCounter(asOf);
  let failed = 0;
  for await (const item of eachRecord(paths)) {
    if (item.parseError || item.value === undefined) {
      failed += 1;
      process.stderr.write(`FAIL ${label(item)}\n  / ${item.parseError ?? "empty record"}\n`);
      continue;
    }
    counter.add(item.value, item.file);
  }
  const report = counter.finish();
  if (report.records === 0 && report.examples_excluded_records > 0) {
    process.stderr.write(
      `warning: ${report.examples_excluded_records} record(s) excluded as fixtures by path, id prefix, source marker, or example flag. Headline count is 0.\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return failed === 0 ? 0 : 1;
}

async function migrateCommand(args: string[]): Promise<number> {
  const validator = getValidator();
  let failed = 0;
  for await (const item of eachRecord(args)) {
    if (item.parseError || item.value === undefined) {
      failed += 1;
      process.stdout.write(`FAIL ${label(item)}\n  / ${item.parseError ?? "empty record"}\n`);
      continue;
    }
    const migrated = migrateImportRecord(item.value as ImportRecord);
    for (const record of migrated) {
      const result = validator.validateDetected(record);
      const id = String((record as { id?: string }).id);
      if (result.ok) process.stdout.write(`PASS ${label(item)} -> ${id}\n`);
      else {
        failed += 1;
        process.stdout.write(`FAIL ${label(item)} -> ${id}\n`);
        for (const error of result.errors) process.stdout.write(`  ${error.instancePath} ${error.message}\n`);
      }
    }
  }
  return failed === 0 ? 0 : 1;
}

async function* eachRecord(inputs: string[]): AsyncGenerator<Loaded> {
  for (const file of listInputs(inputs)) {
    let index = 0;
    for await (const parsed of readRecords(file)) {
      index += 1;
      yield { file, index, ...parsed };
    }
  }
}

function listInputs(inputs: string[]): string[] {
  const files: string[] = [];
  for (const input of inputs) {
    const info = statSync(input);
    if (info.isDirectory()) files.push(...listFiles(input));
    else if (isDataFile(input)) files.push(input);
  }
  return files;
}

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directory).sort()) {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) files.push(...listFiles(full));
    else if (isDataFile(full)) files.push(full);
  }
  return files;
}

function isDataFile(file: string): boolean {
  return file.endsWith(".json") || file.endsWith(".ndjson") || file.endsWith(".ndjson.gz");
}

async function* readRecords(file: string): AsyncGenerator<{ value?: unknown; parseError?: string }> {
  if (file.endsWith(".ndjson") || file.endsWith(".ndjson.gz")) {
    const input = file.endsWith(".gz") ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
    for await (const line of splitOnNewline(input)) {
      const text = stripBom(line).replace(/\r$/, "");
      if (text.trim().length === 0) continue;
      try {
        yield { value: JSON.parse(text) as unknown };
      } catch (error) {
        yield { parseError: error instanceof Error ? error.message : "invalid JSON" };
      }
    }
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripBom(readFileSync(file, "utf8"))) as unknown;
  } catch (error) {
    yield { parseError: error instanceof Error ? error.message : "invalid JSON" };
    return;
  }
  if (Array.isArray(parsed)) {
    for (const value of parsed) yield { value };
  } else {
    yield { value: parsed };
  }
}

/**
 * Split a byte stream on U+000A only.
 * Node readline also splits on U+2028 and U+2029, which appear inside OSM strings
 * such as a housenumber. Those characters stay inside the JSON line.
 */
async function* splitOnNewline(stream: Readable): AsyncGenerator<string> {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    pending += decoder.write(bytes);
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      yield pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  }
  pending += decoder.end();
  if (pending.length > 0) yield pending;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
