import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeExport } from '../src/engine.js';

const row = (id, author, hour, extra = {}) => ({ id, type: 'message', from_id: `user${author}`, from: `Name ${author}`, date: new Date(Date.UTC(2026,0,1) + hour*3600000).toISOString().slice(0,19), date_unixtime: String(Date.UTC(2026,0,1)/1000 + hour*3600), text: '', ...extra });
const chat = (messages, extra = {}) => ({ type: 'private_supergroup', id: 123, name: 'SECRET_GROUP', messages, ...extra });
const analyze = (messages, options, extra) => analyzeExport(chat(messages, extra), options);

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(finite);
  else if (value && typeof value === 'object') Object.values(value).forEach(finite);
}

test('all Telegram group types keep stable identities with more than nine authors and sparse per-day aggregates', () => {
  const rows = Array.from({ length: 11 }, (_, index) => row(index+1, index+1, index, { text: 'два слова' }));
  for (const type of ['private_group', 'private_supergroup', 'public_supergroup']) {
    const result = analyze(rows, {}, { type });
    assert.equal(result.meta.chatType, 'group');
    assert.deepEqual(result.participants.map(p=>p.key), ['a','b','p3','p4','p5','p6','p7','p8','p9','p10','p11']);
    assert.equal(result.participants[10].name, 'Участник 11');
    assert.equal(result.summary.messages, 11);
    assert.equal(result.summary.totalParticipants, 11);
    assert.equal(result.summary.activeParticipants, 11);
    assert.equal(result.daily[0].uniqueAuthors, 11);
    assert.deepEqual(result.daily[0].byParticipant.p10, { messages: 1, words: 2, starts: 0, laughter: 0 });
    assert.equal(Object.values(result.heatmap[3*24+9].byParticipant).reduce((s,n)=>s+n,0), 1);
    assert.equal(Object.values(result.monthly[0].byParticipant).reduce((s,p)=>s+p.messages,0), 11);
    assert.equal(result.group.sessions.multiAuthor, 1);
    assert.equal(result.group.sessions.medianAuthors, 11);
    assert.equal(result.group.sessions.maxAuthors, 11);
    assert.ok(result.participants.every(p=>p.response.count===0), 'adjacent authors never fabricate group replies');
    assert.match(result.quality.warnings.join(' '), /не полный состав группы/);
    finite(result);
  }
});

test('group identity metadata stays local, names track latest export and aliases survive filtering', () => {
  const rows = [row(1,1,0), row(2,2,1), row(3,3,24), row(4,3,48,{from:'Updated name'})];
  let profiles;
  const result = analyzeExport(chat(rows), { anonymize: false, startDate: '2026-01-02', endDate:'2026-01-02', participantNames:{p3:'<img src=x onerror=alert(1)>'} }, values=>profiles=values);
  assert.deepEqual(result.participants.map(p=>p.messages), [0,0,1]);
  assert.equal(result.participants[2].key, 'p3');
  assert.equal(result.participants[2].name, '<img src=x onerror=alert(1)>', 'engine preserves literal labels for HTML renderer to escape');
  assert.equal(profiles[2].sourceName, 'Updated name');
  assert.equal(profiles[2].sourceId, 'user3');
  assert.equal(profiles[2].lastInExport, true);
  assert.ok(!JSON.stringify(result).includes('user3'));
  assert.equal(result.summary.activeParticipants,1);
  assert.deepEqual(result.participants.map(p=>p.turns), [0,0,1]);
  assert.equal(result.participants[2].starts,0, 'first visible session excluded');
  assert.equal(analyze(rows,{anonymize:false}).participants[2].name,'Updated name');
  const anon = analyze(rows,{ participantNames:{p3:'SECRET_ALIAS'} });
  assert.ok(!JSON.stringify(anon).includes('SECRET'));
  for (const participantNames of [{p2:'bad'},{p03:'bad'},{__bad:'bad'},{p3:1},{p3:'x'.repeat(81)}, JSON.parse('{"__proto__":"bad"}')]) assert.throws(()=>analyze(rows,{participantNames}), /Подписи/);
});

test('explicit group replies distinguish cross-author, self, unavailable, external and future targets', () => {
  const result = analyze([
    row(1,1,0),
    row(2,2,1,{reply_to_message_id:1}),
    row(3,2,2,{reply_to_message_id:2}),
    row(4,3,3,{reply_to_message_id:999}),
    row(5,3,4,{reply_to_message_id:1,reply_to_peer_id:'channel999'}),
    row(6,3,5,{reply_to_message_id:1,reply_to_peer_id:'channel123'}),
    row(7,1,6,{reply_to_message_id:8}),
    row(8,3,7),
    row(9,3,8,{reply_to_message_id:9}),
    row(10,1,9,{reply_to_message_id:1,reply_to_peer_id:{channel_id:123}}),
  ]);
  assert.deepEqual(result.group.replyCoverage,{total:8,resolved:2,unresolved:5,self:1});
  assert.deepEqual(result.group.replyEdges,[{from:'b',to:'a',count:1},{from:'p3',to:'a',count:1}]);
  assert.equal(result.summary.explicitReplies,8);
  assert.equal(result.summary.resolvedReplies,2);
  assert.equal(result.summary.unresolvedReplies,5);
  assert.equal(result.participants[0].repliesReceived,2);
  assert.equal(result.participants[0].distinctReplyPartners,2);
  assert.equal(result.participants[0].response.count,0);
  assert.equal(result.participants[1].response.medianSeconds,3600);
  assert.equal(result.participants[2].response.medianSeconds,18000);
  assert.equal(result.participants[2].response.count,1);
  assert.match(result.quality.warnings.join(' '),/Не удалось связать явные ответы: 5/);
  assert.ok(!JSON.stringify(result).includes('channel123'));
  finite(result);
});

