import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  normalPath, stableFindings, hasForbiddenControlCharacters,
  uncommentYaml, workflowKeys, inspectWorkflowSchedule, safeJson,
  scriptCommands, commandWords, inspectPackageScripts, inspectRootWiring,
  inspectReleaseWiring, inspectCi, policyTree, policyRead,
  inspectRepositoryPolicy, policyRules,
} from './preflight-policy.mjs';

const ROOT_VERIFY = 'npm run test --prefix scripts/release && node scripts/release/check.mjs --dir apps/web/dist && node scripts/release/audit.mjs --dir apps/web/dist && node scripts/release/deep-audit.mjs --dir apps/web/dist && node scripts/release/preflight.mjs --root . --dist apps/web/dist';
const RELEASE_VERIFY = 'npm run test && node check.mjs --dir ../../apps/web/dist && node audit.mjs --dir ../../apps/web/dist && node deep-audit.mjs --dir ../../apps/web/dist && node preflight.mjs --root ../.. --dist ../../apps/web/dist';
const CI = `name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    steps:
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      - run: npm run verify
`;
const manifest = (verify = ROOT_VERIFY) => ({ scripts: { verify, lint: 'eslint .', typecheck: 'tsc --noEmit' } });
const scoped = (verify = RELEASE_VERIFY) => ({ scripts: { verify, test: 'node --test *.test.mjs' } });
const rules = (issues) => issues.map((item) => item.rule);

