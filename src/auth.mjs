const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
const setting = 'panel_password_v1';
function same(a,b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i);
  return diff === 0;
}
async function sign(text,secret) {
  const k = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',k,enc.encode(text)));
}
async function verifier(password,salt) {
  const k = await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},k,256));
}
async function stored(env) {
  const row = await env.DB.prepare('SELECT value FROM agenda_settings WHERE key=?').bind(setting).first();
  return row?.value ?? null;
}
function sessionKey(env,record) {
  return record === null ? env.ADMIN_KEY : sign('panel-session:'+record,env.ADMIN_KEY);
}
async function valid(req,env,record,now) {
  const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-lq='))?.slice(10);
  if (!token) return false;
  const [exp,nonce,sig,...extra]=token.split('.');
  if(extra.length||!nonce||!sig||!/^\d+$/.test(exp)||Number(exp)<now||Number(exp)>now+13*3600000)return false;
  return same(sig,await sign(exp+'.'+nonce,await sessionKey(env,record)));
}
export async function isAdmin(req,env,now=Date.now()){
  if(!env.ADMIN_KEY||env.ADMIN_KEY.length<32||!req.headers.has('cookie'))return false;
  return valid(req,env,await stored(env),now);
}
const json=(x,status=200,headers={})=>Response.json(x,{status,headers:{'Cache-Control':'no-store',...headers}});
async function startSession(env,record){
  const message=(Date.now()+12*3600000)+'.'+crypto.randomUUID();
  const token=message+'.'+await sign(message,await sessionKey(env,record));
  return json({ok:true},200,{'Set-Cookie':'__Host-lq='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200'});
}
export async function auth(req,env){
  const url=new URL(req.url);
  if(req.method!=='POST'||req.headers.get('origin')!==url.origin)return json({error:'Solicitud no permitida'},403);
  if(url.pathname.endsWith('/logout'))return json({ok:true},200,{'Set-Cookie':'__Host-lq=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'});
  if(!env.ADMIN_KEY||env.ADMIN_KEY.length<32)return json({error:'Acceso sin configurar'},503);
  const body=await req.json().catch(()=>null);
  if(typeof body?.password!=='string'||body.password.length>256)return json({error:'Clave inválida'},400);
  const record=await stored(env);
  if(url.pathname.endsWith('/password')){
    if(!await valid(req,env,record,Date.now()))return json({error:'Volvé a iniciar sesión.'},401);
    if(body.password.trim().length<12)return json({error:'Elegí una frase de al menos 12 caracteres.'},400);
    const salt=crypto.randomUUID();
    const next=salt+'.'+await verifier(body.password,salt);
    const result=record===null
      ? await env.DB.prepare('INSERT OR IGNORE INTO agenda_settings(key,value) VALUES(?,?)').bind(setting,next).run()
      : await env.DB.prepare('UPDATE agenda_settings SET value=? WHERE key=? AND value=?').bind(next,setting,record).run();
    if(!result.meta.changes)return json({error:'La clave cambió. Volvé a ingresar.'},409);
    return startSession(env,next);
  }
  const correct=record===null
    ? same(await sign(body.password,env.ADMIN_KEY),await sign(env.ADMIN_KEY,env.ADMIN_KEY))
    : same(record.split('.')[1],await verifier(body.password,record.split('.')[0]));
  if(!correct)return json({error:'Clave incorrecta'},401);
  return startSession(env,record);
}
