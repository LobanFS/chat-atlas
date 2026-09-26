import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../src/report.js';

// Deliberately aggregate-only: these tests never read a Telegram export.
function participant(key, name) {
  return {
    key, name, messages: 2, words: 5, characters: 24, questions: 1, links: 0,
    forwards: 0, replies: 1, reactionsReceived: 0, edited: 0,
    media: { photo: 0, video_message: 0, voice_message: 0, video_file: 0, sticker: 0, animation: 0, audio_file: 0, file: 0, other: 0 },
    voiceSeconds: 0, videoSeconds: 0, activeDays: 2, nightMessages: 0, starts: 1, turns: 2,
    response: { count: 1, medianSeconds: 30, p90Seconds: 30, under5minPct: 100 },
    unansweredSessions: 0,
  };
}
function fixture() {
  return {
    schemaVersion: 1,
    meta: { title: 'Synthetic aggregates', generatedAt: '2026-09-24T12:00:00Z', startDate: '2026-09-21', endDate: '2026-09-23', timezone: 'UTC', sessionGapHours: 6, anonymize: true, partialBoundaryDays: true },
    quality: { totalRecords: 4, validMessages: 4, serviceMessages: 0, invalidMessages: 0, duplicates: 0, outsideRange: 0, warnings: [] },
    participants: [participant('a', 'Участник A'), participant('b', 'Участник B')],
    summary: { messages: 4, days: 3, activeDays: 2, activeDayPct: 66.67, messagesPerActiveDay: 2, sessions: 3, eligibleStarts: 2, twoSidedSessions: 1, twoSidedSessionPct: 33.33, medianSessionMinutes: 0, longestStreakDays: 1, longestSilenceHours: 48, mutualityScore: 100, exchangeScore: 33.33, continuityScore: 66.67 },
    daily: [
      { date: '2026-09-21', total: 2, a: 1, b: 1, avg7: null, startsA: 0, startsB: 0 },
      { date: '2026-09-22', total: 0, a: 0, b: 0, avg7: null, startsA: 0, startsB: 0 },
      { date: '2026-09-23', total: 2, a: 1, b: 1, avg7: null, startsA: 1, startsB: 1 },
    ],
    monthly: [{ month: '2026-09', total: 4, a: 2, b: 2, startsA: 1, startsB: 1, responseA: 30, responseB: 30 }],
    heatmap: [{ day: 0, hour: 12, a: 1, b: 1, total: 2 }, { day: 2, hour: 12, a: 1, b: 1, total: 2 }],
    sessions: [{ date: '2026-09-21', starter: 'a', messages: 2, durationMinutes: 0.5, twoSided: true, censored: true }, { date: '2026-09-23', starter: 'a', messages: 1, durationMinutes: 0, twoSided: false, censored: false }, { date: '2026-09-23', starter: 'b', messages: 1, durationMinutes: 0, twoSided: false, censored: false }],
    sensitivity: [2, 6, 12, 24].map(hours => ({ hours, eligibleStarts: 2, a: 1, b: 1, twoSidedPct: 33.33 })),
    trend: { available: false, previousMean: null, currentMean: null, changePct: null, zScore: null, direction: 'insufficient', baselineDays: 0, comparisonDays: 1, excludedBoundaryDays: 2 },
    insights: [{ tone: 'neutral', title: 'Маленькая выборка', body: 'Здесь только искусственные агрегаты.' }],
  };
}
function getTable(html, className) {
  const match = html.match(new RegExp(`<table class="[^"]*\\b${className}\\b[^"]*">([\\s\\S]*?)</table>`));
  assert.ok(match, `Table ${className} should be available`);
  return match[1];
}
function tableRows(table) {
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  assert.notEqual(body, undefined, 'Table should contain a body');
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
}
function cellValues(row) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
}