async function temporaryRepo(files, action) {
  const root = await mkdtemp(join(tmpdir(), 'policy-gate-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const path = join(root, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value);
    }
    return await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const files = () => ({
  'package.json': JSON.stringify(manifest()),
  'scripts/release/package.json': JSON.stringify(scoped()),
  '.github/workflows/ci.yml': CI,
});

test('normalPath retains portable forward slashes', () => {
  assert.equal(normalPath('scripts/release/check.mjs'), 'scripts/release/check.mjs');
});

test('finding order is deterministic regardless of input order', () => {
  const a = { file: 'b', rule: 'B', message: 'second' };
  const b = { file: 'a', rule: 'A', message: 'first' };
  assert.deepEqual(stableFindings([a, b]), [b, a]);
  assert.deepEqual(stableFindings([b, a]), [b, a]);
});

test('duplicate findings are reported once', () => {
  const finding = { file: 'file', rule: 'rule', message: 'message' };
  assert.deepEqual(stableFindings([finding, finding]), [finding]);
});

test('a finding with different detail is preserved', () => {
  const first = { file: 'file', rule: 'rule', message: 'a' };
  const second = { file: 'file', rule: 'rule', message: 'b' };
  assert.equal(stableFindings([first, second]).length, 2);
});

test('ordinary text is not a prohibited control character', () => {
  assert.equal(hasForbiddenControlCharacters('English / Français\n\t'), false);
});

test('linefeed, tab and carriage return are accepted', () => {
  assert.equal(hasForbiddenControlCharacters('\n\r\t'), false);
});

test('a disallowed control character is detected', () => {
  assert.equal(hasForbiddenControlCharacters(String.fromCharCode(1)), true);
});

test('DEL is not treated as a C0 control byte', () => {
  assert.equal(hasForbiddenControlCharacters(String.fromCharCode(127)), false);
});

test('YAML comments are removed', () => {
  assert.equal(uncommentYaml('on: push # explanation').trim(), 'on: push');
});

test('a hash inside a quoted YAML scalar is preserved', () => {
  assert.equal(uncommentYaml('name: "A # B" # note').trim(), 'name: "A # B"');
});

test('a hash in single quotes remains a literal', () => {
  assert.equal(uncommentYaml("name: '#tag' # comment").trim(), "name: '#tag'");
});

test('a non-comment hash remains part of an unquoted token', () => {
  assert.equal(uncommentYaml('name: abc#def').trim(), 'name: abc#def');
});

test('YAML double-quoted escaped quote is handled', () => {
  assert.equal(uncommentYaml('name: "A \\" B" # note').trim(), 'name: "A \\" B"');
});

test('workflowKeys reports source line numbers', () => {
  assert.deepEqual(workflowKeys('on:\n  push:\n    branches: [main]').map((key) => key.line), [1, 2, 3]);
});

test('workflowKeys distinguishes top-level events from job entries', () => {
  assert.deepEqual(workflowKeys(CI).filter((key) => key.indent === 0).map((key) => key.key), ['name', 'on', 'jobs']);
});

test('normal event workflow has no scheduling finding', () => {
  assert.deepEqual(inspectWorkflowSchedule(CI, 'ci.yml'), []);
});

test('scheduled event under on is rejected', () => {
  const document = 'on:\n  schedule:\n    - cron: "0 7 * * *"\njobs:\n  test:';
  assert.ok(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_EVENT'));
});

test('cron key is rejected separately', () => {
  const document = 'on:\n  schedule:\n    - cron: "0 7 * * *"';
  assert.ok(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_KEY'));
});

test('inline event schedule is rejected', () => {
  const document = 'on: [push, schedule]';
  assert.ok(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_EVENT'));
});

test('missing events are rejected', () => {
  assert.ok(rules(inspectWorkflowSchedule('jobs:\n  build:', 'ci.yml')).includes('WORKFLOW_ON_MISSING'));
});

test('a commented schedule key does not trigger', () => {
  assert.deepEqual(inspectWorkflowSchedule('on:\n  push:\n#  schedule:\n    # cron: "0 0 * * *"', 'ci.yml'), []);
});

test('a comment after a push event does not trigger', () => {
  assert.deepEqual(inspectWorkflowSchedule('on: push # schedule', 'ci.yml'), []);
});

test('the scheduled event detection does not require a quoted expression', () => {
  const document = 'on:\n  schedule:\n    - cron: 0 0 * * 1';
  assert.ok(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_EVENT'));
});

test('a nested cron key remains disallowed', () => {
  const document = 'on: push\njobs:\n  job:\n    cron: value';
  assert.ok(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_KEY'));
});

test('schedule outside event scope is not classified as an event', () => {
  const document = 'on: push\njobs:\n  schedule: value';
  assert.equal(rules(inspectWorkflowSchedule(document, 'ci.yml')).includes('CRON_EVENT'), false);
});

test('invalid JSON cannot pass as a manifest', () => {
  assert.ok(rules(safeJson('{', 'package.json').findings).includes('JSON_PARSE'));
});

test('JSON array cannot pass as a manifest', () => {
  assert.ok(rules(safeJson('[]', 'package.json').findings).includes('JSON_SHAPE'));
});

test('JSON null cannot pass as a manifest', () => {
  assert.ok(rules(safeJson('null', 'package.json').findings).includes('JSON_SHAPE'));
});

test('well-formed object JSON is accepted', () => {
  assert.deepEqual(safeJson('{"scripts":{}}', 'package.json').findings, []);
});

test('scriptCommands handles an absent scripts member', () => {
  assert.deepEqual(scriptCommands({ name: 'x' }), {});
});

test('scriptCommands rejects an array scripts member', () => {
  assert.deepEqual(scriptCommands({ scripts: ['bad'] }), {});
});

test('commandWords keeps quoted arguments grouped', () => {
  assert.deepEqual(commandWords('node "folder with spaces/script.mjs" --dir "some dir"'), ['node', 'folder with spaces/script.mjs', '--dir', 'some dir']);
});

test('commandWords tolerates empty input', () => {
  assert.deepEqual(commandWords(''), []);
});

test('package scripts accept ordinary local commands', () => {
  assert.deepEqual(inspectPackageScripts(manifest()), []);
});

test('empty command fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { test: ' ' } })).includes('EMPTY_SCRIPT'));
});

test('a non-string command fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { test: null } })).includes('EMPTY_SCRIPT'));
});

test('node-cron in a package command fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { start: 'node-cron task.mjs' } })).includes('SCHEDULED_SCRIPT'));
});

test('crontab invocation in package scripts fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { start: 'crontab file' } })).includes('SCHEDULED_SCRIPT'));
});

test('scheduled runner invocation fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { start: 'npm run cron:run' } })).includes('SCHEDULED_SCRIPT'));
});

test('curl piped into shell fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { start: 'curl https://example.org/setup | sh' } })).includes('REMOTE_SHELL'));
});

test('wget piped into bash fails', () => {
  assert.ok(rules(inspectPackageScripts({ scripts: { start: 'wget https://example.org/setup | bash' } })).includes('REMOTE_SHELL'));
});

test('ordinary local bash invocation is not a remote shell', () => {
  assert.equal(rules(inspectPackageScripts({ scripts: { start: 'bash scripts/local.sh' } })).includes('REMOTE_SHELL'), false);
});

test('root release wiring passes with all mandatory checks', () => {
  assert.deepEqual(inspectRootWiring(manifest()), []);
});

test('a missing root verify fails', () => {
  assert.ok(rules(inspectRootWiring({ scripts: {} })).includes('VERIFY_MISSING'));
});

test('a missing bundle gate fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replace('scripts/release/check.mjs', 'scripts/release/absent.mjs')))).includes('VERIFY_GATE_MISSING'));
});