test('reply timing permits zero and spans sessions, but excludes out-of-range targets', () => {
  const rows = [row(1,1,0),row(2,2,0,{reply_to_message_id:1}),row(3,3,25,{reply_to_message_id:1})];
  const full=analyze(rows);
  assert.equal(full.participants[1].response.medianSeconds,0);
  assert.equal(full.participants[2].response.medianSeconds,25*3600);
  assert.equal(full.group.replyCoverage.resolved,2);
  const filtered=analyze(rows,{startDate:'2026-01-02'});
  assert.deepEqual(filtered.group.replyCoverage,{total:1,resolved:0,unresolved:1,self:0});
  assert.equal(filtered.participants[2].response.count,0);
  assert.equal(filtered.participants[2].starts,0);
  assert.equal(filtered.group.replyEdges.length,0);
});

test('group sessions and initiation sensitivity cover all authors and never label unanswered turns',()=>{
  const result=analyze([row(1,1,0),row(2,2,0.2),row(3,3,6.2),row(4,1,6.3),row(5,3,20)]);
  assert.equal(result.summary.sessions,3);
  assert.equal(result.summary.eligibleStarts,2);
  assert.deepEqual(result.participants.map(p=>p.starts),[0,0,2]);
  assert.equal(result.daily[0].byParticipant.p3.starts,2);
  assert.deepEqual(result.group.sessions,{multiAuthor:2,count:3,medianAuthors:2,maxAuthors:2});
  assert.equal(result.sensitivity.find(s=>s.hours===6).byParticipant.p3,2);
  assert.ok(result.participants.every(p=>p.unansweredSessions===0));
});

test('whole-token laughter works in personal and group chats, counting each text or emoji type once',()=>{
  const yes=['ахах','АХАХАХА!','хаха хаха','ХАХАХ','ХеХе','haha','AhAhA','hehe','ну, ахаха.','АХАХААА','хаххах','HAAAHAAA','heeeheee'];
  const no=['ха','хе','ах','he he','hahaton','Сахах','хахатон','123хаха','hahaha42','обычное сообщение','https://example.org/ahah','haha@example.org','https://ahah.org','аах',''];
  const messages=[...yes,...no].map((text,index)=>row(index+1,index%2?2:1,index/10,{text}));
  messages.push(row(100,1,5,{text:['😂😂',{type:'bold',text:'🤣 ахах'}],reactions:[{emoji:'😂',count:99}]}));
  messages.push(row(101,2,6,{text:'',sticker_emoji:'😂',reactions:[{emoji:'🤣',count:4}]}));
  for(const type of ['personal_chat','private_supergroup']) {
    const result=analyze(messages,{}, {type});
    assert.equal(result.summary.laughterMessages,yes.length+1);
    assert.equal(result.daily[0].totalLaughter,yes.length+1);
    assert.equal(result.participants.reduce((s,p)=>s+p.laughterMessages,0),yes.length+1);
    assert.equal(result.participants.reduce((s,p)=>s+p.laughterEmojiMessages,0),1);
    assert.equal(Object.values(result.daily[0].byParticipant).reduce((s,p)=>s+p.laughter,0),yes.length+1);
  }
});

test('group lexical occurrences retain all contributors with no phantom a/b totals',()=>{
  const result=analyze([row(1,1,0,{text:'Море 🌊'}),row(2,2,1,{text:'море'}),row(3,3,2,{text:'МОРЕ море 🌊 🌊'})],{includeLexicon:true});
  assert.deepEqual(result.lexicon.words,[{term:'море',a:1,b:1,total:4,byParticipant:{a:1,b:1,p3:2}}]);
  assert.deepEqual(result.lexicon.emojis,[{term:'🌊',a:1,b:0,total:3,byParticipant:{a:1,p3:2}}]);
  const filtered=analyze([row(1,1,0,{text:'hidden'}),row(2,2,24,{text:'visible'}),row(3,3,25,{text:'visible'})],{includeLexicon:true,startDate:'2026-01-02'});
  assert.deepEqual(filtered.lexicon.words,[{term:'visible',a:0,b:1,total:2,byParticipant:{b:1,p3:1}}]);
});

test('zero authors, one author and group-shaped two author exports retain group semantics',()=>{
  for(const rows of [[],[row(1,1,0)],[row(1,1,0),row(2,2,1)]]) {
    const result=analyze(rows);
    assert.equal(result.meta.chatType,'group');
    assert.deepEqual(result.group.replyCoverage,{total:0,resolved:0,unresolved:0,self:0});
    assert.equal(result.group.sessions.count,rows.length?1:0);
    assert.equal(result.group.sessions.medianAuthors,rows.length||null);
    assert.equal(result.summary.mutualityScore,null);
    finite(result);
  }
});
