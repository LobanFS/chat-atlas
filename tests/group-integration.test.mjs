import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExport } from '../src/engine.js';
import { renderReport } from '../src/report.js';
import { renderDocument, renderNavigation } from '../src/document.js';
import { createGroupDemo } from '../src/demo.js';
import { buildGroupExplorerSeries } from '../src/group-explore.js';

const make = (id, author, date, extra = {}) => ({ id, type: 'message', from: `Name ${author}`, from_id: `private-user-${author}`, date, date_unixtime: String(Date.parse(`${date}Z`) / 1000), text: 'PRIVATE_MESSAGE_BODY', ...extra });
function groupFixture() {
  return { type: 'private_supergroup', id: 701, name: 'PRIVATE_GROUP_TITLE', messages: [
    make(1, 'A', '2026-01-01T10:00:00'),
    make(2, 'B', '2026-01-01T11:00:00', { reply_to_message_id: 1 }),
    make(3, 'C', '2026-01-01T11:01:00', { reply_to_message_id: 2 }),
    make(4, 'D', '2026-01-01T11:02:00'),
    make(5, 'A', '2026-01-02T10:00:00', { reply_to_message_id: 2 }),
    make(6, 'B', '2026-01-02T10:01:00', { reply_to_message_id: 5 }),
    make(7, 'B', '2026-01-02T10:02:00', { reply_to_message_id: 6 }),
    make(8, 'C', '2026-01-02T10:03:00', { reply_to_message_id: 5, reply_to_peer_id: 'channel999' }),
    make(9, 'C', '2026-01-02T10:04:00', { reply_to_message_id: 5, reply_to_peer_id: 'channel701' }),
    make(10, 'D', '2026-01-02T10:05:00', { reply_to_message_id: 11 }),
    make(11, 'A', '2026-01-02T10:06:00', { from: 'Latest name A', reply_to_message_id: 9 }),
    make(12, 'D', '2026-01-02T10:06:00', { reply_to_message_id: 11 }),
    make(13, 'D', '2026-01-03T10:00:00'),
    make(14, 'B', '2026-01-03T10:01:00', { reply_to_message_id: 99 }),
    { id: 99, type: 'service', date: '2026-01-03T10:00:00' },
  ] };
}

test('group filters keep stable identities while excluding unavailable reply sources and censoring first starts', () => {
  const input = groupFixture();
  const all = analyzeExport(input);
  let profiles;
  const data = analyzeExport(input, { startDate: '2026-01-02', anonymize: false, participantNames: { p3: 'Custom C' } }, p => { profiles = p; });
  assert.equal(data.meta.chatType, 'group');
  assert.equal(data.summary.messages, 10);
  assert.equal(data.quality.outsideRange, 4);
  assert.deepEqual(data.participants.map(p => p.key), all.participants.map(p => p.key));
  assert.deepEqual(data.participants.map(p => p.messages), [2, 3, 2, 3]);
  assert.equal(data.participants[0].name, 'Latest name A');
  assert.equal(data.participants[2].name, 'Custom C');
  assert.deepEqual(data.group.replyCoverage, { total: 9, resolved: 4, unresolved: 4, self: 1 });
  assert.equal(data.group.replyEdges.reduce((sum, edge) => sum + edge.count, 0), 4);
  assert.deepEqual(data.participants.map(p => p.response.medianSeconds), [120, 60, 240, 0]);
  assert.equal(data.summary.sessions, 2);
  assert.deepEqual(data.participants.map(p => p.starts), [0, 0, 0, 1]);
  assert.equal(data.summary.eligibleStarts, 1);
  assert.ok(profiles.some(p => p.sourceId === 'private-user-C'));
  for (const marker of ['private-user-', 'PRIVATE_MESSAGE_BODY', 'channel701']) assert.ok(!JSON.stringify(data).includes(marker), `Aggregate must not contain ${marker}`);
  assert.ok(!JSON.stringify(all).includes('PRIVATE_GROUP_TITLE'));
});

test('aggregate totals reconcile by author, day, month, heatmap and initiative after filtering', () => {
  const data = analyzeExport(groupFixture(), { startDate: '2026-01-02' });
  assert.equal(data.participants.reduce((n, p) => n + p.messages, 0), data.summary.messages);
  assert.equal(data.daily.reduce((n, d) => n + d.total, 0), data.summary.messages);
  assert.equal(data.monthly.reduce((n, m) => n + m.total, 0), data.summary.messages);
  assert.equal(data.heatmap.reduce((n, c) => n + c.total, 0), data.summary.messages);
  assert.equal(data.participants.reduce((n, p) => n + p.starts, 0), data.summary.eligibleStarts);
  for (const p of data.participants) {
    for (const [participantField, dailyField] of [['messages', 'messages'], ['words', 'words'], ['starts', 'starts'], ['laughterMessages', 'laughter']]) {
      assert.equal(data.daily.reduce((n, d) => n + (d.byParticipant[p.key]?.[dailyField] || 0), 0), p[participantField]);
      assert.equal(data.monthly.reduce((n, m) => n + (m.byParticipant[p.key]?.[dailyField] || 0), 0), p[participantField]);
    }
    assert.equal(data.heatmap.reduce((n, c) => n + (c.byParticipant[p.key] || 0), 0), p.messages);
  }
  assert.equal(data.daily.reduce((n, d) => n + d.uniqueAuthors, 0), 6);
});