test('a missing metadata gate fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replace('scripts/release/audit.mjs', 'scripts/release/absent.mjs')))).includes('VERIFY_GATE_MISSING'));
});

test('a missing deep gate fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replace('scripts/release/deep-audit.mjs', 'scripts/release/absent.mjs')))).includes('VERIFY_GATE_MISSING'));
});

test('a missing policy gate fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replace('scripts/release/preflight.mjs', 'scripts/release/absent.mjs')))).includes('VERIFY_GATE_MISSING'));
});

test('a missing release test command fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replace('npm run test --prefix scripts/release && ', '')))).includes('VERIFY_TESTS_MISSING'));
});

test('a command with a masking true fallback fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(`${ROOT_VERIFY} || true`))).includes('VERIFY_BYPASS'));
});

test('a missing dist target fails', () => {
  assert.ok(rules(inspectRootWiring(manifest(ROOT_VERIFY.replaceAll('apps/web/dist', 'missing')))).includes('VERIFY_DIST_MISSING'));
});

test('scoped release wiring passes', () => {
  assert.deepEqual(inspectReleaseWiring(scoped()), []);
});

test('missing scoped tests fail', () => {
  assert.ok(rules(inspectReleaseWiring({ scripts: { verify: RELEASE_VERIFY } })).includes('RELEASE_TESTS_MISSING'));
});

test('missing scoped gate fails', () => {
  assert.ok(rules(inspectReleaseWiring(scoped(RELEASE_VERIFY.replace('preflight.mjs', 'absent.mjs')))).includes('SCOPED_GATE_MISSING'));
});

test('missing scoped verify fails', () => {
  assert.ok(rules(inspectReleaseWiring({ scripts: { test: 'node --test *.test.mjs' } })).includes('RELEASE_VERIFY_MISSING'));
});

test('CI with build then gate passes', () => {
  assert.deepEqual(inspectCi(CI), []);
});

test('CI without gate fails', () => {
  assert.ok(rules(inspectCi(CI.replace('- run: npm run verify', '- run: npm run something'))).includes('CI_GATE_MISSING'));
});

test('CI with gate before build fails', () => {
  assert.ok(rules(inspectCi(CI.replace('      - run: npm run build\n      - run: npm run verify', '      - run: npm run verify\n      - run: npm run build'))).includes('CI_GATE_ORDER'));
});

test('CI without build fails', () => {
  assert.ok(rules(inspectCi(CI.replace('      - run: npm run build\n', ''))).includes('CI_BUILD_MISSING'));
});

