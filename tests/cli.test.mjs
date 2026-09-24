import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, symlink, link, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const CLI = fileURLToPath(new URL('../scripts/analyze.mjs', import.meta.url));
const TOKEN = 'фиолетовыйсинтез';
const ALICE = 'SYNTHETIC_ALICE_X14';
const BOB = 'SYNTHETIC_BOB_X14';
function syntheticChat() {
  const messages = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 8, 1 + Math.floor(i / 4), 12, i % 4));
    const who = i % 2;
    return { id: i + 1, type: 'message', date: date.toISOString().slice(0, 19), date_unixtime: String(date.getTime() / 1000), from_id: `user${who + 1}`, from: who ? BOB : ALICE, text: `${TOKEN} ${TOKEN} синтетическая беседа 🌙` };
  });
  return { type: 'personal_chat', name: 'PRIVATE_SYNTHETIC_CHAT_TITLE', messages };
}
async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'chat-atlas-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'input.json');
  const output = join(dir, 'output.html');
  const content = JSON.stringify(syntheticChat());
  await writeFile(input, content);
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  return { dir, input, output, content, run };
}
function success(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function failure(result, message) {
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, 'CLI should reject the operation');
  assert.match(result.stderr, message);
}

test('CLI help is available without an input file', async t => {
  const { run, dir } = await workspace(t);
  const result = run('--help');
  success(result);
  assert.match(result.stdout, /Использование:/);
  for (const flag of ['--out', '--gap', '--timezone', '--from', '--to', '--mode', '--names', '--words', '--force']) assert.ok(result.stdout.includes(flag));
  assert.deepEqual(await readdir(dir), ['input.json']);
});

test('CLI produces a single portable anonymized HTML without copying source messages', async t => {
  const { run, input, output, dir, content } = await workspace(t);
  const result = run(input, '--out', output);
  success(result);
  const html = await readFile(output, 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="rhythm"/);
  assert.match(html, /Участник A/);
  for (const privateValue of [ALICE, BOB, TOKEN, 'PRIVATE_SYNTHETIC_CHAT_TITLE']) assert.ok(!html.includes(privateValue), `${privateValue} should not appear in anonymized aggregate report`);
  assert.doesNotMatch(html, /<script\b|<link\b[^>]*href="https?:|\bsrc="https?:/i);
  assert.deepEqual((await readdir(dir)).sort(), ['input.json', 'output.html']);
  assert.equal(await readFile(input, 'utf8'), content);
});

test('CLI defaults output to report.html in the working directory', async t => {
  const { run, input, dir } = await workspace(t);
  success(run(input));
  assert.match(await readFile(join(dir, 'report.html'), 'utf8'), /<!doctype html>/i);
});

test('CLI passes date, timezone, gap and mode options to the report', async t => {
  const { run, input, output } = await workspace(t);
  success(run(input, '--out', output, '--from', '2026-09-02', '--to', '2026-09-02', '--gap', '2', '--timezone', 'UTC', '--mode', 'dialogue'));
  const html = await readFile(output, 'utf8');
  assert.match(html, /id="dialogue"/);
  assert.doesNotMatch(html, /id="rhythm"|id="habits"/);
  assert.match(html, /2026-09-02/);
  assert.match(html, /UTC/);
  assert.match(html, /2 ч/);
});

test('CLI includes participant names only with --names', async t => {
  const { run, input, output } = await workspace(t);
  success(run(input, '--out', output, '--names'));
  const html = await readFile(output, 'utf8');
  assert.ok(html.includes(ALICE));
  assert.ok(html.includes(BOB));
  assert.ok(!html.includes(TOKEN));
});

test('CLI --words explicitly includes lexical aggregates while keeping names hidden', async t => {
  const { run, input, output } = await workspace(t);
  success(run(input, '--out', output, '--words'));
  const html = await readFile(output, 'utf8');
  assert.ok(html.includes(TOKEN), 'Repeated word should appear in explicitly enabled lexical statistics');
  assert.ok(!html.includes(ALICE));
  assert.ok(!html.includes(BOB));
  assert.ok(!html.includes(`${TOKEN} ${TOKEN} синтетическая беседа`), 'A full source message must not appear');
});

test('CLI sanitizes JSON parse errors without exposing private text', async t => {
  const { run, input, output, dir } = await workspace(t);
  await writeFile(input, 'PRIVATE_INVALID_JSON_SENTINEL');
  const result = run(input, '--out', output);
  failure(result, /Не удалось прочитать JSON/);
  assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_INVALID_JSON_SENTINEL|SyntaxError/);
  assert.deepEqual(await readdir(dir), ['input.json']);
});

test('CLI rejects missing, unknown and incomplete options without writing output', async t => {
  const { run, input, dir } = await workspace(t);
  const cases = [
    [[], /Укажите путь/],
    [[input, '--unknown'], /Неизвестная настройка/],
    [[input, '--out'], /нужно указать значение/],
    [[input, '--mode', 'wrong'], /Неизвестный режим/],
    [[input, '--gap', '0'], /числом больше 0/],
    [[input, '--gap', 'not-a-number'], /числом больше 0/],
    [[input, '--timezone', 'Mars/Olympus'], /Неизвестная часовая зона/],
    [[input, '--from', '2026-02-30'], /настоящими датами/],
    [[input, '--from', '2026-09-03', '--to', '2026-09-01'], /позже его конца/],
    [[input, '--mode', 'full', '--mode', 'overview'], /несколько раз/],
  ];
  for (const [args, message] of cases) failure(run(...args), message);
  assert.deepEqual(await readdir(dir), ['input.json']);
});

test('CLI refuses output overwrite unless --force is supplied', async t => {
  const { run, input, output } = await workspace(t);
  await writeFile(output, 'EXISTING_REPORT_SENTINEL');
  failure(run(input, '--out', output), /уже существует/);
  assert.equal(await readFile(output, 'utf8'), 'EXISTING_REPORT_SENTINEL');
  success(run(input, '--out', output, '--force'));
  assert.match(await readFile(output, 'utf8'), /<!doctype html>/i);
});

test('CLI --force cannot overwrite its input, including symlink and hardlink aliases', async t => {
  const { run, input, dir, content } = await workspace(t);
  failure(run(input, '--out', input, '--force'), /совпадает с исходным JSON/);
  const symbolic = join(dir, 'symbolic.html');
  const hard = join(dir, 'hard.html');
  await symlink(input, symbolic);
  await link(input, hard);
  for (const alias of [symbolic, hard]) failure(run(input, '--out', alias, '--force'), /ссылается на исходный JSON/);
  assert.equal(await readFile(input, 'utf8'), content);
});

test('CLI checks the 200 MiB limit before attempting to parse the input', async t => {
  const { run, input, output, dir } = await workspace(t);
  const handle = await open(input, 'w');
  try { await handle.truncate(200 * 1024 * 1024 + 1); } finally { await handle.close(); }
  failure(run(input, '--out', output), /200 МиБ/);
  assert.deepEqual(await readdir(dir), ['input.json']);
});

test('CLI accepts paths with spaces and reports missing paths without a stack trace', async t => {
  const { run, input, dir } = await workspace(t);
  const output = join(dir, 'a report with spaces.html');
  success(run(input, '--out', output));
  assert.match(await readFile(output, 'utf8'), /<!doctype html>/i);
  const result = run(join(dir, 'absent.json'));
  failure(result, /Не найден входной файл/);
  assert.doesNotMatch(result.stderr, /at \w+|node:internal/);
});
