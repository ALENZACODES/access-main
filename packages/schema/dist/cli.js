#!/usr/bin/env node
import { createReadStream, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { countRecords } from "./count.js";
import { migrateImportRecord } from "./migrate.js";
import { getValidator } from "./validate.js";
export async function runCli(argv) {
    const [command, ...rest] = argv;
    if (command === "validate")
        return validateCommand(rest);
    if (command === "count")
        return countCommand(rest);
    if (command === "migrate")
        return migrateCommand(rest);
    process.stderr.write("usage: access-schema validate|count|migrate <files...>\n");
    return 2;
}
async function validateCommand(args) {
    const files = await expand(args);
    const validator = getValidator();
    let failed = 0;
    for (const file of files) {
        const result = validator.validateDetected(file.value);
        if (result.ok) {
            process.stdout.write(`PASS ${file.file}\n`);
        }
        else {
            failed += 1;
            process.stdout.write(`FAIL ${file.file}\n`);
            for (const error of result.errors) {
                process.stdout.write(`  ${error.instancePath} ${error.message}\n`);
            }
        }
    }
    return failed === 0 ? 0 : 1;
}
async function countCommand(args) {
    let asOf = "2026-11-13";
    const paths = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--as-of") {
            asOf = args[i + 1] ?? asOf;
            i += 1;
        }
        else if (arg)
            paths.push(arg);
    }
    const files = await expand(paths);
    const report = countRecords(files.map((file) => file.value), asOf);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
}
async function migrateCommand(args) {
    const files = await expand(args);
    const validator = getValidator();
    let failed = 0;
    for (const file of files) {
        const migrated = migrateImportRecord(file.value);
        for (const record of migrated) {
            const result = validator.validateDetected(record);
            const id = String(record.id);
            if (result.ok)
                process.stdout.write(`PASS ${file.file} -> ${id}\n`);
            else {
                failed += 1;
                process.stdout.write(`FAIL ${file.file} -> ${id}\n`);
                for (const error of result.errors)
                    process.stdout.write(`  ${error.instancePath} ${error.message}\n`);
            }
        }
    }
    return failed === 0 ? 0 : 1;
}
async function expand(inputs) {
    const files = [];
    for (const input of inputs) {
        const info = statSync(input);
        if (info.isDirectory()) {
            for (const name of readdirSync(input).sort()) {
                const full = path.join(input, name);
                if (statSync(full).isDirectory())
                    files.push(...(await listFiles(full)));
                else if (isDataFile(full))
                    files.push(full);
            }
        }
        else if (isDataFile(input))
            files.push(input);
    }
    const loaded = [];
    for (const file of files) {
        for (const value of await readData(file))
            loaded.push({ file, value });
    }
    return loaded;
}
async function listFiles(directory) {
    const files = [];
    for (const name of readdirSync(directory).sort()) {
        const full = path.join(directory, name);
        if (statSync(full).isDirectory())
            files.push(...(await listFiles(full)));
        else if (isDataFile(full))
            files.push(full);
    }
    return files;
}
function isDataFile(file) {
    return file.endsWith(".json") || file.endsWith(".ndjson") || file.endsWith(".ndjson.gz");
}
async function readData(file) {
    if (file.endsWith(".ndjson") || file.endsWith(".ndjson.gz")) {
        const input = file.endsWith(".gz") ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
        const lines = readline.createInterface({ input, crlfDelay: Infinity });
        const records = [];
        for await (const line of lines) {
            if (line.trim())
                records.push(JSON.parse(line));
        }
        return records;
    }
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
}
const invokedDirectly = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (invokedDirectly) {
    runCli(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
//# sourceMappingURL=cli.js.map