import http from 'node:http';
import {readFile} from 'node:fs/promises';
const port = Number(process.env.PORT || 4173);
const page = new URL('../dist/index.html',import.meta.url);
http.createServer(async (req,res)=>{
 if (req.url !== '/' && req.url !== '/index.html') {res.writeHead(404);res.end('Not found');return;}
 try {const html=await readFile(page);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(html);}catch {res.writeHead(503);res.end('Run npm run build first.');}
}).listen(port,'127.0.0.1',()=>console.log(`Chat Atlas: http://127.0.0.1:${port}`));
