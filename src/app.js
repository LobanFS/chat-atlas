const $ = id => document.getElementById(id);
let worker = null, result = null, busy = false, isDemo = false, jobId = 0, resultCurrent = false;
function setBusy(value,message='Считаем…') {
 busy=value; $('status').hidden=!value; $('status').textContent=message;
 for(const el of document.querySelectorAll('#settings input, #settings select, #settings button, #download-button, #demo-button, #file-input')) el.disabled=value;
 $('analysis-shell').setAttribute('aria-busy',String(value));
 $('download-button').disabled=value||!resultCurrent;
}
function showError(message) { $('error').textContent=message; $('error').hidden=false; if(!resultCurrent){$('report').hidden=true;$('report-nav').hidden=true;} setBusy(false); $('error').scrollIntoView({block:'center'}); }
function options() { return {sessionGapHours:Number($('gap').value),timezone:$('timezone').value,anonymize:$('anonymize').checked,includeLexicon:$('include-lexicon').checked,startDate:$('start-date').value,endDate:$('end-date').value}; }
function createWorker() {
 if(worker)worker.terminate();
 const id=++jobId;
 const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:'text/javascript'}));
 worker=new Worker(url); URL.revokeObjectURL(url);
 worker.onmessage=({data})=>{
  if(id!==jobId)return;
  if(data.status){$('status').textContent=data.status;return;}
  if(data.error){showError(data.error);return;}
  if(data.result){result=data.result;resultCurrent=true;setBusy(false);$('welcome').hidden=true;$('analysis-shell').hidden=false;render();}
 };
 worker.onerror=()=>showError('Не удалось запустить анализ в браузере. Откройте HTML в актуальном Chrome, Firefox, Safari или Edge.');
}
function analyze(payload={}) {
 $('error').hidden=true;resultCurrent=false;setBusy(true);
 try { if(!worker||payload.file||payload.demo)createWorker(); worker.postMessage({...payload,options:options()}); }
 catch(e){showError(e.message);}
}
function loadFile(file){
 if(!file||busy)return;
 if(file.size>200*1024*1024){showError('Файл больше 200 МБ. Экспортируйте более короткий период: этот анализатор рассчитан на отдельный личный чат.');return;}
 isDemo=false;$('start-date').value='';$('end-date').value='';analyze({file});
}
function render(){
 if(!result||!resultCurrent)return;
 $('report').hidden=false; $('report-nav').hidden=false;
 const mode=$('mode').value;
 $('dataset-label').textContent=`${isDemo?'Демо · синтетические данные · ':''}${result.meta.startDate||'Нет дат'} — ${result.meta.endDate||'Нет дат'} · ${result.participants.map(p=>p.name).join(' и ')}`;
 $('report-nav').innerHTML=renderNavigation(mode,Boolean(result.meta.includeLexicon&&result.lexicon));
 $('report').innerHTML=renderReport(result,{mode});
}
function exportHtml(){
 if(!result||busy||!resultCurrent)return;
 const mode=$('mode').value;
 const html=renderDocument(result,renderReport(result,{mode}),REPORT_STYLES,{mode,isDemo});
 const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`chat-atlas-${result.meta.startDate||'report'}-${mode}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('file-input').addEventListener('change',e=>loadFile(e.target.files[0]));
$('demo-button').addEventListener('click',()=>{isDemo=true;$('start-date').value='';$('end-date').value='';analyze({demo:createDemo()});});
$('download-button').addEventListener('click',exportHtml);
$('settings').addEventListener('submit',e=>{e.preventDefault();if(!busy)analyze();});
for(const id of ['gap','timezone','anonymize','include-lexicon'])$(id).addEventListener('change',()=>analyze());
$('mode').addEventListener('change',render);
$('clear-range').addEventListener('click',()=>{$('start-date').value='';$('end-date').value='';analyze();});
$('help-toggle').addEventListener('click',()=>{const show=$('help').hidden;$('help').hidden=!show;$('help-toggle').setAttribute('aria-expanded',String(show));});
$('reset-button').addEventListener('click',()=>{if(worker)worker.terminate();worker=null;jobId++;result=null;resultCurrent=false;isDemo=false;setBusy(false);$('analysis-shell').hidden=true;$('welcome').hidden=false;$('error').hidden=true;$('file-input').value='';$('start-date').value='';$('end-date').value='';window.scrollTo({top:0});});
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.add('dragging');});
for(const event of ['dragleave','drop'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');});
$('drop-zone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
