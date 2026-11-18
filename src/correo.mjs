import {isAdmin} from './auth.mjs';
import {names,clock} from './agenda-core.mjs';

async function mailKey(secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig = await crypto.subtle.sign('HMAC',key,enc.encode('agenda:correo:reservas:v1'));
  return Array.from(new Uint8Array(sig), n => n.toString(16).padStart(2,'0')).join('');
}

export async function correo(req, env) {
  const url = new URL(req.url);
  const reply = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if (req.method !== 'POST') return reply({},405);
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 32) return reply({},503);
  if (url.pathname === '/api/correo/conectar') {
    if (req.headers.get('origin') !== url.origin || !await isAdmin(req,env)) return reply({},403);
    return reply({key:await mailKey(env.ADMIN_KEY)});
  }
  if (url.pathname !== '/api/correo/reservas') return reply({},404);
  if (req.headers.get('Authorization') !== 'Bearer '+await mailKey(env.ADMIN_KEY)) return reply({},401);
  const data = await req.json().catch(()=>null);
  if (data?.inicio === true) {
    const row = await env.DB.prepare('SELECT COALESCE(MAX(rowid),0) AS cursor FROM agenda_notices').first();
    return reply(row);
  }
  if (!Number.isSafeInteger(data?.cursor) || data.cursor < 0) return reply({},400);
  const {results} = await env.DB.prepare("SELECT n.rowid AS cursor,n.payload,b.service,b.patient FROM agenda_notices n JOIN agenda_bookings b ON b.id=n.booking WHERE n.rowid>? AND n.kind='reservation' ORDER BY n.rowid LIMIT 20").bind(data.cursor).all();
  return reply({reservas:results.map(row=>{
    const notice=JSON.parse(row.payload);
    return {cursor:row.cursor,servicio:names[row.service],paciente:row.patient,dia:notice.day,hora:clock(notice.start),origen:notice.source==='manual'?'Panel de Luciana':'Reserva online'};
  })});
}
