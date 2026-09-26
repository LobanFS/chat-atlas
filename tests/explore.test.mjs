import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExplorerSeries,comparePeriods,historicalChanges,renderExplorer} from '../src/explore.js';
import {analyzeExport} from '../src/engine.js';
import {renderDocument} from '../src/document.js';
const days=counts=>counts.map((total,i)=>({date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),total,a:total*.75,b:total*.25,wordsA:total*3,wordsB:total,startsA:0,startsB:0}));
test('rolling windows include zero days, do not mutate data, and never invent early averages',()=>{
 const input=days([7,0,0,0,0,0,7,0]);const before=structuredClone(input);const series=buildExplorerSeries(input);
 assert.equal(series[5].average,null);assert.equal(series[6].average,2);assert.equal(series[7].average,1);assert.deepEqual(input,before);
 assert.equal(buildExplorerSeries(input,{window:1})[0].average,7);
 assert.equal(buildExplorerSeries(input,{metric:'words'})[6].average,8);
});
test('share is the ratio of rolling sums, not the average of daily shares; silence remains missing',()=>{
 const input=[{date:'2026-01-01',a:100,b:0},{date:'2026-01-02',a:0,b:1},...Array.from({length:5},(_,i)=>({date:`2026-01-0${i+3}`,a:0,b:0}))];
 const row=buildExplorerSeries(input,{view:'share'})[6];assert.equal(row.shareA,10000/101);assert.equal(row.shareA+row.shareB,100);
 assert.equal(buildExplorerSeries(days([0]),{window:1,view:'share'})[0].shareA,null);
});
test('comparison excludes partial boundaries, separates people and honors chosen windows',()=>{
 const input=days([999,...Array(28).fill(2),...Array(7).fill(10),999]);const t=comparePeriods(input);
 assert.equal(t.currentMean,10);assert.equal(t.previousMean,2);assert.equal(t.changePct,400);assert.equal(t.delta,8);
 assert.equal(comparePeriods(input,7,28,'a').currentMean,7.5);
 assert.equal(comparePeriods(input,14,28).available,false);
 const zero=comparePeriods(days([1,...Array(28).fill(0),...Array(7).fill(4),1]));assert.equal(zero.changePct,null);
 assert.equal(comparePeriods(days(Array(37).fill(0))).changePct,0);
});
test('historical changes rank absolute differences and keep zero baselines finite',()=>{
 const h=historicalChanges(days([1,...Array(28).fill(0),...Array(7).fill(1),...Array(7).fill(40),...Array(28).fill(0),1]));
 assert(h.count>1);assert(h.rising.delta>20);assert(h.falling.delta<0);assert.equal(h.rising.currentStart,'2026-02-06');
 assert(!JSON.stringify(h).includes('Infinity'));
});
test('ID mapping survives changed names, filters and custom labels; IDs stay out of aggregates',()=>{
 const input={type:'personal_chat',messages:[
 {id:1,type:'message',from_id:'private-id-1',from:'Old',date:'2026-01-01T00:00:00',date_unixtime:'1767225600',text:'hello there'},
 {id:2,type:'message',from_id:'private-id-2',from:'Other',date:'2026-01-02T00:00:00',date_unixtime:'1767312000',text:'hello'},
 {id:3,type:'message',from_id:'private-id-1',from:'Latest',date:'2026-01-03T00:00:00',date_unixtime:'1767398400',text:'hello'}]};
 let profiles;const data=analyzeExport(input,{anonymize:false,participantNames:{a:'Я'},startDate:'2026-01-02'},p=>profiles=p);
 assert.equal(data.participants[0].name,'Я');assert.equal(data.participants[0].messages,1);assert.equal(profiles[0].sourceId,'private-id-1');assert.equal(profiles[0].sourceName,'Latest');assert.equal(profiles[0].lastInExport,true);
 assert.equal(data.daily[0].wordsB,1);assert(!JSON.stringify(data).includes('private-id'));assert(!JSON.stringify(data).includes('Latest'));
 assert.equal(analyzeExport(input,{participantNames:{a:'PRIVATE_ALIAS'}}).participants[0].name,'Участник A');
 assert.throws(()=>analyzeExport(input,{participantNames:{a:1}}),/Подписи/);
});
test('portable interaction payload escapes closing script tags and serializes only chart aggregates',()=>{
 const data={meta:{generatedAt:'2026-01-01',anonymize:false},participants:[{key:'a',name:'</script><img src=x>',sourceId:'PRIVATE_ID'}],daily:days([4]),secret:'PRIVATE_RAW'};
 const doc=renderDocument(data,renderExplorer(data),'',{runtime:'/* trusted local runtime */'});
 assert(!doc.includes('PRIVATE_RAW'));assert(!doc.includes('PRIVATE_ID'));assert(!doc.includes('<img'));
 const payload=doc.match(/id="report-data">([\s\S]*?)<\/script>/)[1];assert(payload.includes('\\u003c'));assert.equal(JSON.parse(payload).participants[0].name,'</script><img src=x>');
});