for (const [mode, expected] of Object.entries({ full: ['overview', 'rhythm', 'dialogue', 'habits', 'method'], overview: ['overview', 'method'], rhythm: ['overview', 'rhythm', 'method'], dialogue: ['overview', 'dialogue', 'method'] })) {
  test(`${mode} mode contains exactly its relevant sections and the methodology`, () => {
    const html = renderReport(fixture(), { mode });
    assert.deepEqual([...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]), expected);
  });
}

test('hostile names and descriptive strings remain text in every output mode', () => {
  const data = fixture();
  const hostile = `</h4><img src=x onerror="alert('x')"> & <script>alert(1)</script>`;
  data.participants[0].name = hostile;
  data.quality.warnings = [hostile];
  data.insights = [{ tone: '" onclick="alert(1)', title: hostile, body: hostile }];
  data.meta.timezone = hostile;
  for (const mode of ['full', 'overview', 'rhythm', 'dialogue']) {
    const html = renderReport(data, { mode });
    assert.ok(html.includes('&lt;/h4&gt;&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.doesNotMatch(html, /<img\b|<script\b|\sonclick=/i);
    assert.doesNotMatch(html, /tone-"/);
    assert.ok(html.includes('tone-neutral'), 'Unknown insight tones must not enter class attributes');
  }
});

test('an absent response is distinct from an observed zero-second response', () => {
  const data = fixture();
  data.participants[0].response = { count: 0, medianSeconds: null, p90Seconds: null, under5minPct: null };
  data.participants[1].response = { count: 1, medianSeconds: 0, p90Seconds: 0, under5minPct: 100 };
  const cards = [...renderReport(data, { mode: 'dialogue' }).matchAll(/<article class="response-card[^>]*>([\s\S]*?)<\/article>/g)].map(m => m[1]);
  assert.equal(cards.length, 2);
  assert.match(cards[0], /class="response-primary">—<\/p>/);
  assert.match(cards[0], /Ответов быстрее 5 минут<\/dt><dd>—<\/dd>/);
  assert.match(cards[1], /class="response-primary">0 с<\/p>/);
  assert.match(cards[1], /Ответов быстрее 5 минут<\/dt><dd>100%<\/dd>/);
});

test('daily table retains zero-activity days and does not invent incomplete averages', () => {
  const html = renderReport(fixture(), { mode: 'rhythm' });
  const table = html.match(/<caption class="sr-only">Количество сообщений за каждый день<\/caption>([\s\S]*?)<\/table>/)?.[1];
  assert.ok(table);
  const rows = tableRows(table);
  assert.equal(rows.length, 3);
  assert.deepEqual(cellValues(rows[1]), ['0', '0', '0', '—']);
  assert.match(rows[1], /22/);
});

test('heatmap exposes every weekday/hour value in an accessible 7-by-24 table', () => {
  const data = fixture();
  data.heatmap = [{ day: 0, hour: 0, a: 3, b: 2, total: 5 }, { day: 6, hour: 23, a: 7, b: 4, total: 11 }];
  const table = getTable(renderReport(data), 'heatmap-table');
  assert.match(table, /<caption\b[^>]*>Сообщения по дню недели и часу<\/caption>/);
  const rows = tableRows(table);
  assert.equal(rows.length, 7);
  const values = rows.map(cellValues);
  for (const row of values) assert.equal(row.length, 24);
  assert.equal(values[0][0], '5');
  assert.equal(values[6][23], '11');
  assert.equal(values[0][23], '0');
  assert.equal(values[6][0], '0');
  assert.equal(values.flat().filter(v => v === '0').length, 166);
});

test('chart accessibility references resolve to descriptive text', () => {
  const html = renderReport(fixture());
  const charts = [...html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)];
  assert.ok(charts.length >= 2);
  for (const [, attrs, body] of charts) {
    assert.match(attrs, /role="img"/);
    const referenced = attrs.match(/aria-labelledby="([^"]+)"/)?.[1].split(' ');
    assert.ok(referenced?.length >= 2);
    for (const id of referenced) assert.match(body, new RegExp(`<(?:title|desc) id="${id}">[^<]+</(?:title|desc)>`));
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'Accessibility and section IDs should be unique');
});

test('selected session threshold is marked once with an accessible label', () => {
  const table = getTable(renderReport(fixture()), 'sensitivity-table');
  const rows = [...table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].filter(m => m[1].includes('is-selected'));
  assert.equal(rows.length, 1);
  assert.match(rows[0][2], /6 ч/);
  assert.match(rows[0][2], /aria-label="Выбранный порог"/);
});

test('empty and one-speaker data produce useful reports without numeric artifacts', () => {
  const empty = fixture();
  empty.participants = [];
  empty.daily = [];
  empty.monthly = [];
  empty.heatmap = [];
  empty.sessions = [];
  empty.sensitivity = [];
  empty.insights = [];
  empty.summary = Object.fromEntries(Object.keys(empty.summary).map(key => [key, 0]));
  empty.meta.startDate = empty.meta.endDate = null;
  const single = fixture();
  single.participants = [participant('a', 'Участник A')];
  single.participants[0].messages = 1;
  single.participants[0].response = { count: 0, medianSeconds: null, p90Seconds: null, under5minPct: null };
  single.summary.messages = single.summary.days = single.summary.activeDays = single.summary.sessions = 1;
  single.summary.eligibleStarts = 0;
  single.daily = [{ date: '2026-09-21', total: 1, a: 1, b: 0, avg7: null, startsA: 0, startsB: 0 }];
  for (const data of [empty, single]) {
    for (const mode of ['full', 'overview', 'rhythm', 'dialogue']) {
      const html = renderReport(data, { mode });
      assert.doesNotMatch(html, /NaN|Infinity|undefined/);
      assert.doesNotMatch(html, /class="index-card"/);
      assert.match(html, /id="method"/);
    }
  }
  assert.match(renderReport(empty), /нет данных для графика/);
  assert.match(renderReport(empty), /Нет сообщений для календаря активности/);
});

test('a zero trend baseline is described without an infinite percentage', () => {
  const data = fixture();
  data.trend = { available: true, previousMean: 0, currentMean: 4, changePct: null, zScore: null, direction: 'up', baselineDays: 28, comparisonDays: 7, excludedBoundaryDays: 2 };
  const html = renderReport(data, { mode: 'rhythm' });
  assert.match(html, /Недостаточно полных дней/); // daily aggregates are authoritative, not an inconsistent supplied trend cache
  assert.match(html, /Периоды сравнения/);
  assert.doesNotMatch(html, /NaN|Infinity|null%/);
});

test('rendering emits only a static fragment and leaves input aggregates unchanged', () => {
  const data = fixture();
  // Extra unknown keys must not be serialized into the HTML accidentally.
  data.unexpectedRawContent = 'PRIVATE_TEXT_SENTINEL_714';
  const before = structuredClone(data);
  const html = renderReport(data);
  assert.doesNotMatch(html, /<!doctype|<html\b|<script\b|<style\b|<iframe\b|<link\b|<img\b/i);
  assert.doesNotMatch(html, /PRIVATE_TEXT_SENTINEL_714/);
  assert.deepEqual(data, before);
});

test('invalid report input and unsupported modes are rejected', () => {
  for (const invalid of [null, undefined, 'not aggregates', 7]) assert.throws(() => renderReport(invalid), TypeError);
  assert.throws(() => renderReport(fixture(), { mode: 'unknown' }), TypeError);
});

function lexicalFixture() {
  const data = fixture();
  data.meta.includeLexicon = true;
  data.lexicon = {
    words: [{ term: 'привет', a: 3, b: 2, total: 5 }],
    emojis: [{ term: '💛', a: 1, b: 3, total: 4 }],
    excludedStopWords: true,
    minimumWordLength: 3,
    limit: 24,
  };
  return data;
}

test('optional word frequencies appear immediately before methodology in every mode', () => {
  for (const mode of ['full', 'overview', 'rhythm', 'dialogue']) {
    const html = renderReport(lexicalFixture(), { mode });
    const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(sections.slice(-2), ['words', 'method']);
    assert.equal(sections.filter(id => id === 'words').length, 1);
    assert.deepEqual(cellValues(tableRows(getTable(html, 'lexicon-words-table'))[0]), ['3', '2', '5']);
    assert.deepEqual(cellValues(tableRows(getTable(html, 'lexicon-emojis-table'))[0]), ['1', '3', '4']);
    assert.match(html, /без частых служебных слов/);
    assert.match(html, /формы не объединены/);
    assert.match(html, /число вхождений, включая пересылки/);
    assert.match(html, /Эмодзи в тексте; реакции и стикеры не учитываются/);
    assert.match(html, /Слова длиной от 3 символов/);
  }
});

test('disabled or absent lexical data never enters the report', () => {
  const disabled = lexicalFixture();
  disabled.meta.includeLexicon = false;
  const missingFlag = lexicalFixture();
  delete missingFlag.meta.includeLexicon;
  const missingData = lexicalFixture();
  delete missingData.lexicon;
  for (const data of [fixture(), disabled, missingFlag, missingData]) {
    for (const mode of ['full', 'overview', 'rhythm', 'dialogue']) {
      const html = renderReport(data, { mode });
      assert.doesNotMatch(html, /id="words"|привет|💛/);
      assert.match(html, /Здесь только агрегаты: тексты сообщений/);
      assert.doesNotMatch(html, /В отчёт включены выбранные частые слова/);
    }
  }
});

test('lexical terms are escaped and optional privacy copy reflects included content', () => {
  const data = lexicalFixture();
  const hostile = '</th><img src=x onerror="alert(1)"> & <script>alert(1)</script>';
  data.lexicon.words[0].term = hostile;
  data.lexicon.emojis[0].term = hostile;
  const before = structuredClone(data);
  const html = renderReport(data);
  assert.doesNotMatch(html, /<img\b|<script\b|<[^>]+\sonerror=/i);
  assert.match(html, /&lt;\/th&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp;/);
  assert.match(html, /В отчёт включены выбранные частые слова и эмодзи из переписки с числом вхождений/);
  assert.match(html, /Полные тексты сообщений, идентификаторы пользователей/);
  assert.doesNotMatch(html, /Здесь только агрегаты: тексты сообщений/);
  assert.deepEqual(data, before);
});

test('lexical tables cap long rankings at 24 and preserve empty or one-speaker cases', () => {
  const data = lexicalFixture();
  data.lexicon.limit = 100;
  data.lexicon.words = Array.from({ length: 30 }, (_, i) => ({ term: 'token' + i, a: 2, b: 1, total: 3 }));
  let html = renderReport(data);
  assert.equal(tableRows(getTable(html, 'lexicon-words-table')).length, 24);
  assert.doesNotMatch(html, /token24/);
  data.participants = [data.participants[0]];
  data.lexicon.limit = 2;
  data.lexicon.minimumWordLength = 4;
  data.lexicon.excludedStopWords = false;
  data.lexicon.emojis = [];
  html = renderReport(data);
  const rows = tableRows(getTable(html, 'lexicon-words-table'));
  assert.equal(rows.length, 2);
  assert.deepEqual(cellValues(rows[0]), ['2', '3']);
  assert.match(html, /Слова длиной от 4 символов/);
  assert.match(html, /включая служебные слова/);
  assert.match(html, /Эмодзи в тексте сообщений не найдены/);
  data.lexicon.words = [];
  html = renderReport(data);
  assert.match(html, /Слов, подходящих под правила подсчёта, не найдено/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});