test('CI without lint fails', () => {
  assert.ok(rules(inspectCi(CI.replace('      - run: npm run lint\n', ''))).includes('CI_LINT_MISSING'));
});

test('CI without typecheck fails', () => {
  assert.ok(rules(inspectCi(CI.replace('      - run: npm run typecheck\n', ''))).includes('CI_TYPES_MISSING'));
});

test('CI without pull request event fails', () => {
  assert.ok(rules(inspectCi(CI.replace('  pull_request:\n', ''))).includes('CI_PULL_REQUEST_MISSING'));
});

test('policy tree finds nested YAML workflows', async () => {
  await temporaryRepo({ '.github/workflows/ci.yml': CI, '.github/workflows/sub/other.yaml': 'on: push' }, async (root) => {
    assert.equal((await policyTree(root)).length, 2);
  });
});

test('policy tree rejects symbolic links', async () => {
  await temporaryRepo({ '.github/workflows/ci.yml': CI }, async (root) => {
    await symlink(join(root, '.github/workflows/ci.yml'), join(root, '.github/workflows/linked.yml'));
    await assert.rejects(() => policyTree(root), /Symlink/);
  });
});

test('policyRead decodes valid UTF-8', async () => {
  await temporaryRepo({ 'test.txt': 'Français et English' }, async (root) => {
    assert.equal(await policyRead(join(root, 'test.txt')), 'Français et English');
  });
});

test('policyRead rejects replacement characters', async () => {
  await temporaryRepo({ 'test.txt': 'bad\uFFFD text' }, async (root) => {
    await assert.rejects(() => policyRead(join(root, 'test.txt')), /unsupported text/);
  });
});

test('repository policy passes a fully wired fixture', async () => {
  await temporaryRepo(files(), async (root) => {
    assert.deepEqual(await inspectRepositoryPolicy(root), []);
  });
});

test('repository policy catches absent root manifest', async () => {
  const fixture = files();
  delete fixture['package.json'];
  await temporaryRepo(fixture, async (root) => {
    assert.ok(rules(await inspectRepositoryPolicy(root)).includes('POLICY_READ_FAILED'));
  });
});

test('repository policy rejects missing scoped manifest', async () => {
  const fixture = files();
  delete fixture['scripts/release/package.json'];
  await temporaryRepo(fixture, async (root) => {
    assert.ok(rules(await inspectRepositoryPolicy(root)).includes('POLICY_READ_FAILED'));
  });
});

test('repository policy catches a secondary scheduled workflow', async () => {
  const fixture = files();
  fixture['.github/workflows/nightly.yml'] = 'on:\n  schedule:\n    - cron: "0 3 * * *"';
  await temporaryRepo(fixture, async (root) => {
    assert.ok(rules(await inspectRepositoryPolicy(root)).includes('CRON_EVENT'));
  });
});

test('repository policy reports missing CI directory', async () => {
  await temporaryRepo({ 'package.json': JSON.stringify(manifest()), 'scripts/release/package.json': JSON.stringify(scoped()) }, async (root) => {
    assert.ok(rules(await inspectRepositoryPolicy(root)).includes('WORKFLOW_SCAN_FAILED'));
  });
});

test('repository findings are stable across repeated scans', async () => {
  const fixture = files();
  fixture['.github/workflows/other.yml'] = 'on: [schedule]';
  await temporaryRepo(fixture, async (root) => {
    assert.deepEqual(await inspectRepositoryPolicy(root), await inspectRepositoryPolicy(root));
  });
});

test('policyRules describes the core gate rules', () => {
  for (const key of ['CRON_EVENT', 'CRON_KEY', 'VERIFY_GATE_MISSING', 'CI_GATE_ORDER', 'REMOTE_SHELL']) {
    assert.equal(typeof policyRules[key], 'string');
    assert.ok(policyRules[key].length > 10);
  }
});