test('group chart folds every unselected author into others without changing totals or weighted shares', () => {
  const participants = Array.from({ length: 30 }, (_, i) => ({ key: `p${i+1}`, name: `Person ${i+1}`, messages: 10 - i / 10 }));
  const daily = Array.from({ length: 8 }, (_, day) => {
    const byParticipant = Object.fromEntries(participants.map((p, i) => [p.key, { messages: day === 0 ? i + 1 : (i + day) % 4, words: i + day, starts: 0, laughter: 0 }]));
    return { date: `2026-01-0${day+1}`, total: Object.values(byParticipant).reduce((s, v) => s + v.messages, 0), uniqueAuthors: Object.values(byParticipant).filter(v => v.messages > 0).length, byParticipant };
  });
  const series = buildGroupExplorerSeries(daily, participants);
  assert.equal(series.people.length, 6);
  assert.equal(series.people.at(-1).key, 'other');
  for (let i = 0; i < daily.length; i++) assert.equal(series.rows[i].total, daily[i].total);
  assert.equal(series.rows[5].average, null);
  const firstSeven = daily.slice(0, 7).reduce((s, v) => s + v.total, 0);
  assert.equal(series.rows[6].average, firstSeven / 7);
  const selectedFirst = daily.slice(0, 7).reduce((s, v) => s + v.byParticipant.p1.messages, 0);
  assert.equal(series.rows[6].shares.p1, 100 * selectedFirst / firstSeven);
  assert.ok(Math.abs(Object.values(series.rows[6].shares).reduce((s, v) => s + v, 0) - 100) < 1e-9);
  const collapsed = buildGroupExplorerSeries(daily, participants, { selected: [], window: 1 });
  assert.deepEqual(collapsed.people.map(p => p.key), ['other']);
  assert.deepEqual(collapsed.rows.map(r => r.counts.other), daily.map(d => d.total));
  const authors = buildGroupExplorerSeries(daily, participants, { metric: 'authors', window: 1 });
  assert.deepEqual(authors.rows.map(r => r.total), daily.map(d => d.uniqueAuthors));
});

test('all group report modes escape names and portable chart payload contains aggregate allowlist only', () => {
  const input = groupFixture();
  const hostile = '</script><img src=x onerror="alert(1)">';
  const data = analyzeExport(input, { anonymize: false, participantNames: { p3: hostile } });
  data.participants[0].sourceId = 'PRIVATE_SOURCE_ID';
  data.daily[0].rawMessage = 'PRIVATE_RAW_MESSAGE';
  data.daily[0].byParticipant.a.sourceId = 'PRIVATE_NESTED_ID';
  for (const mode of ['full', 'overview', 'rhythm', 'dialogue']) {
    const body = renderReport(data, { mode });
    assert.doesNotMatch(body, /<img\b|<script\b/);
    assert.ok(body.includes('&lt;/script&gt;&lt;img'));
    assert.doesNotMatch(body, /PRIVATE_MESSAGE_BODY|PRIVATE_SOURCE_ID|PRIVATE_RAW_MESSAGE|PRIVATE_NESTED_ID/);
    const html = renderDocument(data, body, '', { mode, runtime: '/* local aggregate runtime */' });
    const raw = html.match(/<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw, 'All group modes retain local participant controls');
    const payload = JSON.parse(raw);
    assert.equal(payload.meta.chatType, 'group');
    assert.equal(payload.participants.length, 4);
    assert.doesNotMatch(raw, /PRIVATE_SOURCE_ID|PRIVATE_RAW_MESSAGE|PRIVATE_NESTED_ID|<img|<\/script>/);
    assert.equal(payload.participants[2].name, hostile);
    assert.match(html, /connect-src 'none'/);
  }
});


test('synthetic group demo supplies correct sections and matching navigation for every mode', () => {
  const data = analyzeExport(createGroupDemo(), { anonymize: false });
  assert.equal(data.meta.chatType, 'group');
  assert.ok(data.participants.length > 2);
  assert.ok(data.summary.messages > 0);
  for (const [mode, expected] of Object.entries({ full: ['overview','rhythm','dialogue','habits','method'], overview: ['overview','method'], rhythm: ['overview','rhythm','method'], dialogue: ['overview','dialogue','method'] })) {
    const body = renderReport(data, { mode });
    assert.deepEqual([...body.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]), expected);
    const nav = renderNavigation(mode, false, true);
    assert.deepEqual([...nav.matchAll(/href="#([^"]+)"/g)].map(m => m[1]), expected);
    if (expected.includes('dialogue')) assert.ok(nav.includes('Обсуждения'));
  }
});

test('laughter appears in personal and group reports with each author as its own rate denominator', () => {
  const messages = Array.from({ length: 110 }, (_, i) => make(i+1, i<100?'A':'B', `2026-01-01T10:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`, { text: i<10 || i>=100&&i<102?'АХАХА!':'обычный текст' }));
  for (const type of ['personal_chat','private_supergroup']) {
    const data = analyzeExport({ type, id: 701, messages }, { anonymize: false });
    assert.deepEqual(data.participants.map(p => p.laughterMessages), [10, 2]);
    const body = renderReport(data);
    assert.ok(body.includes('Смех в переписке'));
    if (type==='private_supergroup') {
      const laughTable = body.match(/<caption class="sr-only">Текстовый смех и эмодзи по участникам<\/caption>([\s\S]*?)<\/table>/)?.[1];
      const row = [...laughTable.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].find(m => m[1].includes('Name B'))?.[1];
      assert.match(row, /<td>20<small>из 10 сообщений · мало данных/);
    } else {
      const card = [...body.matchAll(/<article>([\s\S]*?)<\/article>/g)].find(m => m[1].includes('<h4>Name B</h4>'))?.[1];
      assert.ok(card?.includes('20 на 100 своих сообщений'));
      assert.ok(card?.includes('Всего сообщений: 10 · мало данных'));
    }
  }
});
