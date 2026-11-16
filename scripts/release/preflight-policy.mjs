/**
 * Repository-level policy gate. Operates on the actual release command and CI
 * configuration, not on an asserted CI state. All paths are relative to root.
 * Results are stable and contain no machine-specific absolute paths.
 */
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_POLICY_FILE = 1_048_576;
const WORKFLOW_NAME = /\.ya?ml$/i;
const OMIT = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache']);

function report(file, rule, message) {
  return { file, rule, message };
}

export function normalPath(value) {
  return value.split(sep).join('/');
}

export function stableFindings(findings) {
  const unique = new Map();
  for (const finding of findings) {
    unique.set(JSON.stringify([finding.file, finding.rule, finding.message]), finding);
  }
  return [...unique.values()].sort((a, b) =>
    a.file.localeCompare(b.file, 'en') ||
    a.rule.localeCompare(b.rule, 'en') ||
    a.message.localeCompare(b.message, 'en'));
}

export function hasForbiddenControlCharacters(text) {
  for (const character of text) {
    const n = character.charCodeAt(0);
    if ((n <= 8 || (n >= 11 && n <= 12) || (n >= 14 && n <= 31)) && n !== 0) return true;
  }
  return false;
}

/**
 * Strip YAML comments without interpreting hashes in quoted scalar strings.
 * This is intentionally NOT a full YAML parser. Only top-level keys are read.
 */
export function uncommentYaml(line) {
  let single = false;
  let double = false;
  let escaped = false;
  let output = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (escaped) { output += c; escaped = false; continue; }
    if (c === '\\' && double) { output += c; escaped = true; continue; }
    if (c === "'" && !double) { single = !single; output += c; continue; }
    if (c === '"' && !single) { double = !double; output += c; continue; }
    if (c === '#' && !single && !double && (i === 0 || /\s/.test(line[i - 1]))) break;
    output += c;
  }
  return output;
}

export function workflowKeys(content) {
  const keys = [];
  for (const [index, raw] of content.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = uncommentYaml(raw);
    if (!line.trim() || /^\s*-\s*[^:]+$/.test(line)) continue;
    const matched = /^( *)(?:-\s*)?([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (matched) keys.push({ indent: matched[1].length, key: matched[2], value: matched[3], line: index + 1 });
  }
  return keys;
}

export function inspectWorkflowSchedule(content, filename) {
  const keys = workflowKeys(content);
  const findings = [];
  const top = keys.filter((key) => key.indent === 0);
  const onKey = top.find((key) => key.key === 'on');
  if (!onKey) {
    findings.push(report(filename, 'WORKFLOW_ON_MISSING', 'Missing top-level on event declaration'));
  } else {
    const followingTop = top.find((key) => key.line > onKey.line);
    const end = followingTop?.line ?? Infinity;
    const events = keys.filter((key) => key.line > onKey.line && key.line < end);
    for (const event of events) {
      if (event.key === 'schedule') findings.push(report(filename, 'CRON_EVENT', `Scheduled workflow event at line ${event.line}`));
    }
    if (/(?:^|[\s,[{])schedule\b/.test(onKey.value)) {
      findings.push(report(filename, 'CRON_EVENT', `Scheduled workflow event at line ${onKey.line}`));
    }
  }
  // Any explicit cron mapping is rejected even when nested under another key.
  // Avoid triggering on ordinary prose, quoted examples, or comment-only text.
  for (const key of keys) {
    if (key.key === 'cron') findings.push(report(filename, 'CRON_KEY', `Cron key at line ${key.line}`));
  }
  return stableFindings(findings);
}

export function safeJson(content, file) {
  try {
    const result = JSON.parse(content);
    if (!result || Array.isArray(result) || typeof result !== 'object') {
      return { value: null, findings: [report(file, 'JSON_SHAPE', 'Expected an object')] };
    }
    return { value: result, findings: [] };
  } catch {
    return { value: null, findings: [report(file, 'JSON_PARSE', 'Invalid JSON')] };
  }
}

export function scriptCommands(manifest) {
  if (!manifest || !manifest.scripts || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts)) return {};
  return manifest.scripts;
}

export function commandWords(value) {
  if (typeof value !== 'string') return [];
  // A command tokeniser that retains quoted arguments and never invokes a shell.
  const tokens = [];
  let word = '';
  let quote = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) { word += char; escaped = false; continue; }
    if (char === '\\' && quote === '"') { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = '';
      else word += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) {
      if (word) { tokens.push(word); word = ''; }
      continue;
    }
    word += char;
  }
  if (word) tokens.push(word);
  return tokens;
}

export function inspectPackageScripts(manifest, file = 'package.json') {
  const findings = [];
  const scripts = scriptCommands(manifest);
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string' || !command.trim()) {
      findings.push(report(file, 'EMPTY_SCRIPT', `Script ${name} is empty or invalid`));
      continue;
    }
    if (/\b(?:node-cron|crontab|schedule:run|cron:run)\b/i.test(command)) {
      findings.push(report(file, 'SCHEDULED_SCRIPT', `Script ${name} invokes a scheduled runner`));
    }
    if (/(?:^|[\s;&|])(?:curl|wget)\b/.test(command) && /(?:^|[\s;&|])(?:sh|bash)\b/.test(command)) {
      findings.push(report(file, 'REMOTE_SHELL', `Script ${name} mixes remote fetching and shell execution`));
    }
  }
  return findings;
}

