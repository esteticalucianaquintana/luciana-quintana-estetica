const enc = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2,'0')).join('');
const rememberedSeconds = 30*24*60*60;
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
  if(extra.length||!nonce||!sig||!/^\d+$/.test(exp)||Number(exp)<now||Number(exp)>now+(rememberedSeconds+60)*1000)return false;
  return same(sig,await sign(exp+'.'+nonce,await sessionKey(env,record)));
}
export async function isAdmin(req,env,now=Date.now()){
  if(!env.ADMIN_KEY||env.ADMIN_KEY.length<32||!req.headers.has('cookie'))return false;
  return valid(req,env,await stored(env),now);
}
const json=(x,status=200,headers={})=>Response.json(x,{status,headers:{'Cache-Control':'no-store',...headers}});
async function startSession(env,record,remember){
  const seconds=remember === true ? rememberedSeconds : 12*3600;
  const message=(Date.now()+seconds*1000)+'.'+crypto.randomUUID();
  const token=message+'.'+await sign(message,await sessionKey(env,record));
  return json({ok:true},200,{'Set-Cookie':'__Host-lq='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds});
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
    if(!/^[0-9]{4,8}$/.test(body.password))return json({error:'Elegí un PIN de 4 a 8 dígitos.'},400);
    const salt=crypto.randomUUID();
    const next='pin1.'+salt+'.'+await verifier(await sign(body.password,env.ADMIN_KEY),salt);
    const result=record===null
      ? await env.DB.prepare('INSERT OR IGNORE INTO agenda_settings(key,value) VALUES(?,?)').bind(setting,next).run()
      : await env.DB.prepare('UPDATE agenda_settings SET value=? WHERE key=? AND value=?').bind(next,setting,record).run();
    if(!result.meta.changes)return json({error:'La clave cambió. Volvé a ingresar.'},409);
    return startSession(env,next,body.remember);
  }
  const pin=record?.startsWith('pin1.');
  if(pin){
    const now=Date.now(), interval=180000;
    const attempt=await env.DB.prepare(`INSERT INTO agenda_settings(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),?)+?
      WHERE CAST(value AS INTEGER)<=? RETURNING value`)
      .bind('panel_pin_attempts',String(now+interval),now,interval,now+4*interval).first();
    if(!attempt)return json({error:'Demasiados intentos. Esperá unos minutos antes de volver a probar.'},429);
  }
  const correct=record===null
    ? same(await sign(body.password,env.ADMIN_KEY),await sign(env.ADMIN_KEY,env.ADMIN_KEY))
    : pin ? same(record.split('.')[2],await verifier(await sign(body.password,env.ADMIN_KEY),record.split('.')[1]))
    : same(record.split('.')[1],await verifier(body.password,record.split('.')[0]));
  if(!correct)return json({error:'Clave incorrecta'},401);
  if(pin)await env.DB.prepare('DELETE FROM agenda_settings WHERE key=?').bind('panel_pin_attempts').run();
  return startSession(env,record,body.remember);
}
