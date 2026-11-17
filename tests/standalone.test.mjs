import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';import {isAdmin,auth} from '../src/auth.mjs';
const key='test-only-private-key-0123456789-abcdefghijklmnopqrstuvwxyz';const E={ADMIN_KEY:key};
const request=(p,data,cookie)=>new Request('https://example.test'+p,{method:data?'POST':'GET',headers:{Origin:'https://example.test',...(cookie?{cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});let cookie;
test('la clave protege el panel sin identidad de ChatGPT',async()=>{assert.equal(await isAdmin(request('/'),E),false);assert.equal(await isAdmin(new Request('https://example.test/',{headers:{'oai-authenticated-user-email':'gonzalopaterson@gmail.com'}}),E),false);assert.equal((await auth(request('/api/auth/login',{password:'incorrecta'}),E)).status,401);const r=await auth(request('/api/auth/login',{password:key}),E);assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];assert(cookie.startsWith('__Host-lq='));assert(await isAdmin(request('/',null,cookie),E));assert(!await isAdmin(request('/',null,cookie+'x'),E));assert(!await isAdmin(request('/',null,cookie),E,Date.now()+86400000));assert(!await isAdmin(request('/',null,cookie),{ADMIN_KEY:key+'changed'}));});
test('rechaza origen externo y no da una clave por defecto',async()=>{let r=await auth(new Request('https://example.test/api/auth/login',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify({password:key})}),E);assert.equal(r.status,403);assert.equal((await auth(request('/api/auth/login',{password:key}),{})).status,503)});
// The integration test loads the exact worker source with Cloudflare's binding replaced by an in-memory SQLite D1 adapter.
const db=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')))db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{sql,v:[],bind(...x){this.v=x;return this},async first(){return db.prepare(this.sql).get(...this.v)||null},async all(){return{results:db.prepare(this.sql).all(...this.v)}},async run(){return db.prepare(this.sql).run(...this.v)}}},async batch(a){db.exec('BEGIN IMMEDIATE');try{const r=a.map(x=>({results:db.prepare(x.sql).all(...x.v)}));db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};globalThis.standaloneEnv={...E,DB,ASSETS:{fetch:()=>new Response('asset')}};
const {build}=await import(process.env.LQ_ESBUILD_MODULE||'esbuild');await build({entryPoints:['src/worker.ts'],outfile:'/tmp/lq-standalone-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'mock-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.standaloneEnv'}))}}]});const worker=(await import('/tmp/lq-standalone-test.mjs')).default;
test('web y reserva usan una sola base; gestión requiere cookie propia',async()=>{let r=await worker.fetch(request('/api/agenda/admin/bookings'),globalThis.standaloneEnv);assert.equal(r.status,401);let b=await worker.fetch(request('/api/agenda/book',{service:0,zones:3,day:'2030-12-02',start:'13:30',patient:'Ejemplo',phone:'5492990000000',testConsent:true}),globalThis.standaloneEnv);assert.equal(b.status,201,await b.clone().text());let rows=await worker.fetch(request('/api/agenda/admin/bookings',null,cookie),globalThis.standaloneEnv);assert.equal(rows.status,200);assert.equal((await rows.json())[0].duration,45);let conflict=await worker.fetch(request('/api/agenda/book',{service:1,zones:1,day:'2030-12-02',start:'13:45',patient:'Otra',phone:'5492990000000',testConsent:true}),globalThis.standaloneEnv);assert.equal(conflict.status,409);});
import {campaigns} from '../src/campaigns.mjs';
test('campañas: acceso privado, origen y almacenamiento sin activar',async()=>{
 assert.equal((await campaigns(request('/api/campaigns'),globalThis.standaloneEnv)).status,401);
 const list=await campaigns(request('/api/campaigns',null,cookie),globalThis.standaloneEnv);assert.equal(list.status,200);assert.deepEqual((await list.json()).items,[]);
 const form=new FormData();form.set('title','Video sin almacenamiento');form.set('file',new File(['test'],'test.mp4',{type:'video/mp4'}));const missing=await campaigns(new Request('https://example.test/api/campaigns',{method:'POST',headers:{Origin:'https://example.test',cookie},body:form}),globalThis.standaloneEnv);assert.equal(missing.status,503);
 const bad=await campaigns(new Request('https://example.test/api/campaigns/x/status',{method:'POST',headers:{Origin:'https://evil.test',cookie}}),globalThis.standaloneEnv);assert.equal(bad.status,403);
});
test('biblioteca compartida: carga y estado persisten; nunca publica en Instagram',async()=>{
 const objects=new Map();const e={...globalThis.standaloneEnv,CAMPAIGN_MEDIA:{async put(k,stream){objects.set(k,await new Response(stream).arrayBuffer())},async get(k){const b=objects.get(k);return b?{body:b,size:b.byteLength}:null},async delete(k){objects.delete(k)}}};
 const form=new FormData();form.set('title','Campaña ejemplo');form.set('caption','Texto de prueba');form.set('file',new File(['test'],'ejemplo.mp4',{type:'video/mp4'}));
 const upload=await campaigns(new Request('https://example.test/api/campaigns',{method:'POST',headers:{Origin:'https://example.test',cookie},body:form}),e);assert.equal(upload.status,201);const {id}=await upload.json();
 const rows=await (await campaigns(request('/api/campaigns',null,cookie),e)).json();assert.equal(rows.items[0].id,id);assert.equal(rows.instagramConnected,false);
 const update=await campaigns(request('/api/campaigns/'+id+'/status',{status:'published'},cookie),e);assert.equal(update.status,200);
 assert.equal((await (await campaigns(request('/api/campaigns',null,cookie),e)).json()).items[0].status,'published');
 const media=await campaigns(request('/api/campaigns/'+id+'/media',null,cookie),e);assert.equal(await media.text(),'test');assert.equal(media.headers.get('cache-control'),'private, no-store');
});

const formRequest=(title,caption='',file,path='/api/campaigns')=>{const body=new FormData();body.set('title',title);body.set('caption',caption);if(file)body.set('file',file);return new Request('https://example.test'+path,{method:'POST',headers:{Origin:'https://example.test',cookie},body})};
test('borrador sin R2: crear, consultar, editar, archivar y recuperar sin alterar archivos existentes',async()=>{
 const env=globalThis.standaloneEnv;
 const before=db.prepare("SELECT * FROM campaigns WHERE media_key<>''").all();
 const r=await campaigns(formRequest(' Borrador ','Texto pendiente'),env);assert.equal(r.status,201);const {id}=await r.json();
 let row=db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);assert.equal(row.title,'Borrador');assert.equal(row.media_key,'');assert.equal(row.mime,'');assert.equal(row.size,0);
 const list=await (await campaigns(request('/api/campaigns',null,cookie),env)).json();assert.equal(list.uploadsReady,false);assert(list.items.some(x=>x.id===id));
 assert.equal((await campaigns(request('/api/campaigns/'+id+'/media',null,cookie),env)).status,404);
 assert.equal((await campaigns(request('/api/campaigns/'+id+'/content',{title:'Editado',caption:'Nuevo texto'},cookie),env)).status,200);
 assert.equal((await campaigns(request('/api/campaigns/'+id+'/status',{status:'published'},cookie),env)).status,400);
 for(const status of ['archived','ready'])assert.equal((await campaigns(request('/api/campaigns/'+id+'/status',{status},cookie),env)).status,200);
 row=db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);assert.equal(row.caption,'Nuevo texto');assert.equal(row.status,'ready');assert.deepEqual(db.prepare("SELECT * FROM campaigns WHERE media_key<>''").all(),before);
});
test('validación de borradores y adjuntos no guarda datos inválidos',async()=>{
 const e=globalThis.standaloneEnv,before=db.prepare('SELECT COUNT(*) n FROM campaigns').get().n;
 for(const [title,caption,file] of [['',''],['x'.repeat(121),''],['Título','x'.repeat(2201)],['Título','',new File(['x'],'x.txt',{type:'text/plain'})],['Título','',new File([],'vacio.mp4',{type:'video/mp4'})]])assert.equal((await campaigns(formRequest(title,caption,file),e)).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM campaigns').get().n,before);
 assert.equal((await campaigns(request('/api/campaigns/inexistente/content',{title:'X',caption:''},cookie),e)).status,404);
 assert.equal((await campaigns(request('/api/campaigns/inexistente/media',null,cookie),e)).status,404);
});
test('adjuntar después de conectar R2 conserva borrador y protege archivo original',async()=>{
 const e0=globalThis.standaloneEnv,objects=new Map();
 const e={...e0,CAMPAIGN_MEDIA:{async put(k,s){objects.set(k,await new Response(s).arrayBuffer())},async get(k){const b=objects.get(k);return b?{body:b,size:b.byteLength}:null},async delete(k){objects.delete(k)}}};
 const {id}=await (await campaigns(formRequest('Adjuntar después','Mi texto'),e0)).json();const path='/api/campaigns/'+id+'/media',file=new File(['video'],'v.mp4',{type:'video/mp4'});
 assert.equal((await campaigns(formRequest('','',file,path),e0)).status,503);assert.equal(objects.size,0);
 assert.equal((await campaigns(formRequest('','',file,path),e)).status,200);assert.equal(objects.size,1);
 assert.equal((await campaigns(formRequest('','',file,path),e)).status,409);assert.equal(objects.size,1);
 const row=db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);assert.equal(row.caption,'Mi texto');assert.equal(row.title,'Adjuntar después');
 assert.equal(await (await campaigns(request(path,null,cookie),e)).text(),'video');
 assert.equal((await campaigns(request('/api/campaigns/'+id+'/status',{status:'published'},cookie),e)).status,200);
});
test('nuevas operaciones mantienen autenticación y origen',async()=>{
 const e=globalThis.standaloneEnv;
 for(const action of ['content','media','status']){
 const path='/api/campaigns/x/'+action;
 assert.equal((await campaigns(request(path,{title:'X',caption:''}),e)).status,401);
 const r=new Request('https://example.test'+path,{method:'POST',headers:{Origin:'https://externo.test',cookie},body:'{}'});assert.equal((await campaigns(r,e)).status,403);
 }
});
test('fallo de D1 elimina el archivo recién cargado y no borra otros',async()=>{
 const keys=new Set(['original']);const e={...globalThis.standaloneEnv,DB:{prepare(){return{bind(){return this},async run(){throw Error('D1 error')}}}},CAMPAIGN_MEDIA:{async put(k){keys.add(k)},async delete(k){keys.delete(k)}}};
 const r=await campaigns(formRequest('Error','',new File(['video'],'v.mp4',{type:'video/mp4'})),e);assert.equal(r.status,500);assert.deepEqual([...keys],['original']);
});
import vm from 'node:vm';
test('pantalla sin R2: guarda texto, busca borradores y no crea un reproductor vacío',async()=>{
 class Element{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.value='';this.files=[];this.disabled=false}append(...items){this.children.push(...items)}replaceChildren(){this.children=[]}scrollIntoView(){}focus(){}reset(){}}
 const nodes=Object.fromEntries(['items','filter','search','content','save','file','storage','message','cancel-edit','upload','title','caption'].map(x=>[x,new Element()]));nodes.filter.value='all';const calls=[];
 const context={document:{getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},location:{replace(){throw Error('Unexpected redirect')}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,FormData,fetch:async(url,options)=>{calls.push({url,options});return Response.json(options?{ok:true,id:'new'}:{items:[{id:'draft',title:'Campaña verano',caption:'Texto',status:'ready',media_key:'',mime:''}],uploadsReady:false})}};
 vm.runInNewContext(readFileSync('public/campanas.js','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes.save.disabled,false);assert.equal(nodes.file.disabled,true);
 const flatten=e=>[e,...e.children.filter(x=>typeof x==='object').flatMap(flatten)];let elements=flatten(nodes.items);assert(!elements.some(x=>['VIDEO','IMG'].includes(x.tagName)));assert(!elements.some(x=>x.textContent==='Marcar publicada'));
 nodes.search.value='no existe';nodes.search.oninput();assert.equal(nodes.items.children.length,0);nodes.search.value='verano';nodes.search.oninput();assert.equal(nodes.items.children.length,1);
 nodes.title.value='Nuevo';nodes.caption.value='Texto nuevo';await nodes.upload.onsubmit({preventDefault(){}});const post=calls.find(x=>x.options?.method==='POST');assert.equal(post.options.body.get('title'),'Nuevo');assert.equal(post.options.body.get('caption'),'Texto nuevo');assert.equal(post.options.body.has('file'),false);
});