export function inspectRootWiring(manifest, file = 'package.json') {
  const findings = inspectPackageScripts(manifest, file);
  const scripts = scriptCommands(manifest);
  const value = scripts.verify;
  if (typeof value !== 'string') {
    findings.push(report(file, 'VERIFY_MISSING', 'Root verify script must exist'));
    return stableFindings(findings);
  }
  const expected = [
    'scripts/release/check.mjs',
    'scripts/release/audit.mjs',
    'scripts/release/deep-audit.mjs',
    'scripts/release/preflight.mjs',
  ];
  for (const path of expected) {
    if (!value.includes(path)) {
      findings.push(report(file, 'VERIFY_GATE_MISSING', `Root verify must invoke ${path}`));
    }
  }
  if (!/\b(?:npm\s+run\s+test\s+--prefix\s+scripts\/release|node\s+--test)\b/.test(value)) {
    findings.push(report(file, 'VERIFY_TESTS_MISSING', 'Release tests must run as part of root verify'));
  }
  if (/(?:^|[;&|])\s*(?:true|exit\s+0)(?:\s|$)/.test(value) || /\|\|\s*true\b/.test(value)) {
    findings.push(report(file, 'VERIFY_BYPASS', 'Root verify must not mask failures'));
  }
  if (!value.includes('apps/web/dist')) {
    findings.push(report(file, 'VERIFY_DIST_MISSING', 'Root verify must inspect built web assets'));
  }
  return stableFindings(findings);
}

export function inspectReleaseWiring(manifest, file = 'scripts/release/package.json') {
  const findings = inspectPackageScripts(manifest, file);
  const scripts = scriptCommands(manifest);
  if (typeof scripts.test !== 'string' || !scripts.test.includes('node --test')) {
    findings.push(report(file, 'RELEASE_TESTS_MISSING', 'Scoped release tests must be executable'));
  }
  if (typeof scripts.verify !== 'string') {
    findings.push(report(file, 'RELEASE_VERIFY_MISSING', 'Scoped release verify must exist'));
  } else {
    for (const path of ['check.mjs', 'audit.mjs', 'deep-audit.mjs', 'preflight.mjs']) {
      if (!scripts.verify.includes(path)) findings.push(report(file, 'SCOPED_GATE_MISSING', `Scoped verify must invoke ${path}`));
    }
  }
  return stableFindings(findings);
}

