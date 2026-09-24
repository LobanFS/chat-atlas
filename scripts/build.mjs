import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [template, styles, engine, report, document, demo, app] = await Promise.all(['src/index.template.html','src/styles.css','src/engine.js','src/report.js','src/document.js','src/demo.js','src/app.js'].map(read));
const plain = source => source.replace(/^export\s+/gm, '');
const workerSource = `${plain(engine)}\nlet cached; self.onmessage=async ({data})=>{try{if(data.file){self.postMessage({status:'Читаем JSON…'}); const text=await data.file.text(); self.postMessage({status:'Разбираем структуру экспорта…'}); try{cached=JSON.parse(text);}catch{throw new Error('Не удалось прочитать JSON. Выберите result.json из экспорта Telegram в формате JSON.');}}else if(data.demo){cached=data.demo;} if(!cached)throw new Error('Сначала выберите JSON.');self.postMessage({status:'Считаем ритм, реплики и паузы…'});const result=analyzeExport(cached,data.options);self.postMessage({result});}catch(error){self.postMessage({error:error.message||'Не удалось обработать экспорт.'});}};`;
const script = `const WORKER_SOURCE=${JSON.stringify(workerSource)};\nconst REPORT_STYLES=${JSON.stringify(styles)};\n${plain(report)}\n${plain(document)}\n${plain(demo)}\n${app}`;
// Prevent closing the script element even if a future literal contains that sequence.
const html = template.replace('/*__STYLES__*/', () => styles).replace('/*__SCRIPT__*/', () => script.replace(/<\/script/gi, '<\\/script'));
await mkdir(new URL('dist/', root),{recursive:true});
await writeFile(new URL('dist/index.html', root),html);
console.log(`Built dist/index.html (${Math.round(Buffer.byteLength(html)/1024)} KiB), self-contained; zero dependencies.`);
