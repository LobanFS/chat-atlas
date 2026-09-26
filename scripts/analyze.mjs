#!/usr/bin/env node
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyzeExport } from '../src/engine.js';
import { renderReport } from '../src/report.js';
import { renderDocument } from '../src/document.js';

const MAX_BYTES = 200 * 1024 * 1024;
const MODES = new Set(['full', 'overview', 'rhythm', 'dialogue']);
const USAGE = `Chat Atlas — локальный HTML-отчёт о личной переписке или группе Telegram.

Использование:
  node scripts/analyze.mjs INPUT.json [--out OUTPUT.html] [настройки]

  --out FILE       Куда сохранить HTML (по умолчанию: report.html)
  --gap HOURS      Пауза между сессиями, в часах (по умолчанию: 6)
  --timezone ZONE  export, UTC или зона IANA (по умолчанию: export)
  --from DATE      Начало периода: YYYY-MM-DD
  --to DATE        Конец периода включительно: YYYY-MM-DD
  --mode MODE      full, overview, rhythm или dialogue (по умолчанию: full)
  --names          Сохранить имена участников (по умолчанию скрыты)
  --words          Включить слова и emoji; они попадут в сохранённый отчёт
  --force          Разрешить замену существующего HTML-файла
  --help, -h       Эта справка

Анализ выполняется локально. Исходный JSON не изменяется.
Чтобы передать путь, начинающийся с дефиса, укажите перед ним --.
`;

function parseArgs(args) {
  const config = { input: null, output: 'report.html', mode: 'full', force: false, options: {} };
  const valueOptions = new Set(['--out', '--gap', '--timezone', '--from', '--to', '--mode']);
  const flags = new Set(['--names', '--words', '--force']);
  const seen = new Set();
  let positionalOnly = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!positionalOnly && arg === '--') { positionalOnly = true; continue; }
    if (!positionalOnly && (valueOptions.has(arg) || flags.has(arg))) {
      if (seen.has(arg)) throw new Error(`Настройка ${arg} указана несколько раз.`);
      seen.add(arg);
      if (arg === '--names') { config.options.anonymize = false; continue; }
      if (arg === '--words') { config.options.includeLexicon = true; continue; }
      if (arg === '--force') { config.force = true; continue; }
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`После ${arg} нужно указать значение.`);
      if (arg === '--out') config.output = value;
      if (arg === '--mode') config.mode = value;
      if (arg === '--gap') config.options.sessionGapHours = Number(value);
      if (arg === '--timezone') config.options.timezone = value;
      if (arg === '--from') config.options.startDate = value;
      if (arg === '--to') config.options.endDate = value;
      continue;
    }
    if (!positionalOnly && arg.startsWith('-')) throw new Error(`Неизвестная настройка: ${arg}. Используйте --help.`);
    if (config.input !== null) throw new Error('Укажите только один входной JSON-файл. Для выходного файла используйте --out.');
    config.input = arg;
  }
  if (!config.input) throw new Error('Укажите путь к JSON-файлу. Используйте --help для справки.');
  if (!MODES.has(config.mode)) throw new Error('Неизвестный режим. Допустимы full, overview, rhythm и dialogue.');
  return config;
}

async function assertSafeOutput(inputPath, outputPath, inputStat, force) {
  if (inputPath === outputPath) throw new Error('Выходной файл совпадает с исходным JSON. Выберите другой путь.');
  let outputStat;
  try { outputStat = await stat(outputPath); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const sameFile = inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino;
  const sameTarget = (await realpath(inputPath)) === (await realpath(outputPath));
  if (sameFile || sameTarget) throw new Error('Выходной файл ссылается на исходный JSON. Выберите другой путь.');
  if (!outputStat.isFile()) throw new Error('Выходной путь должен указывать на файл, а не на каталог.');
  if (!force) throw new Error('Выходной файл уже существует. Выберите другой путь или добавьте --force.');
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) { process.stdout.write(USAGE); return; }
  const config = parseArgs(args);
  const inputPath = resolve(config.input);
  const outputPath = resolve(config.output);
  const inputStat = await stat(inputPath);
  if (!inputStat.isFile()) throw new Error('Входной путь должен указывать на JSON-файл, а не на каталог.');
  if (inputStat.size > MAX_BYTES) throw new Error('Файл больше 200 МиБ. Экспортируйте более короткий период одного чата.');
  await assertSafeOutput(inputPath, outputPath, inputStat, config.force);
  const source = await readFile(inputPath, 'utf8');
  let input;
  try { input = JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Не удалось прочитать JSON. Проверьте файл и выберите формат JSON при экспорте из Telegram.'); }
  const data = analyzeExport(input, config.options);
  const body = renderReport(data, { mode: config.mode });
  const styles = (await Promise.all(['../src/styles.css','../src/group.css'].map(path=>readFile(new URL(path,import.meta.url),'utf8')))).join('\n');
  const runtimeSource=await readFile(new URL(data.meta.chatType==='group'?'../src/group-explore.js':'../src/explore.js',import.meta.url),'utf8');
  const runtime=runtimeSource.replace(/^import[^\n]*\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(data.meta.chatType==='group'?'bindGroupExplorer':'bindExplorer')+'(document.getElementById("portable-report"),JSON.parse(document.getElementById("report-data").textContent));';
  const html = renderDocument(data, body, styles, { mode: config.mode, runtime });
  // Check again after analysis; wx also prevents a newly created file from being overwritten.
  await assertSafeOutput(inputPath, outputPath, inputStat, config.force);
  await writeFile(outputPath, html, { encoding: 'utf8', flag: config.force ? 'w' : 'wx' });
  process.stdout.write(`Готово: ${outputPath}\nСообщений: ${data.summary.messages}. Режим: ${config.mode}.\n`);
}

main(process.argv.slice(2)).catch(error => {
  let message = error?.message || 'Не удалось сформировать отчёт.';
  if (error?.code === 'ENOENT') message = 'Не найден входной файл или каталог для результата. Проверьте пути.';
  if (error?.code === 'EEXIST') message = 'Выходной файл уже существует. Выберите другой путь или добавьте --force.';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') message = 'Недостаточно прав для чтения или сохранения файла.';
  process.stderr.write(`Ошибка: ${message}\n`);
  process.exitCode = 1;
});
