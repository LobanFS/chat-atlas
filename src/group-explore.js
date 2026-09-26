/** Interactive group views depend only on daily aggregates and display names. */
const GX_PALETTE=['#147d78','#7262d8','#b2692b','#327cac','#a6537d'];
const gxEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gxNum=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
const gxFmt=(v,n=1)=>Number.isFinite(v)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:n}).format(v):'—';
const gxDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')):'—';
const GX_METRICS={messages:'Сообщения',words:'Слова',starts:'Начала сессий',laughter:'Сообщения со смехом',authors:'Пишущие участники'};
export function groupExplorerOptions(p={},participants=[]){
 let selected=p.selected;
 if(typeof selected==='string'){try{selected=JSON.parse(selected);}catch{selected=null;}}
 const allowed=new Set(participants.map(q=>q.key));
 if(!Array.isArray(selected))selected=[...participants].sort((a,b)=>gxNum(b.messages)-gxNum(a.messages)).slice(0,5).map(q=>q.key);
 selected=[...new Set(selected)].filter(k=>typeof k==='string'&&allowed.has(k)).slice(0,5);
 const metric=Object.hasOwn(GX_METRICS,p.metric)?p.metric:'messages';
 return {window:[1,7,14,28].includes(Number(p.window))?Number(p.window):7,metric,view:metric==='authors'?'stacked':['stacked','lines','share'].includes(p.view)?p.view:'stacked',comparison:['7:28','14:28','28:28'].includes(p.comparison)?p.comparison:'7:28',selected};
}
export function buildGroupExplorerSeries(daily,participants,prefs={}){
 const p=groupExplorerOptions(prefs,participants),people=p.selected.map((key,i)=>({key,name:participants.find(q=>q.key===key)?.name||key,color:GX_PALETTE[i]}));
 if(p.metric==='authors')people.splice(0,people.length,{key:'total',name:'Пишущие участники',color:'#147d78'});
 else if(participants.some(q=>!p.selected.includes(q.key)))people.push({key:'other',name:`Остальные · ${participants.length-p.selected.length}`,color:'#95a7b1'});
 const sums=Object.fromEntries(people.map(q=>[q.key,0]));
 const raw=daily.map(d=>{
  const counts=Object.fromEntries(people.map(q=>[q.key,0]));
  if(p.metric==='authors')counts.total=gxNum(d.uniqueAuthors);
  else for(const q of participants){const bucket=p.selected.includes(q.key)?q.key:'other';if(Object.hasOwn(counts,bucket))counts[bucket]+=gxNum(d.byParticipant?.[q.key]?.[p.metric]);}
  return {date:d.date,counts,total:Object.values(counts).reduce((s,n)=>s+n,0)};
 });
 const rows=raw.map((d,i)=>{
  for(const q of people){sums[q.key]+=d.counts[q.key];if(i>=p.window)sums[q.key]-=raw[i-p.window].counts[q.key];}
  const complete=i>=p.window-1,totalSum=Object.values(sums).reduce((s,n)=>s+n,0);
  return {...d,average:complete?totalSum/p.window:null,means:Object.fromEntries(people.map(q=>[q.key,complete?sums[q.key]/p.window:null])),shares:Object.fromEntries(people.map(q=>[q.key,complete&&totalSum>0?100*sums[q.key]/totalSum:null]))};
 });
 return {rows,people,options:p};
}
export function compareGroupPeriods(daily,currentDays=7,baselineDays=28,key=null){
 const complete=daily.slice(1,-1);if(complete.length<currentDays+baselineDays)return {available:false,currentDays,baselineDays};
 const current=complete.slice(-currentDays),previous=complete.slice(-currentDays-baselineDays,-currentDays);
 const mean=rows=>rows.reduce((s,d)=>s+(key?gxNum(d.byParticipant?.[key]?.messages):gxNum(d.total)),0)/rows.length;
 const now=mean(current),before=mean(previous);
 return {available:true,currentDays,baselineDays,currentMean:now,previousMean:before,delta:now-before,changePct:before?100*(now-before)/before:now?null:0,currentStart:current[0].date,currentEnd:current.at(-1).date,previousStart:previous[0].date,previousEnd:previous.at(-1).date};
}
const gxDelta=t=>!t.available?'—':t.changePct===null?'С нулевой базы':`${t.changePct>0?'+':''}${gxFmt(t.changePct)}%`;
function gxSelect(name,label,items,value){return `<label>${gxEsc(label)}<select data-group-option="${name}" aria-label="${gxEsc(label)}">${items.map(([v,l])=>`<option value="${v}"${String(v)===String(value)?' selected':''}>${gxEsc(l)}</option>`).join('')}</select></label>`;}
function gxChart(data,p){
 const {rows,people}=buildGroupExplorerSeries(data.daily||[],data.participants||[],p);
 if(!rows.length)return '<p class="empty-state">В выбранном периоде нет данных для графика.</p>';
 const W=1060,H=350,L=66,R=20,T=24,B=48,pw=W-L-R,ph=H-T-B,dx=pw/rows.length;
 let peak=1;for(const d of rows){if(p.view==='stacked')peak=Math.max(peak,d.total,d.average||0);else if(p.view==='lines')for(const v of Object.values(d.means))peak=Math.max(peak,v||0);}
 const rough=peak/4,power=10**Math.floor(Math.log10(rough)),step=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=rough)||10*power;
 const max=p.view==='share'?100:Math.ceil(peak/step)*step,x=i=>L+(i+.5)*dx,y=v=>T+ph-v/max*ph;
 const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e0e8eb"/><text x="${L-12}" y="${y(v)+4}" text-anchor="end" fill="#637681" font-size="13">${gxFmt(v,max<8?1:0)}${p.view==='share'?'%':''}</text>`;}).join('');
 const pathLine=(get,color,width=2.6)=>{let path='',started=false;rows.forEach((d,i)=>{const value=get(d);if(value===null){started=false;return;}path+=`${started?'L':'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`;started=true;});return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;};
 let marks='';
 if(p.view==='stacked'){
  const paths=Object.fromEntries(people.map(q=>[q.key,''])),bw=Math.max(.1,dx*.8);
  rows.forEach((d,i)=>{let base=0;for(const q of people){const value=d.counts[q.key];if(value)paths[q.key]+=`M${x(i)-bw/2},${y(base+value)}h${bw}V${y(base)}h-${bw}Z`;base+=value;}});
  marks=people.map(q=>`<path d="${paths[q.key]}" fill="${q.color}" opacity=".84"/>`).join('')+pathLine(d=>d.average,'#193d44',3);
 }else marks=people.map(q=>pathLine(d=>(p.view==='share'?d.shares:d.means)[q.key],q.color)).join('');
 const tickIndexes=[...new Set(Array.from({length:Math.min(6,rows.length)},(_,i)=>Math.round(i*(rows.length-1)/Math.max(1,Math.min(6,rows.length)-1))))];
 const labels=tickIndexes.map((i,k)=>`<text x="${x(i)}" y="${H-16}" text-anchor="${k===0?'start':k===tickIndexes.length-1?'end':'middle'}" fill="#637681" font-size="13">${gxDate(rows[i].date)}</text>`).join('');
 const hits=rows.map((d,i)=>`<rect x="${L+i*dx}" y="${T}" width="${dx}" height="${ph}" fill="transparent"><title>${gxEsc(`${d.date}: ${GX_METRICS[p.metric]} — ${gxFmt(d.total,0)}. ${people.map(q=>`${q.name}: ${gxFmt(d.counts[q.key],0)}${p.view==='share'?` (${gxFmt(d.shares[q.key])}%)`:''}`).join('; ')}. Среднее: ${gxFmt(d.average)}.`)}</title></rect>`).join('');
 const caption=p.view==='share'?`Доля в сумме за ${p.window} ${p.window===1?'день':'дней'}. В окне без событий доли не определены.`:p.view==='lines'?`Среднее каждого ряда за ${p.window} ${p.window===1?'день':'дней'}. Все невыбранные участники объединены в «Остальные».`:`Столбец — один день. Тёмная линия — ${p.window===1?'дневной итог':`среднее за ${p.window} дней`}.`;
 return `<div class="chart-legend">${people.map(q=>`<span class="legend-item"><span class="legend-dot" style="background:${q.color}"></span>${gxEsc(q.name)}</span>`).join('')}${p.view==='stacked'?`<span class="legend-item"><span class="legend-dot legend-average"></span>Среднее · ${p.window} дн.</span>`:''}</div><p class="chart-scroll-hint">График шире экрана · прокрутите вправо →</p><div class="chart-wrap"><svg class="chart wide-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="group-daily-title group-daily-desc"><title id="group-daily-title">${GX_METRICS[p.metric]} по дням</title><desc id="group-daily-desc">${gxEsc(caption)} Точные значения — в таблице ниже.</desc>${grid}${marks}${labels}${hits}</svg></div><p class="panel-note">${caption} ${p.window>1?`Первые ${p.window-1} дней без полного окна не сглаживаются.`:''}${p.metric==='authors'?' Считаем разных авторов за каждый день, затем усредняем дневные значения. Это не число уникальных авторов за всё окно.':''}${p.metric==='starts'?' Инициатор — первый автор после паузы во всём чате; первая видимая сессия исключена.':''}${p.metric==='laughter'?' Только текстовые маркеры смеха; эмодзи показаны отдельно в разделе привычек.':''}</p><details class="data-details"><summary>Данные графика · ${rows.length} дней</summary><div class="table-scroll"><table class="metric-table"><caption class="sr-only">${GX_METRICS[p.metric]} по дням</caption><thead><tr><th scope="col">Дата</th><th scope="col">Всего</th>${people.map(q=>`<th scope="col">${gxEsc(q.name)}</th>`).join('')}<th scope="col">Среднее</th></tr></thead><tbody>${rows.map(d=>`<tr><th scope="row">${gxDate(d.date)}</th><td>${gxFmt(d.total,0)}</td>${people.map(q=>`<td>${gxFmt(d.counts[q.key],0)}</td>`).join('')}<td>${gxFmt(d.average)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function gxHistory(daily){
 const complete=daily.slice(1,-1),windows=[];
 for(let end=35;end<=complete.length;end+=7)windows.push(compareGroupPeriods([{},...complete.slice(0,end),{}]));
 if(!windows.length)return '';
 const rising=windows.filter(t=>t.delta>0).sort((a,b)=>b.delta-a.delta)[0],falling=windows.filter(t=>t.delta<0).sort((a,b)=>a.delta-b.delta)[0];
 return `<div class="history-heading"><h3>Повороты в истории чата</h3><p>Неделя к предыдущим 28 дням, шаг — 7 дней.</p></div><div class="history-grid">${[[rising,'Самый заметный рост'],[falling,'Самый заметный спад']].map(([t,title])=>`<article class="history-card"><p class="eyebrow">${title}</p>${t?`<h3>${gxDate(t.currentStart)} — ${gxDate(t.currentEnd)}</h3><strong>${t.delta>0?'+':''}${gxFmt(t.delta)} <small>сообщ./день</small></strong><p>${gxFmt(t.previousMean)} → ${gxFmt(t.currentMean)} · ${gxDelta(t)}</p><p class="panel-note">База: ${gxDate(t.previousStart)} — ${gxDate(t.previousEnd)}</p>`:'<p>В рассмотренных окнах такого изменения нет.</p>'}</article>`).join('')}</div><p class="panel-note">${windows.length} сравнений. Выбираем наибольшую абсолютную разницу, а не процент с маленькой базы.</p>`;
}
function gxTempo(data,p){
 const [current,baseline]=p.comparison.split(':').map(Number),t=compareGroupPeriods(data.daily||[],current,baseline),people=(data.participants||[]).map(q=>({...q,comparison:compareGroupPeriods(data.daily||[],current,baseline,q.key)})).sort((a,b)=>Math.abs(b.comparison.delta||0)-Math.abs(a.comparison.delta||0));
 return `<div class="tempo-section group-tempo"><div class="tempo-heading"><div><p class="eyebrow">ИЗМЕНЕНИЕ ТЕМПА</p><h3>Что изменилось в последнее время</h3><p>Сообщения в день, включая дни тишины.</p></div>${gxSelect('comparison','Периоды сравнения',[['7:28','7 дней к предыдущим 28'],['14:28','14 дней к предыдущим 28'],['28:28','28 дней к предыдущим 28']],p.comparison)}</div>${t.available?`<p class="comparison-dates"><b>${gxDate(t.currentStart)} — ${gxDate(t.currentEnd)}</b><span>по сравнению с</span><b>${gxDate(t.previousStart)} — ${gxDate(t.previousEnd)}</b></p><div class="group-tempo-grid"><article class="tempo-card tempo-total"><p class="tempo-name">Весь чат</p><strong class="tempo-value">${gxDelta(t)}</strong><p class="tempo-absolute">${t.delta>0?'+':''}${gxFmt(t.delta)} сообщений в день</p><div class="tempo-pair"><div><b>${gxFmt(t.currentMean)}</b><span>сейчас</span></div><span aria-hidden="true">←</span><div><b>${gxFmt(t.previousMean)}</b><span>было</span></div></div></article><div class="group-shifts"><h4>У кого изменился объём</h4><p>По абсолютному изменению сообщений в день.</p><div class="table-scroll"><table class="metric-table"><caption class="sr-only">Изменение объёма по участникам</caption><thead><tr><th scope="col">Участник</th><th scope="col">Было</th><th scope="col">Сейчас</th><th scope="col">Разница</th></tr></thead><tbody>${people.map(q=>`<tr><th scope="row">${gxEsc(q.name)}</th><td>${gxFmt(q.comparison.previousMean)}</td><td>${gxFmt(q.comparison.currentMean)}</td><td class="${q.comparison.delta>=0?'shift-up':'shift-down'}">${q.comparison.delta>0?'+':''}${gxFmt(q.comparison.delta)}<small>${gxDelta(q.comparison)}</small></td></tr>`).join('')}</tbody></table></div></div></div>`:`<p class="empty-state">Для сравнения нужно ${current+baseline} полных дней. Доступно ${Math.max(0,(data.daily||[]).length-2)}.</p>`}<p class="panel-note">Первый и последний день исключены: они могут быть неполными. Это описание объёма переписки, без вывода о причинах.</p>${gxHistory(data.daily||[])}</div>`;
}
export function renderGroupExplorer(data,prefs={}){
 const participants=data.participants||[],p=groupExplorerOptions(prefs,participants);
 return `<div data-group-explorer data-window="${p.window}" data-metric="${p.metric}" data-view="${p.view}" data-comparison="${p.comparison}" data-selected="${gxEsc(JSON.stringify(p.selected))}"><div class="panel explore-panel"><div class="panel-head"><div><p class="eyebrow">ИССЛЕДУЙТЕ ДИНАМИКУ</p><h3>Голос каждого в общей истории</h3></div><span class="badge">${gxFmt((data.daily||[]).length,0)} дней</span></div><div class="explorer-controls">${gxSelect('metric','Что считаем',Object.entries(GX_METRICS),p.metric)}<div class="view-switch" role="group" aria-label="Вид группового графика">${[['stacked','Объём'],['lines','По людям'],['share','Доли']].map(([v,l])=>`<button type="button" data-group-view="${v}" aria-pressed="${v===p.view}"${p.metric==='authors'&&v!=='stacked'?' disabled':''}>${l}</button>`).join('')}</div>${gxSelect('window','Сглаживание',[[1,'Без сглаживания'],[7,'7 дней'],[14,'14 дней'],[28,'28 дней']],p.window)}</div>${p.metric!=='authors'?`<details class="group-picker"><summary>Кого показать отдельно · ${p.selected.length} из ${participants.length}</summary><p>До 5 участников. Все остальные остаются в сером ряду, поэтому общий объём сохраняется.</p><div class="group-picker-options">${[...participants].sort((a,b)=>gxNum(b.messages)-gxNum(a.messages)).map(q=>`<label><input type="checkbox" data-group-person="${gxEsc(q.key)}"${p.selected.includes(q.key)?' checked':p.selected.length>=5?' disabled':''}><span>${gxEsc(q.name)}<small>${gxFmt(q.messages,0)} сообщений</small></span></label>`).join('')}</div></details>`:''}${gxChart(data,p)}</div>${gxTempo(data,p)}</div>`;
}
export function bindGroupExplorer(root,data){
 if(!root)return;
 if(root.__groupAtlasHandlers){root.removeEventListener('change',root.__groupAtlasHandlers.change);root.removeEventListener('click',root.__groupAtlasHandlers.click);root.removeEventListener('input',root.__groupAtlasHandlers.input);}
 const update=(target,view)=>{
  const el=target.closest('[data-group-explorer]');if(!el)return;
  const p=groupExplorerOptions(el.dataset,data.participants||[]),pickerOpen=el.querySelector('.group-picker')?.open;
  if(view)p.view=view;else if(target.hasAttribute('data-group-person')){const key=target.dataset.groupPerson;p.selected=target.checked?[...p.selected,key].slice(0,5):p.selected.filter(v=>v!==key);}else p[target.dataset.groupOption]=target.value;
  const focusSelector=view?`[data-group-view="${view}"]`:target.hasAttribute('data-group-person')?`[data-group-person="${target.dataset.groupPerson}"]`:`[data-group-option="${target.dataset.groupOption}"]`;
  const placeholder=document.createElement('div');placeholder.innerHTML=renderGroupExplorer(data,p);const replacement=placeholder.firstElementChild;el.replaceWith(replacement);if(pickerOpen&&replacement.querySelector('.group-picker'))replacement.querySelector('.group-picker').open=true;replacement.querySelector(focusSelector)?.focus({preventScroll:true});
 };
 const change=e=>{if(e.target.matches('[data-group-option],[data-group-person]'))update(e.target);if(e.target.matches('[data-group-sort]')){const table=root.querySelector('[data-group-contributions]'),rows=[...table.querySelectorAll('tbody tr')],key=e.target.value;rows.sort((a,b)=>Number(b.dataset[key])-Number(a.dataset[key]));rows.forEach(row=>table.tBodies[0].append(row));}};
 const click=e=>{const b=e.target.closest('[data-group-view]');if(b&&root.contains(b))update(b,b.dataset.groupView);};
 const input=e=>{if(!e.target.matches('[data-group-search]'))return;const query=e.target.value.trim().toLocaleLowerCase('ru'),rows=root.querySelectorAll('[data-group-contributions] tbody tr');let count=0;rows.forEach(row=>{row.hidden=!row.dataset.search.toLocaleLowerCase('ru').includes(query);if(!row.hidden)count++;});const empty=root.querySelector('[data-group-search-empty]');if(empty)empty.hidden=count>0;};
 root.__groupAtlasHandlers={change,click,input};root.addEventListener('change',change);root.addEventListener('click',click);root.addEventListener('input',input);
}
