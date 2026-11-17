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
 const missing=await campaigns(new Request('https://example.test/api/campaigns',{method:'POST',headers:{Origin:'https://example.test',cookie}}),globalThis.standaloneEnv);assert.equal(missing.status,503);
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

test('carga manual: exige sesión, origen correcto y consentimiento de prueba',async()=>{
 const e=globalThis.standaloneEnv,payload={patient:'Paciente ficticia',phone:'',service:1,zones:1,day:'2030-12-09',start:'13:30',testConsent:true};
 assert.equal((await worker.fetch(request('/api/agenda/admin/book',payload),e)).status,401);
 assert.equal((await worker.fetch(new Request('https://example.test/api/agenda/admin/book',{method:'POST',headers:{Origin:'https://externo.test',cookie,'Content-Type':'application/json'},body:JSON.stringify(payload)}),e)).status,403);
 assert.equal((await worker.fetch(request('/api/agenda/admin/book',{...payload,testConsent:false},cookie),e)).status,400);
});
let manualBookingId;
test('turno manual sin teléfono aparece en la misma agenda y bloquea reserva online',async()=>{
 const e=globalThis.standaloneEnv,payload={patient:'Paciente de papel',phone:'',service:1,zones:1,day:'2030-12-09',start:'13:30',testConsent:true};
 const r=await worker.fetch(request('/api/agenda/admin/book',payload,cookie),e);assert.equal(r.status,201,await r.clone().text());const booking=await r.json();manualBookingId=booking.id;
 const list=await (await worker.fetch(request('/api/agenda/admin/bookings',null,cookie),e)).json();const saved=list.find(x=>x.id===booking.id);assert.equal(saved.patient,'Paciente de papel');assert.equal(saved.phone,'');assert.equal(saved.start,810);assert.equal(saved.duration,30);
 const availability=await (await worker.fetch(request('/api/agenda/slots?service=0&zones=1&day=2030-12-09'),e)).json();assert(!availability.slots.includes('13:30'));assert(!availability.slots.includes('13:45'));assert(availability.slots.includes('14:00'));
 const conflict=await worker.fetch(request('/api/agenda/book',{...payload,patient:'Online',phone:'5492990000000',service:0,start:'13:45'}),e);assert.equal(conflict.status,409);
 const notice=db.prepare("SELECT payload FROM agenda_notices WHERE booking=? AND kind='reservation'").get(booking.id);assert.equal(JSON.parse(notice.payload).source,'manual');
});
test('reserva online impide que Luciana asigne el mismo espacio',async()=>{
 const e=globalThis.standaloneEnv,payload={patient:'Reserva online',phone:'5492990000000',service:0,zones:1,day:'2030-12-09',start:'14:00',testConsent:true};
 assert.equal((await worker.fetch(request('/api/agenda/book',payload),e)).status,201);
 assert.equal((await worker.fetch(request('/api/agenda/admin/book',{...payload,patient:'Superpuesta'},cookie),e)).status,409);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM agenda_bookings WHERE day='2030-12-09' AND start=840").get().n,1);
});
test('carga manual respeta validación, horarios y duración por zonas',async()=>{
 const e=globalThis.standaloneEnv,base={patient:'Ejemplo',phone:'',service:0,zones:3,day:'2030-12-10',start:'15:00',testConsent:true};
 for(const change of [{patient:''},{phone:'123'},{service:99},{zones:0},{zones:21},{start:'30:00'},{day:'no-fecha'},{day:'2000-01-01'}])assert.notEqual((await worker.fetch(request('/api/agenda/admin/book',{...base,...change},cookie),e)).status,201);
 assert.equal((await worker.fetch(request('/api/agenda/admin/book',{...base,start:'08:00'},cookie),e)).status,409);
 const r=await worker.fetch(request('/api/agenda/admin/book',{...base,phone:'5492990000001'},cookie),e);assert.equal(r.status,201);assert.equal((await r.json()).duration,45);
 const b=db.prepare("SELECT * FROM agenda_bookings WHERE day='2030-12-10'").get();assert.equal(b.phone,'5492990000001');
});
test('cancelar turno manual libera disponibilidad para reservas online',async()=>{
 const e=globalThis.standaloneEnv;
 assert.equal((await worker.fetch(request('/api/agenda/admin/cancel',{id:manualBookingId},cookie),e)).status,200);
 const r=await worker.fetch(request('/api/agenda/book',{patient:'Nueva reserva',phone:'5492990000002',service:1,zones:1,day:'2030-12-09',start:'13:30',testConsent:true}),e);assert.equal(r.status,201);
 assert.equal(db.prepare('SELECT status FROM agenda_bookings WHERE id=?').get(manualBookingId).status,'cancelled');
});
test('el formulario público sigue exigiendo teléfono',async()=>{
 const r=await worker.fetch(request('/api/agenda/book',{patient:'Online sin teléfono',phone:'',service:0,zones:1,day:'2030-12-11',start:'13:30',testConsent:true}),globalThis.standaloneEnv);assert.equal(r.status,400);
});
import vm from 'node:vm';
test('panel manual: sincroniza día, envía el turno y actualiza el listado',async()=>{
 class Element{constructor(){this.value='';this.disabled=false;this.checked=false;this.events={};this.options=[];this.textContent=''}addEventListener(type,fn){this.events[type]=fn}replaceChildren(){this.options=[];this.value=''}add(o){this.options.push(o);if(this.options.length===1)this.value=String(o.value)}}
 const ids=['manualBooking','manualService','manualZones','manualDay','manualSave','manualTime','manualDuration','manualMessage','manualPatient','manualPhone','manualConsent','filterDay','manualPanel'];const nodes=Object.fromEntries(ids.map(x=>[x,new Element()]));nodes.manualZones.value='1';nodes.filterDay.value='2030-12-16';const calls=[];let rendered=0;
 const source=readFileSync('public/turnos.js','utf8').split('// Manual entries share the same server availability and locking as online bookings.')[1].split('\ninit().catch')[0];
 const context={document:{getElementById:id=>nodes[id],querySelector:()=>({addEventListener(){}})},names:['Láser','Vela','Crio','RF'],today:'2030-12-16',Option:class{constructor(text,value){this.text=text;this.value=value}},$:id=>nodes[id],api:async(path,data)=>{calls.push({path,data});return path.startsWith('slots?')?{duration:30,slots:['14:00','14:30']}:{id:'manual-test'}},msg(){},renderBookings:async()=>{rendered++},renderCalendar:async()=>{},renderNotices:async()=>{}};
 vm.createContext(context);vm.runInContext(source,context);vm.runInContext('initManualBooking()',context);await new Promise(r=>setImmediate(r));
 assert.equal(nodes.manualSave.disabled,false);assert.equal(nodes.manualTime.value,'14:00');nodes.filterDay.value='2030-12-17';await vm.runInContext('syncManualDay()',context);assert.equal(nodes.manualDay.value,'2030-12-17');
 nodes.manualPatient.value='  Prueba de agenda  ';nodes.manualPhone.value='+54 9 299 0000000';nodes.manualConsent.checked=true;await nodes.manualBooking.onsubmit({preventDefault(){}});
 const saved=calls.find(x=>x.path==='admin/book');assert(saved);assert.equal(saved.data.patient,'Prueba de agenda');assert.equal(saved.data.phone,'5492990000000');assert.equal(saved.data.day,'2030-12-17');assert.equal(saved.data.start,'14:00');assert.equal(rendered,1);assert.equal(nodes.manualPatient.value,'');assert.equal(nodes.manualConsent.checked,false);
 const html=readFileSync('public/agenda-lucy.html','utf8');for(const id of ids)assert(html.includes('id="'+id+'"'),id);
});
