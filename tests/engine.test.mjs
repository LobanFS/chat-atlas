import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExport, DEFAULT_OPTIONS, flattenText } from '../src/engine.js';

function message(id, author, date, extra = {}) {
  const epoch = Date.parse(date.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(date) ? date : `${date}Z`);
  return { id, type: 'message', from: author, from_id: `user-${author}`, date: date.replace(/Z$/, ''), date_unixtime: String(epoch / 1000), text: '', ...extra };
}
const chat = (messages, extra = {}) => ({ type: 'personal_chat', name: 'Private title', messages, ...extra });
const analyze = (messages, options) => analyzeExport(chat(messages), options);
const at = (seconds) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString().slice(0, 19);

function assertFiniteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Nonfinite number: ${value}`);
  else if (Array.isArray(value)) value.forEach(assertFiniteTree);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFiniteTree);
}

test('Telegram rich text is flattened without serializing entities or arbitrary metadata', () => {
  assert.equal(flattenText('hello'), 'hello');
  assert.equal(flattenText(['Hi ', { type: 'bold', text: 'there' }, '!', { type: 'mention_name', user_id: 'secret' }]), 'Hi there!');
  assert.equal(flattenText(null), '');
  assert.equal(flattenText({ text: 'supported entity', other: 'not content' }), 'supported entity');
  assert.equal(flattenText([{ text: { nested: 'ignored' } }]), '');
});

test('empty exports and a one-message one-author chat have honest empty response statistics', () => {
  const empty = analyze([]);
  assert.equal(empty.summary.messages, 0);
  assert.equal(empty.summary.days, 0);
  assert.equal(empty.summary.medianSessionMinutes, null);
  assert.equal(empty.summary.mutualityScore, 0);
  assert.deepEqual(empty.daily, []);
  assert.equal(empty.heatmap.length, 168);
  assert.deepEqual(empty.participants, []);
  assertFiniteTree(empty);
  const one = analyze([message(1, 'A', at(0))]);
  assert.equal(one.participants.length, 1);
  assert.equal(one.participants[0].turns, 1);
  assert.equal(one.participants[0].starts, 0);
  assert.equal(one.participants[0].unansweredSessions, 0);
  assert.deepEqual(one.participants[0].response, { count: 0, medianSeconds: null, p90Seconds: null, under5minPct: null });
  assert.equal(one.sessions[0].censored, true);
  assert.equal(one.summary.eligibleStarts, 0);
  assert.equal(one.summary.mutualityScore, 0);
  assert.equal(one.summary.continuityScore, 100);
  assertFiniteTree(one);
});

test('rejects account archives, group chats and exports with more than two speakers', () => {
  for (const input of [null, [], {}, { chats: { list: [] } }, chat([], { type: 'private_group' }), chat('bad')]) {
    assert.throws(() => analyzeExport(input), /личной переписки/);
  }
  assert.throws(() => analyze(['A', 'B', 'C'].map((author, index) => message(index, author, at(index)))), /больше двух авторов/);
  assert.throws(() => analyze(['A', 'B', 'C'].map((author, index) => message(index, author, at(index))), { startDate: '2030-01-01' }), /больше двух авторов/);
});

test('validates option types, real calendar dates, zones, ordering and bounded ranges', () => {
  for (const hours of [0, -1, 169, Infinity, NaN, '6', null]) assert.throws(() => analyze([], { sessionGapHours: hours }), /Пауза/);
  for (const date of ['2026-02-30', '2025-02-29', '0000-01-01', '2026-13-01', '2026-1-01', null, 1]) assert.throws(() => analyze([], { startDate: date }), /Границы/);
  for (const zone of ['Not/A_Zone', '', null, 100]) assert.throws(() => analyze([], { timezone: zone }), /зон/);
  assert.throws(() => analyze([], { anonymize: 'yes' }), /анонимизации/);
  assert.throws(() => analyze([], { startDate: '2026-02-01', endDate: '2026-01-01' }), /позже/);
  assert.throws(() => analyze([], { startDate: '1900-01-01', endDate: '2100-01-01' }), /100 лет/);
  assert.throws(() => analyze([], { typo: true }), /Неизвестная настройка/);
  assert.throws(() => analyze([], { toString: true }), /Неизвестная настройка/);
  assert.throws(() => analyze([], null), /объектом/);
  assert.equal(DEFAULT_OPTIONS.sessionGapHours, 6);
  assert.ok(Object.isFrozen(DEFAULT_OPTIONS));
  assert.doesNotThrow(() => analyze([], { startDate: '2024-02-29', timezone: 'Europe/Moscow', sessionGapHours: 0.5 }));
});

test('quality counters partition original records and duplicate invalid rows do not shadow a valid row', () => {
  const first = message(1, 'A', at(0));
  const result = analyze([
    first,
    { ...first, text: 'duplicate should be removed' },
    { id: 2, type: 'service', date: 'not a date' },
    null,
    message(3, 'B', at(60), { date: '2026-02-30T12:00:00' }),
    message(4, 'B', at(60), { from: null, from_id: null }),
    message(5, 'B', at(60), { date_unixtime: 'garbage' }),
    message(5, 'B', at(60)),
    message(6, 'B', at(120), { date: '2026-01-01T25:00:00' }),
    { type: 'unknown' },
  ]);
  assert.deepEqual({ ...result.quality, warnings: [] }, { totalRecords: 10, validMessages: 2, serviceMessages: 1, invalidMessages: 6, duplicates: 1, outsideRange: 0, warnings: [] });
  assert.equal(result.summary.messages, 2);
  assert.equal(result.participants[0].words, 0);
  assert.equal(result.quality.totalRecords, result.quality.validMessages + result.quality.serviceMessages + result.quality.invalidMessages + result.quality.duplicates);
});

test('sorts events stably, treats equal timestamps as zero-latency replies and keeps author identity across renames', () => {
  const result = analyze([
    message(2, 'new-name', at(60), { from_id: 'same-user' }),
    message(1, 'old-name', at(0), { from_id: 'same-user' }),
    message(3, 'B', at(60)),
  ], { anonymize: false });
  assert.equal(result.participants.length, 2);
  assert.equal(result.participants[0].name, 'new-name');
  assert.equal(result.participants[0].messages, 2);
  assert.equal(result.participants[1].response.medianSeconds, 0);
  assert.equal(result.participants[1].response.under5minPct, 100);
  const fallback = analyze([message(1, 'Name', at(0), { from_id: undefined }), message(2, 'Name', at(60), { from_id: undefined })]);
  assert.equal(fallback.participants.length, 1);
  assert.match(fallback.quality.warnings.join(' '), /нет ID автора/);
});

test('chosen IANA timezone groups epoch timestamps independently of exported local dates', () => {
  const rows = [message(1, 'A', '2026-01-01T23:30:00', { date: '2026-01-01T10:30:00' }), message(2, 'B', '2026-01-02T00:30:00', { date: '2026-01-01T11:30:00' })];
  const exported = analyze(rows);
  assert.equal(exported.daily.length, 1);
  assert.equal(exported.daily[0].date, '2026-01-01');
  const utc = analyze(rows, { timezone: 'UTC' });
  assert.deepEqual(utc.daily.map((day) => day.total), [1, 1]);
  const moscow = analyze(rows, { timezone: 'Europe/Moscow' });
  assert.equal(moscow.daily.length, 1);
  assert.equal(moscow.daily[0].date, '2026-01-02');
  assert.equal(moscow.participants[1].response.medianSeconds, 3600);
  assert.equal(moscow.heatmap.find((cell) => cell.day === 4 && cell.hour === 2).a, 1);
  assert.equal(moscow.heatmap.find((cell) => cell.day === 4 && cell.hour === 3).b, 1);
});

test('DST transitions do not alter elapsed time or create artificial sessions', () => {
  const spring = analyze([
    message(1, 'A', '2026-03-08T06:30:00'),
    message(2, 'B', '2026-03-08T07:30:00'),
  ], { timezone: 'America/New_York', sessionGapHours: 1.5 });
  assert.equal(spring.summary.sessions, 1);
  assert.equal(spring.participants[1].response.medianSeconds, 3600);
  assert.equal(spring.heatmap.find((cell) => cell.day === 6 && cell.hour === 1).a, 1);
  assert.equal(spring.heatmap.find((cell) => cell.day === 6 && cell.hour === 3).b, 1);
  const fall = analyze([
    message(1, 'A', '2026-11-01T05:30:00'),
    message(2, 'B', '2026-11-01T06:30:00'),
  ], { timezone: 'America/New_York' });
  assert.equal(fall.participants[1].response.medianSeconds, 3600);
  assert.equal(fall.heatmap.find((cell) => cell.day === 6 && cell.hour === 1).total, 2);
});

test('fallback timestamps warn, preserve explicit offsets, reject nonexistent local hours and permit timestamp-only records', () => {
  const naive = analyze([message(1, 'A', '2026-01-01T12:00:00', { date_unixtime: undefined })], { timezone: 'Europe/Moscow' });
  assert.equal(naive.summary.messages, 1);
  assert.equal(naive.heatmap.find((cell) => cell.day === 3 && cell.hour === 12).a, 1);
  assert.match(naive.quality.warnings.join(' '), /без Unix-времени/);
  const withOffset = analyze([message(1, 'A', '2026-01-01T12:00:00+03:00', { date_unixtime: undefined })], { timezone: 'UTC' });
  assert.equal(withOffset.heatmap.find((cell) => cell.day === 3 && cell.hour === 9).a, 1);
  const nonexistent = analyze([message(1, 'A', '2026-03-08T02:30:00', { date_unixtime: undefined })], { timezone: 'America/New_York' });
  assert.equal(nonexistent.quality.invalidMessages, 1);
  const ambiguous = analyze([message(1, 'A', '2026-11-01T01:30:00', { date_unixtime: undefined }), message(2, 'B', '2026-11-01T06:30:00')], { timezone: 'America/New_York' });
  assert.equal(ambiguous.participants[1].response.medianSeconds, 3600);
  const timestampOnly = analyze([message(1, 'A', at(0), { date: undefined })]);
  assert.equal(timestampOnly.daily[0].date, '2026-01-01');
  assert.match(timestampOnly.quality.warnings.join(' '), /нет локальной даты/);
});

test('session boundaries use >= gap, turns coalesce consecutive author messages and response timing begins at the previous last message', () => {
  const result = analyze([
    message(1, 'A', at(0)), message(2, 'A', at(60)), message(3, 'B', at(180)),
    message(4, 'B', at(240)), message(5, 'A', at(420)), message(6, 'B', at(22020)),
  ]);
  assert.equal(result.summary.sessions, 2);
  assert.equal(result.summary.eligibleStarts, 1);
  assert.equal(result.participants[0].starts, 0);
  assert.equal(result.participants[1].starts, 1);
  assert.equal(result.participants[0].turns, 2);
  assert.equal(result.participants[1].turns, 2);
  assert.deepEqual(result.participants[0].response, { count: 1, medianSeconds: 180, p90Seconds: 180, under5minPct: 100 });
  assert.deepEqual(result.participants[1].response, { count: 1, medianSeconds: 120, p90Seconds: 120, under5minPct: 100 });
  assert.equal(result.participants[0].unansweredSessions, 1);
  assert.equal(result.participants[1].unansweredSessions, 0);
  assert.equal(result.summary.twoSidedSessionPct, 50);
  assert.deepEqual(result.sessions.map((session) => session.messages), [5, 1]);
  assert.deepEqual(result.sessions.map((session) => session.censored), [true, true]);
  const below = analyze([message(1, 'A', at(0)), message(2, 'B', at(21599))]);
  assert.equal(below.summary.sessions, 1);
  assert.equal(below.participants[1].response.count, 1);
});

test('first filtered session stays censored and participant order stays stable across date filters', () => {
  const rows = [message(1, 'A', '2026-01-01T12:00:00'), message(2, 'B', '2026-01-03T12:00:00'), message(3, 'A', '2026-01-04T12:00:00')];
  const result = analyze(rows, { startDate: '2026-01-02', endDate: '2026-01-04' });
  assert.equal(result.participants[0].key, 'a');
  assert.equal(result.participants[1].key, 'b');
  assert.deepEqual(result.daily.map((day) => day.total), [0, 1, 1]);
  assert.equal(result.participants[1].starts, 0);
  assert.equal(result.participants[0].starts, 1);
  assert.equal(result.summary.eligibleStarts, 1);
  assert.equal(result.quality.outsideRange, 1);
  assert.equal(result.quality.validMessages, 3);
  const emptyGap = analyze(rows, { startDate: '2026-01-02', endDate: '2026-01-02' });
  assert.equal(emptyGap.summary.days, 1);
  assert.equal(emptyGap.summary.messages, 0);
  assert.deepEqual(emptyGap.daily.map((day) => day.total), [0]);
  const outside = analyze(rows, { startDate: '2027-01-01' });
  assert.equal(outside.summary.days, 0);
  assert.equal(outside.meta.startDate, '');
});

test('continuous day grid includes zero days, 7-day averages, streaks, elapsed silence and month boundaries', () => {
  const result = analyze([
    message(1, 'A', '2026-01-29T12:00:00'), message(2, 'B', '2026-01-30T12:00:00'),
    message(3, 'A', '2026-02-04T12:00:00'), message(4, 'B', '2026-02-05T12:00:00'),
  ]);
  assert.deepEqual(result.daily.map((day) => day.total), [1, 1, 0, 0, 0, 0, 1, 1]);
  assert.equal(result.daily[5].avg7, null);
  assert.equal(result.daily[6].avg7, 0.43);
  assert.equal(result.daily[7].avg7, 0.43);
  assert.equal(result.summary.longestStreakDays, 2);
  assert.equal(result.summary.longestSilenceHours, 120);
  assert.equal(result.summary.activeDayPct, 50);
  assert.deepEqual(result.monthly.map((month) => [month.month, month.total]), [['2026-01', 2], ['2026-02', 2]]);
});

test('response quantiles use linear interpolation and under5min excludes exactly five minutes', () => {
  const result = analyze([message(1, 'A', at(0)), message(2, 'B', at(60)), message(3, 'A', at(120)), message(4, 'B', at(420)), message(5, 'A', at(480)), message(6, 'B', at(1380))]);
  assert.deepEqual(result.participants[1].response, { count: 3, medianSeconds: 300, p90Seconds: 780, under5minPct: 33.33 });
  assert.equal(result.monthly[0].responseB, 300);
  assert.equal(result.monthly[0].responseA, 60);
});

test('format and text measures count messages with features, not punctuation or repeated links', () => {
  const result = analyze([
    message(1, 'A', at(0), { text: ['Привет, ', { type: 'bold', text: 'мир' }, '?? 👋'], photo: 'not included', reactions: [{ count: 2 }, { count: -2 }, { count: 1 }], edited: '2026-01-01T00:01:00' }),
    message(2, 'A', at(60), { text: [{ type: 'text_link', text: 'сайт', href: 'https://private.example/hidden' }], media_type: 'voice_message', duration_seconds: 14.5, forwarded_from: 'Source', reply_to_message_id: 1 }),
    message(3, 'B', at(120), { text: 'https://example.com https://example.org', media_type: 'video_message', duration_seconds: 7 }),
    message(4, 'B', at(180), { media_type: 'video_file', duration_seconds: 10 }),
    message(5, 'B', at(240), { media_type: 'sticker' }),
    message(6, 'B', at(300), { file: 'anything.bin', duration_seconds: 12 }),
    message(7, 'B', at(360), { poll: { question: 'private question' } }),
  ]);
  const [a, b] = result.participants;
  assert.equal(a.words, 3);
  assert.equal(a.characters, [...'Привет, мир?? 👋сайт'].length);
  assert.equal(a.questions, 1);
  assert.equal(a.links, 1);
  assert.equal(a.reactionsReceived, 3);
  assert.equal(a.edited, 1);
  assert.equal(a.forwards, 1);
  assert.equal(a.replies, 1);
  assert.equal(a.media.photo, 1);
  assert.equal(a.media.voice_message, 1);
  assert.equal(a.voiceSeconds, 14.5);
  assert.equal(b.links, 1);
  assert.equal(b.media.video_message, 1);
  assert.equal(b.media.video_file, 1);
  assert.equal(b.media.sticker, 1);
  assert.equal(b.media.file, 1);
  assert.equal(b.media.other, 1);
  assert.equal(b.videoSeconds, 17);
  assert.equal(a.nightMessages, 2);
});

test('three descriptive indices follow the documented formulas and sensitivity includes the selected threshold', () => {
  const result = analyze([message(1, 'A', at(0)), message(2, 'A', at(60)), message(3, 'A', at(120)), message(4, 'B', at(180)), message(5, 'B', at(86400 * 2))], { sessionGapHours: 3 });
  assert.equal(result.summary.mutualityScore, 80);
  assert.equal(result.summary.exchangeScore, 50);
  assert.equal(result.summary.continuityScore, 66.67);
  assert.deepEqual(result.sensitivity.map((row) => row.hours), [2, 3, 6, 12, 24]);
  const selected = result.sensitivity.find((row) => row.hours === 3);
  assert.equal(selected.eligibleStarts, result.summary.eligibleStarts);
  assert.equal(selected.a + selected.b, result.summary.eligibleStarts);
  assert.equal(selected.twoSidedPct, result.summary.exchangeScore);
  assertFiniteTree(result);
});

function dailyFixture(counts) {
  let id = 0;
  return counts.flatMap((count, day) => Array.from({ length: count }, (_, index) => message(++id, index % 2 ? 'B' : 'A', at(day * 86400 + 3600 + index))));
}

test('trend needs 35 complete days, excludes both boundary days and compares 7 days with preceding 28', () => {
  const short = analyze(dailyFixture(Array(36).fill(2)));
  assert.equal(short.trend.available, false);
  assert.equal(short.trend.comparisonDays, 7);
  assert.equal(short.trend.baselineDays, 27);
  const result = analyze(dailyFixture([99, ...Array(28).fill(1), ...Array(7).fill(5), 100]));
  assert.deepEqual(result.trend, { available: true, previousMean: 1, currentMean: 5, changePct: 400, zScore: null, direction: 'up', baselineDays: 28, comparisonDays: 7, excludedBoundaryDays: 2 });
  const down = analyze(dailyFixture([1, ...Array(28).fill(10), ...Array(7).fill(1), 1]));
  assert.equal(down.trend.direction, 'down');
  const stable = analyze(dailyFixture([1, ...Array(28).fill(2), ...Array(7).fill(3), 1]));
  assert.equal(stable.trend.direction, 'stable');
});

test('zero trend baseline does not produce infinite growth or fabricate a z-score', () => {
  const result = analyze(dailyFixture([1, ...Array(28).fill(0), ...Array(7).fill(4), 1]));
  assert.equal(result.trend.available, true);
  assert.equal(result.trend.previousMean, 0);
  assert.equal(result.trend.currentMean, 4);
  assert.equal(result.trend.changePct, null);
  assert.equal(result.trend.zScore, null);
  assert.equal(result.trend.direction, 'up');
  assertFiniteTree(result);
});

test('anonymized aggregate output retains no message text, identifiers, names, paths or entity targets', () => {
  const secret = '<script>alert("SECRET_CHAT_TEXT")</script>';
  const raw = chat([message('SECRET_ID', 'SECRET_NAME', at(0), { text: [{ type: 'text_link', text: secret, href: 'https://SECRET_TARGET.example' }], from_id: 'SECRET_FROM_ID', photo: 'SECRET_PATH', forwarded_from: 'SECRET_FORWARD', reply_to_message_id: 'SECRET_REPLY' })], { name: 'SECRET_TITLE', id: 'SECRET_CHAT_ID' });
  const before = JSON.stringify(raw);
  const result = analyzeExport(raw);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('SECRET'));
  assert.ok(!serialized.includes('<script>'));
  assert.equal(JSON.stringify(raw), before, 'does not mutate input');
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'meta', 'quality', 'participants', 'summary', 'daily', 'monthly', 'heatmap', 'sessions', 'sensitivity', 'trend', 'insights']);
  assert.equal(result.participants[0].name, 'Участник A');
  const named = analyzeExport(raw, { anonymize: false });
  assert.equal(named.participants[0].name, 'SECRET_NAME');
  assert.equal(named.meta.title, 'SECRET_NAME');
  assert.ok(!JSON.stringify(named).includes('SECRET_CHAT_TEXT'));
  assert.ok(!JSON.stringify(named).includes('SECRET_FROM_ID'));
});

test('enormous calendar ranges are rejected unless a bounded filter is selected', () => {
  const rows = [message(1, 'A', '1900-01-01T00:00:00'), message(2, 'B', '2100-01-01T00:00:00')];
  assert.throws(() => analyze(rows), /100 лет/);
  assert.doesNotThrow(() => analyze(rows, { startDate: '2099-12-30', endDate: '2100-01-01' }));
});

test('representative 46k-message workload preserves accounting and finite bounded aggregates', () => {
  const rows = Array.from({ length: 46000 }, (_, index) => message(index, index % 5 ? 'A' : 'B', at(Math.floor(index * 208 * 86400 / 45999)), { text: ['Привет ', { type: 'bold', text: 'мир' }], ...(index % 20 === 0 ? { media_type: 'voice_message', duration_seconds: 10 } : {}) }));
  const result = analyze(rows);
  assert.equal(result.summary.messages, 46000);
  assert.equal(result.summary.days, 209);
  assert.equal(result.participants.reduce((sum, participant) => sum + participant.messages, 0), 46000);
  assert.equal(result.daily.reduce((sum, day) => sum + day.total, 0), 46000);
  assert.equal(result.heatmap.reduce((sum, cell) => sum + cell.total, 0), 46000);
  assert.equal(result.monthly.reduce((sum, month) => sum + month.total, 0), 46000);
  assert.equal(result.sessions.reduce((sum, session) => sum + session.messages, 0), 46000);
  assert.ok(JSON.stringify(result).length < 100000);
  assertFiniteTree(result);
});


test('epoch values outside the supported calendar range cannot hide behind a valid export date', () => {
  const result = analyze([message(1, 'A', at(0), { date_unixtime: '8640000000000' })]);
  assert.equal(result.quality.invalidMessages, 1);
  assert.equal(result.summary.messages, 0);
});


test('insights report actual peaks, eligible starts and trend samples without retaining message contents', () => {
  const result = analyze([
    message(1, 'SECRET_NAME_A', '2026-01-01T00:00:00', { text: 'SECRET_MESSAGE_TEXT' }),
    message(2, 'SECRET_NAME_B', '2026-01-01T00:01:00'),
    message(3, 'SECRET_NAME_B', '2026-01-02T12:00:00'),
    message(4, 'SECRET_NAME_A', '2026-01-02T12:01:00'),
    message(5, 'SECRET_NAME_A', '2026-01-02T12:02:00'),
    message(6, 'SECRET_NAME_A', '2026-01-04T12:00:00'),
  ], { sessionGapHours: 12 });
  assert.equal(result.insights.length, 3);
  assert.match(result.insights[0].body, /Максимум за день: 3/);
  assert.match(result.insights[0].body, /2026-01-02/);
  assert.match(result.insights[0].body, /50%/);
  assert.match(result.insights[1].body, /Участник A: 1; Участник B: 1/);
  assert.match(result.insights[1].body, /начал: 2/);
  assert.match(result.insights[1].body, /от 12 ч/);
  assert.match(result.insights[2].body, /дней в периоде: 2/);
  assert.match(result.insights[2].body, /Не хватает 33/);
  assert.ok(!JSON.stringify(result.insights).includes('SECRET'));
  const tied = analyze(dailyFixture([2, 2]));
  assert.match(tied.insights[0].body, /Дата: 2026-01-01/);
  assert.match(tied.insights[0].body, /Дней с таким максимумом: 2/);
  const stable = analyze(dailyFixture(Array(37).fill(2)));
  assert.equal(stable.insights.length, 3);
  assert.match(stable.insights[2].body, /7 полных дней: 2; за предшествующие 28: 2/);
  assert.match(stable.insights[2].body, /Изменение: 0%/);
  const empty = analyze([]);
  assert.equal(empty.insights.length, 2);
  assert.equal(empty.insights[0].title, 'В периоде нет сообщений');
  assert.ok(!empty.insights.some((insight) => insight.title === 'Пик активности'));
});


test('optional lexicon counts occurrences and exact lowercase forms, strips addresses and excludes stop words and numbers', () => {
  const result = analyze([
    message(1, 'A', at(0), { text: 'Море море МОРЕ океан 12345 42 https://secret.example/private/path alex@example.org www.domain.net/contact t.me/username bare.example/route hidden.example?q=PRIVATE_QUERY mailto:alex@example.org?subject=PRIVATE_SUBJECT это чтобы когда THE and WITH аб' }),
    message(2, 'B', at(60), { text: 'море океан ОКЕАН привет привет' }),
    message(3, 'A', at(120), { text: 'океан café cafe\u0301', forwarded_from: 'Original author' }),
  ], { includeLexicon: true });
  assert.equal(result.meta.includeLexicon, true);
  assert.deepEqual(result.lexicon, {
    words: [
      { term: 'море', a: 3, b: 1, total: 4 },
      { term: 'океан', a: 2, b: 2, total: 4 },
      { term: 'café', a: 2, b: 0, total: 2 },
      { term: 'привет', a: 0, b: 2, total: 2 },
    ],
    emojis: [], excludedStopWords: true, minimumWordLength: 3, limit: 24,
  });
  assert.ok(!JSON.stringify(result.lexicon).includes('private'));
});

test('emoji lexicon preserves complete graphemes and excludes sticker metadata and reactions', () => {
  const result = analyze([
    message(1, 'A', at(0), { text: '👩🏽‍💻 👩🏽‍💻 👨‍👩‍👧‍👦 🇷🇺 1️⃣ ❤️', sticker_emoji: '💜', reactions: [{ count: 7, emoji: '💚' }] }),
    message(2, 'B', at(60), { text: '👩🏽‍💻 🇷🇺 ❤️ 😀' }),
  ], { includeLexicon: true });
  const emoji = Object.fromEntries(result.lexicon.emojis.map((row) => [row.term, row]));
  assert.deepEqual(emoji['👩🏽‍💻'], { term: '👩🏽‍💻', a: 2, b: 1, total: 3 });
  assert.deepEqual(emoji['🇷🇺'], { term: '🇷🇺', a: 1, b: 1, total: 2 });
  assert.deepEqual(emoji['❤️'], { term: '❤️', a: 1, b: 1, total: 2 });
  assert.equal(emoji['👨‍👩‍👧‍👦'].total, 1);
  assert.equal(emoji['1️⃣'].total, 1);
  assert.equal(emoji['😀'].total, 1);
  assert.equal(result.lexicon.emojis.length, 6);
  assert.equal(emoji['💜'], undefined);
  assert.equal(emoji['💚'], undefined);
  assert.equal(emoji['🏽'], undefined);
  assert.deepEqual(result.lexicon.words, []);
});

test('lexicon respects the selected calendar zone and dates, ignores duplicates and preserves stable author keys', () => {
  const selected = message(2, 'B', '2026-01-01T22:00:00', { text: ['visible ', { type: 'text_link', text: 'visible', href: 'https://SECRET_TARGET.example' }, ' 🌙'] });
  const result = analyze([
    selected,
    message(1, 'A', '2026-01-01T12:00:00', { text: 'excludedword 🪷' }),
    selected,
  ], { includeLexicon: true, timezone: 'Europe/Moscow', startDate: '2026-01-02', endDate: '2026-01-02' });
  assert.deepEqual(result.lexicon.words, [{ term: 'visible', a: 0, b: 2, total: 2 }]);
  assert.deepEqual(result.lexicon.emojis, [{ term: '🌙', a: 0, b: 1, total: 1 }]);
  assert.equal(result.quality.duplicates, 1);
  assert.equal(result.quality.outsideRange, 1);
  assert.ok(!JSON.stringify(result.lexicon).includes('SECRET'));
});

test('lexicon is off by default, is strictly opt-in and has honest empty results', () => {
  const rows = [message(1, 'A', at(0), { text: 'SENSITIVEWORD 🪷' })];
  assert.equal(DEFAULT_OPTIONS.includeLexicon, false);
  for (const options of [{}, { includeLexicon: false }]) {
    const result = analyze(rows, options);
    assert.equal(result.meta.includeLexicon, false);
    assert.equal(Object.hasOwn(result, 'lexicon'), false);
    assert.ok(!JSON.stringify(result).includes('sensitiveword'));
    assert.ok(!JSON.stringify(result).includes('SENSITIVEWORD'));
    assert.ok(!JSON.stringify(result).includes('🪷'));
  }
  for (const value of ['true', 1, 0, null, undefined]) assert.throws(() => analyze(rows, { includeLexicon: value }), /слов и эмодзи/);
  const empty = analyze([], { includeLexicon: true });
  assert.deepEqual(empty.lexicon, { words: [], emojis: [], excludedStopWords: true, minimumWordLength: 3, limit: 24 });
});

test('lexicon top lists are capped at 24 with deterministic frequency and ordinal tie ordering', () => {
  const terms = Array.from({ length: 40 }, (_, index) => `term${String(index).padStart(2, '0')}`);
  const rows = [message(1, 'A', at(0), { text: terms.toReversed().join(' ') }), message(2, 'B', at(60), { text: 'term39 term39 term38' })];
  const result = analyze(rows, { includeLexicon: true });
  assert.equal(result.lexicon.words.length, 24);
  assert.deepEqual(result.lexicon.words.slice(0, 3), [
    { term: 'term39', a: 1, b: 2, total: 3 },
    { term: 'term38', a: 1, b: 1, total: 2 },
    { term: 'term00', a: 1, b: 0, total: 1 },
  ]);
  assert.deepEqual(result.lexicon.words.slice(2).map((row) => row.term), terms.slice(0, 22));
  const shuffled = analyze([rows[1], rows[0]], { includeLexicon: true });
  assert.deepEqual(shuffled.lexicon, result.lexicon);
});