export function inspectCi(content, file = '.github/workflows/ci.yml') {
  const findings = inspectWorkflowSchedule(content, file);
  const steps = content.replace(/\r\n?/g, '\n').split('\n');
  let build = -1;
  let verify = -1;
  let lint = -1;
  let types = -1;
  for (let i = 0; i < steps.length; i++) {
    const line = uncommentYaml(steps[i]);
    if (/^\s*-\s+run:\s*npm\s+run\s+build\s*$/.test(line)) build = i;
    if (/^\s*-\s+run:\s*npm\s+run\s+verify\s*$/.test(line)) verify = i;
    if (/^\s*-\s+run:\s*npm\s+run\s+lint\s*$/.test(line)) lint = i;
    if (/^\s*-\s+run:\s*npm\s+run\s+typecheck\s*$/.test(line)) types = i;
  }
  if (verify < 0) findings.push(report(file, 'CI_GATE_MISSING', 'CI must run npm run verify'));
  if (build < 0) findings.push(report(file, 'CI_BUILD_MISSING', 'CI must build before release gate'));
  if (verify >= 0 && build >= verify) findings.push(report(file, 'CI_GATE_ORDER', 'Release gate must follow build'));
  if (lint < 0) findings.push(report(file, 'CI_LINT_MISSING', 'CI must run lint'));
  if (types < 0) findings.push(report(file, 'CI_TYPES_MISSING', 'CI must run typecheck'));
  if (!/^\s*pull_request\s*:/m.test(content)) findings.push(report(file, 'CI_PULL_REQUEST_MISSING', 'CI must run on pull requests'));
  return stableFindings(findings);
}

export async function policyTree(root, relativeDir = '.github/workflows') {
  const absolute = resolve(root, relativeDir);
  const paths = [];
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (OMIT.has(entry.name)) continue;
      const child = join(directory, entry.name);
      const meta = await lstat(child);
      if (meta.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${normalPath(relative(root, child))}`);
      if (meta.isDirectory()) await walk(child);
      else if (meta.isFile()) paths.push(child);
      else throw new Error(`Unsupported policy file: ${normalPath(relative(root, child))}`);
    }
  }
  await walk(absolute);
  return paths;
}

export async function policyRead(file) {
  const bytes = await readFile(file);
  if (bytes.byteLength > MAX_POLICY_FILE) throw new Error('Policy file size limit exceeded');
  const content = TEXT_DECODER.decode(bytes);
  if (content.includes('\uFFFD') || hasForbiddenControlCharacters(content)) {
    throw new Error('Policy file contains unsupported text characters');
  }
  return content;
}

export async function inspectRepositoryPolicy(rootDirectory) {
  const root = resolve(rootDirectory);
  const findings = [];
  for (const [file, inspector] of [
    ['package.json', inspectRootWiring],
    ['scripts/release/package.json', inspectReleaseWiring],
  ]) {
    try {
      const parsed = safeJson(await policyRead(join(root, file)), file);
      findings.push(...parsed.findings);
      if (parsed.value) findings.push(...inspector(parsed.value, file));
    } catch (error) {
      findings.push(report(file, 'POLICY_READ_FAILED', error instanceof Error ? error.message : String(error)));
    }
  }
  let workflows = [];
  try {
    workflows = (await policyTree(root)).filter((file) => WORKFLOW_NAME.test(file));
  } catch (error) {
    findings.push(report('.github/workflows', 'WORKFLOW_SCAN_FAILED', error instanceof Error ? error.message : String(error)));
  }
  if (workflows.length === 0) findings.push(report('.github/workflows', 'CI_WORKFLOW_MISSING', 'No workflow files found'));
  let foundMainCi = false;
  for (const full of workflows) {
    const file = normalPath(relative(root, full));
    try {
      const content = await policyRead(full);
      findings.push(...inspectWorkflowSchedule(content, file));
      if (file === '.github/workflows/ci.yml' || file === '.github/workflows/ci.yaml') {
        foundMainCi = true;
        findings.push(...inspectCi(content, file));
      }
    } catch (error) {
      findings.push(report(file, 'WORKFLOW_READ_FAILED', error instanceof Error ? error.message : String(error)));
    }
  }
  if (!foundMainCi) findings.push(report('.github/workflows', 'MAIN_CI_MISSING', 'Required CI workflow is absent'));
  return stableFindings(findings);
}

export const policyRules = Object.freeze({
  CRON_EVENT: 'Scheduled GitHub Actions events are not allowed',
  CRON_KEY: 'Cron mappings are not allowed',
  VERIFY_GATE_MISSING: 'Every release gate must be invoked from the root command',
  CI_GATE_ORDER: 'Release checks must run after the build',
  REMOTE_SHELL: 'Package commands must not pipe downloaded code into a shell',
});
