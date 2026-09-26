const docEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderNavigation(mode, hasLexicon = false, isGroup = false) {
  const items = [['overview','Обзор'],...(mode==='full'||mode==='rhythm'?[['rhythm','Ритм']]:[]),...(mode==='full'||mode==='dialogue'?[['dialogue',isGroup?'Обсуждения':'Диалог']]:[]),...(mode==='full'?[['habits','Привычки']]:[]),...(hasLexicon?[['words','Слова']]:[]),['method','Методика']];
  return items.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('');
}

/** Package an escaped report fragment into an offline, self-contained HTML document. */
export function renderDocument(data, body, styles, {mode='full',isDemo=false,runtime=''} = {}) {
  const meta=data.meta||{};
  const isGroup=meta.chatType==='group';
  const hasLexicon=Boolean(meta.includeLexicon&&data.lexicon);
  const heading=`${isDemo?'Демо · синтетические данные · ':''}${meta.startDate||'Нет дат'} — ${meta.endDate||'Нет дат'} · ${isGroup?'Группа · авторов в экспорте: '+(data.participants||[]).length:(data.participants||[]).map(p=>p.name).join(' и ')}`;
  const timezone=meta.timezone==='export'?'как в экспорте Telegram':meta.timezone;
  const date=new Date(meta.generatedAt);
  const created=Number.isFinite(date.getTime())?date.toLocaleDateString('ru-RU'):'';
  const interactive=Boolean(runtime && (isGroup||mode==='full'||mode==='rhythm'));
  const safeCount=value=>typeof value==='number'&&Number.isFinite(value)?value:0;
  const keys=new Set((data.participants||[]).map(p=>p.key));
  const chartData={meta:{chatType:meta.chatType},participants:(data.participants||[]).map(p=>({key:p.key,name:p.name,messages:safeCount(p.messages),words:safeCount(p.words),starts:safeCount(p.starts),activeDays:safeCount(p.activeDays),laughterMessages:safeCount(p.laughterMessages)})),daily:(data.daily||[]).map(d=>({date:d.date,total:d.total,a:d.a,b:d.b,wordsA:d.wordsA,wordsB:d.wordsB,startsA:d.startsA,startsB:d.startsB,...(isGroup?{uniqueAuthors:safeCount(d.uniqueAuthors),totalLaughter:safeCount(d.totalLaughter),byParticipant:Object.fromEntries(Object.entries(d.byParticipant||{}).filter(([key])=>keys.has(key)).map(([key,v])=>[key,{messages:safeCount(v.messages),words:safeCount(v.words),starts:safeCount(v.starts),laughter:safeCount(v.laughter)}]))}:{})}))};
  const payload=JSON.stringify(chartData).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));

  const scripts=interactive?`<script type="application/json" id="report-data">${payload}</script><script>${runtime.replace(/<\/script/gi,'<\\/script')}</script>`:'';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; ${interactive?"script-src 'unsafe-inline'; connect-src 'none'; ":''}img-src data:; base-uri 'none'; form-action 'none'"><title>Chat Atlas — отчёт о переписке</title><style>${styles}</style></head><body class="exported"><header class="app-header"><a class="brand" href="#">↔ chat atlas</a><span class="local-label">Автономный отчёт · ${isDemo?'Синтетические данные':meta.anonymize?'Анонимные подписи':'С именами участников'}</span></header><main><div class="report-heading"><div><p class="eyebrow">АТЛАС ВАШЕГО ОБЩЕНИЯ</p><h1>${isGroup?'Ритм группы':'Ритм диалога'}<span class="title-dot">.</span></h1><p class="dataset-label">${docEscape(heading)}</p></div></div><p class="export-note">Сформировано ${docEscape(created)}. Пауза: ${docEscape(meta.sessionGapHours)} ч · Время: ${docEscape(timezone)}. ${hasLexicon?'Включены частые слова и эмодзи. Полные тексты сообщений отсутствуют.':'Этот файл содержит агрегаты, без текста сообщений.'} Даже агрегаты могут быть личными данными.</p><nav class="report-nav" aria-label="Разделы">${renderNavigation(mode,hasLexicon,isGroup)}</nav><div id="portable-report">${body}</div></main><footer class="app-footer"><span class="brand">chat atlas</span><p>Числа описывают общение. Значение ему придаёте вы.</p><span>Открытая методика · Без AI</span></footer>${scripts}</body></html>`;
}
