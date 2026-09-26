/** All interactive views are derived from daily aggregates; no message text or IDs. */
const EX_COLORS={a:'#107f78',b:'#7262d8',ink:'#183940',grid:'#dce5e8',muted:'#637681'};
const exEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exNum=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
const exFmt=(v,n=1)=>Number.isFinite(v)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:n}).format(v):'—';
const exDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'—';
const EX_METRICS={messages:{label:'Сообщения',unit:'сообщений',a:'a',b:'b'},words:{label:'Слова',unit:'слов',a:'wordsA',b:'wordsB'},starts:{label:'Начала диалогов',unit:'начал',a:'startsA',b:'startsB'}};
export function explorerOptions(p={}){
 return {window:[1,7,14,28].includes(Number(p.window))?Number(p.window):7,metric:Object.hasOwn(EX_METRICS,p.metric)?p.metric:'messages',view:['stacked','lines','share'].includes(p.view)?p.view:'stacked',comparison:['7:28','14:28','28:28'].includes(p.comparison)?p.comparison:'7:28'};
}
export function buildExplorerSeries(daily,prefs={}){
 const p=explorerOptions(prefs),m=EX_METRICS[p.metric];let sumA=0,sumB=0;
 return daily.map((d,i)=>{const a=exNum(d[m.a]),b=exNum(d[m.b]);sumA+=a;sumB+=b;
  if(i>=p.window){sumA-=exNum(daily[i-p.window][m.a]);sumB-=exNum(daily[i-p.window][m.b]);}
  const complete=i>=p.window-1,total=sumA+sumB;
  return {date:d.date,a,b,total:a+b,avgA:complete?sumA/p.window:null,avgB:complete?sumB/p.window:null,average:complete?total/p.window:null,shareA:complete&&total>0?100*sumA/total:null,shareB:complete&&total>0?100*sumB/total:null};
 });
}
export function comparePeriods(daily,currentDays=7,baselineDays=28,key='total'){
 const complete=daily.slice(1,-1);
 if(complete.length<currentDays+baselineDays)return {available:false,currentDays,baselineDays};
 const current=complete.slice(-currentDays),previous=complete.slice(-currentDays-baselineDays,-currentDays);
 const mean=rows=>rows.reduce((s,d)=>s+exNum(d[key]),0)/rows.length;
 const now=mean(current),before=mean(previous);
 return {available:true,currentDays,baselineDays,currentMean:now,previousMean:before,delta:now-before,changePct:before?100*(now-before)/before:now?null:0,currentStart:current[0].date,currentEnd:current.at(-1).date,previousStart:previous[0].date,previousEnd:previous.at(-1).date};
}
export function historicalChanges(daily){
 const complete=daily.slice(1,-1),windows=[];
 for(let end=35;end<=complete.length;end+=7){
  // Add dummy boundary days because comparePeriods deliberately excludes both edges.
  const t=comparePeriods([{},...complete.slice(0,end),{}]);windows.push(t);
 }
 const rising=windows.filter(w=>w.delta>0).sort((a,b)=>b.delta-a.delta)[0]||null;
 const falling=windows.filter(w=>w.delta<0).sort((a,b)=>a.delta-b.delta)[0]||null;
 return {rising,falling,count:windows.length};
}
function exSelect(name,label,items,value){return `<label>${label}<select data-explore-option="${name}" aria-label="${label}">${items.map(([v,l])=>`<option value="${v}"${String(v)===String(value)?' selected':''}>${l}</option>`).join('')}</select></label>`;}
function exChart(data,p){
 const rows=buildExplorerSeries(data.daily||[],p),metric=EX_METRICS[p.metric];
 if(!rows.length)return '<p class="empty-state">В выбранном периоде нет данных для графика.</p>';
 const W=1060,H=340,L=60,R=20,T=24,B=48,pw=W-L-R,ph=H-T-B;
 const vals=rows.flatMap(d=>p.view==='share'?[100]:p.view==='lines'?[d.avgA||0,d.avgB||0]:[d.total,d.average||0]);
 const peak=Math.max(1,...vals),rough=peak/4,power=10**Math.floor(Math.log10(rough));
 const step=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=rough)||power*10;
 const max=p.view==='share'?100:Math.ceil(peak/step)*step,dx=pw/rows.length;
 const x=i=>L+(i+.5)*dx,y=v=>T+ph-(v/max)*ph;
 const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="${EX_COLORS.grid}"/><text x="${L-12}" y="${y(v)+4}" text-anchor="end" fill="${EX_COLORS.muted}" font-size="13">${exFmt(v,max<8?1:0)}${p.view==='share'?'%':''}</text>`;}).join('');
 const line=(field,color)=>{let path='',started=false;rows.forEach((d,i)=>{if(d[field]===null){started=false;return;}path+=`${started?'L':'M'}${x(i).toFixed(2)},${y(d[field]).toFixed(2)}`;started=true;});return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`;};
 let marks='';
 if(p.view==='stacked'){
  let a='',b='';const bw=Math.max(.1,dx*.8);
  rows.forEach((d,i)=>{const xx=x(i)-bw/2; if(d.a)a+=`M${xx},${y(d.a)}h${bw}V${y(0)}h-${bw}Z`;if(d.b)b+=`M${xx},${y(d.a+d.b)}h${bw}V${y(d.a)}h-${bw}Z`;});
  marks=`<path d="${a}" fill="${EX_COLORS.a}" opacity=".82"/><path d="${b}" fill="${EX_COLORS.b}" opacity=".8"/>${line('average',EX_COLORS.ink)}`;
 }else marks=p.view==='lines'?line('avgA',EX_COLORS.a)+line('avgB',EX_COLORS.b):`<line x1="${L}" x2="${W-R}" y1="${y(50)}" y2="${y(50)}" stroke="#91a3a8" stroke-dasharray="5 5"/>${line('shareA',EX_COLORS.a)}${line('shareB',EX_COLORS.b)}`;
 const tickIndexes=[...new Set(Array.from({length:Math.min(6,rows.length)},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,Math.min(6,rows.length)-1))))];
 const labels=tickIndexes.map((i,k)=>`<text x="${x(i)}" y="${H-16}" text-anchor="${k===0?'start':k===tickIndexes.length-1?'end':'middle'}" fill="${EX_COLORS.muted}" font-size="13">${exDate(rows[i].date)}</text>`).join('');
 const people=data.participants||[],names=Object.fromEntries(people.map(q=>[q.key,q.name]));
 const hits=rows.map((d,i)=>`<rect x="${L+i*dx}" y="${T}" width="${dx}" height="${ph}" fill="transparent"><title>${exEsc(`${d.date}: ${names.a||'Первый участник'} — ${exFmt(d.a,0)}; ${names.b||'Второй участник'} — ${exFmt(d.b,0)}. Среднее: ${exFmt(d.average)}. ${p.view==='share'?`Доли: ${exFmt(d.shareA)}% / ${exFmt(d.shareB)}%`:''}`)}</title></rect>`).join('');
 const caption=p.view==='share'?`Доли в сумме за ${p.window} ${p.window===1?'день':'дней'}. Пустое окно не превращается в 50/50.`:p.view==='lines'?`Средний объём каждого участника за ${p.window} ${p.window===1?'день':'дней'}.`:`Столбец — календарный день. Тёмная линия — ${p.window===1?'дневной итог':`среднее за ${p.window} дней`}.`;
 return `<div class="chart-legend">${people.map(q=>`<span class="legend-item"><span class="legend-dot person-${q.key}"></span>${exEsc(q.name)}</span>`).join('')}${p.view==='stacked'?`<span class="legend-item"><span class="legend-dot legend-average"></span>${p.window===1?'Итого за день':`Среднее за ${p.window} дней`}</span>`:''}</div><p class="chart-scroll-hint">График шире экрана · прокрутите вправо →</p><div class="chart-wrap"><svg class="chart wide-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="daily-title daily-desc"><title id="daily-title">${metric.label} по дням</title><desc id="daily-desc">${exEsc(caption)} Все значения доступны в таблице ниже.</desc>${grid}${marks}${labels}${hits}</svg></div><p class="panel-note">${caption} ${p.window>1?`Первые ${p.window-1} дней не имеют полного окна сглаживания.`:''}${p.metric==='starts'?' Первое видимое начало сессии исключено.':''}</p>
 <details class="data-details"><summary>Данные графика · ${rows.length} дней</summary><div class="table-scroll"><table class="metric-table"><caption class="sr-only">Количество ${metric.unit} за каждый день</caption><thead><tr><th>Дата</th><th>Всего ${metric.unit}</th>${people.map(q=>`<th>${exEsc(q.name)}</th>`).join('')}<th>Среднее за ${p.window} дней</th></tr></thead><tbody>${rows.map(d=>`<tr><th>${exDate(d.date)}</th><td>${exFmt(d.total,0)}</td>${people.map(q=>`<td>${exFmt(d[q.key],0)}</td>`).join('')}<td>${exFmt(d.average)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function exDelta(t){return !t.available?'—':t.changePct===null?'С нулевой базы':`${t.changePct>0?'+':''}${exFmt(t.changePct)}%`;}
function exCompareCard(title,key,t){
 return `<article class="tempo-card tempo-${key}"><p class="tempo-name">${exEsc(title)}</p><strong class="tempo-value">${exDelta(t)}</strong>${t.available?`<p class="tempo-absolute">${t.delta>0?'+':''}${exFmt(t.delta)} сообщений в день</p><div class="tempo-pair"><div><b>${exFmt(t.currentMean)}</b><span>сейчас</span></div><span aria-hidden="true">←</span><div><b>${exFmt(t.previousMean)}</b><span>было</span></div></div>`:'<p class="tempo-absolute">Недостаточно полных дней для этих двух окон.</p>'}</article>`;
}
function exHistory(data){
 const h=historicalChanges(data.daily||[]);
 if(!h.count)return '';
 const card=(t,label)=>`<article class="history-card"><p class="eyebrow">${label}</p>${t?`<h3>${exDate(t.currentStart)} — ${exDate(t.currentEnd)}</h3><strong>${t.delta>0?'+':''}${exFmt(t.delta)} <small>сообщ./день</small></strong><p>${exFmt(t.previousMean)} → ${exFmt(t.currentMean)} сообщений/день · ${exDelta(t)}</p><p class="panel-note">База: ${exDate(t.previousStart)} — ${exDate(t.previousEnd)}</p>`:'<p>В рассмотренных окнах такого изменения нет.</p>'}</article>`;
 return `<div class="history-heading"><h3>Где менялся темп за всю историю</h3><p>Выбираем рост и спад по абсолютной разнице сообщений в день.</p></div><div class="history-grid">${card(h.rising,'Самый заметный рост')}${card(h.falling,'Самый заметный спад')}</div><p class="panel-note">${h.count} сравнений: каждые 7 дней сопоставляем неделю с предыдущими 28 днями. Крайние дни исключены. Это описание колебаний, не проверка статистической значимости.</p>`;
}
export function renderExplorer(data,prefs={}){
 const p=explorerOptions(prefs),[current,baseline]=p.comparison.split(':').map(Number),t=comparePeriods(data.daily||[],current,baseline);
 return `<div data-explorer data-window="${p.window}" data-metric="${p.metric}" data-view="${p.view}" data-comparison="${p.comparison}"><div class="panel explore-panel"><div class="panel-head"><div><p class="eyebrow">ИССЛЕДУЙТЕ ДИНАМИКУ</p><h3>Как менялся ваш разговор</h3></div><span class="badge">${(data.daily||[]).length} дней</span></div><div class="explorer-controls">${exSelect('metric','Что считаем',[['messages','Сообщения'],['words','Слова'],['starts','Начала диалогов']],p.metric)}<div class="view-switch" role="group" aria-label="Вид графика">${[['stacked','Объём'],['lines','По людям'],['share','Доли']].map(([v,l])=>`<button type="button" data-explore-view="${v}" aria-pressed="${v===p.view}">${l}</button>`).join('')}</div>${exSelect('window','Сглаживание',[[1,'Без сглаживания'],[7,'7 дней'],[14,'14 дней'],[28,'28 дней']],p.window)}</div>${exChart(data,p)}</div>
 <div class="tempo-section"><div class="tempo-heading"><div><p class="eyebrow">ИЗМЕНЕНИЕ ТЕМПА</p><h3>Что происходит сейчас</h3><p>Сравниваем сообщения в день, включая дни тишины.</p></div>${exSelect('comparison','Периоды сравнения',[['7:28','7 дней к предыдущим 28'],['14:28','14 дней к предыдущим 28'],['28:28','28 дней к предыдущим 28']],p.comparison)}</div>${t.available?`<p class="comparison-dates"><b>${exDate(t.currentStart)} — ${exDate(t.currentEnd)}</b><span>по сравнению с</span><b>${exDate(t.previousStart)} — ${exDate(t.previousEnd)}</b></p>`:`<p class="panel-note">Нужно ${current+baseline} полных дней; первый и последний день выбранного периода исключены.</p>`}<div class="tempo-grid">${exCompareCard('Весь диалог','total',t)}${(data.participants||[]).map(q=>exCompareCard(q.name,q.key,comparePeriods(data.daily||[],current,baseline,q.key))).join('')}</div>${exHistory(data)}</div></div>`;
}
export function bindExplorer(root,data){
 if(!root)return;
 const update=(target,view)=>{
  const el=target.closest('[data-explorer]');if(!el)return;
  const p=explorerOptions(el.dataset);
  if(view)p.view=view;else p[target.dataset.exploreOption]=target.value;
  const focusSelector=view?`[data-explore-view="${view}"]`:`[data-explore-option="${target.dataset.exploreOption}"]`;
  const placeholder=document.createElement('div');placeholder.innerHTML=renderExplorer(data,p);const replacement=placeholder.firstElementChild;el.replaceWith(replacement);replacement.querySelector(focusSelector)?.focus({preventScroll:true});
 };
 root.onchange=e=>{if(e.target.matches('[data-explore-option]'))update(e.target);};
 root.onclick=e=>{const b=e.target.closest('[data-explore-view]');if(b&&root.contains(b))update(b,b.dataset.exploreView);};
}
