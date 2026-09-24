import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDocument,renderNavigation} from '../src/document.js';
const data=()=>({meta:{startDate:'2026-01-01',endDate:'2026-01-02',generatedAt:'2026-01-03T12:00:00Z',sessionGapHours:6,timezone:'export',anonymize:true,includeLexicon:false},participants:[{name:'Участник A'},{name:'Участник B'}]});
test('portable document escapes metadata and carries no scripts or network dependencies',()=>{
 const d=data();d.participants[0].name='<img src=x onerror=alert(1)>';
 const html=renderDocument(d,'<section id="overview">Report</section>','body{color:#123}');
 assert(html.startsWith('<!doctype html>'));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert(!html.includes('<img'));assert(!html.includes('<script'));assert(!html.includes('src="http'));assert(html.includes("default-src 'none'"));assert(html.includes('как в экспорте Telegram'));
});
test('portable navigation and privacy note accurately reflect optional lexical content',()=>{
 const d=data();d.meta.includeLexicon=true;d.lexicon={words:[],emojis:[]};
 const html=renderDocument(d,'','',{mode:'overview'});
 assert(html.includes('href="#words"'));assert(html.includes('Включены частые слова и эмодзи'));assert(!html.includes('href="#rhythm"'));
 d.meta.includeLexicon=false;const hidden=renderDocument(d,'','',{mode:'overview'});
 assert(!hidden.includes('href="#words"'));assert(hidden.includes('без текста сообщений'));
});
test('mode navigation only points to sections present in the report',()=>{
 assert.deepEqual([...renderNavigation('overview').matchAll(/href="#([^"]+)"/g)].map(x=>x[1]),['overview','method']);
 assert.deepEqual([...renderNavigation('dialogue',true).matchAll(/href="#([^"]+)"/g)].map(x=>x[1]),['overview','dialogue','words','method']);
});
