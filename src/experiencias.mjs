import {isAdmin} from './auth.mjs';

export async function experiencias(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const reply = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
  const admin = path === '/api/experiencias/admin';
  if (admin && !await isAdmin(req, env)) return reply({error:'Ingresá al panel.'}, 401);
  if (!admin && path !== '/api/experiencias') return reply({}, 404);
  if (req.method === 'GET') {
    const cursor = Number(url.searchParams.get('antes') || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(cursor) || cursor < 1) return reply({}, 400);
    const limit = admin ? 20 : 3;
    const {results} = await env.DB.prepare('SELECT id,firma,servicio,opinion FROM experiencias WHERE estado=? AND id<? ORDER BY id DESC LIMIT ?')
      .bind(admin && url.searchParams.get('vista') !== 'publicadas' ? 'pendiente' : 'publicada', cursor, limit + 1).all();
    return reply({items:results.slice(0,limit), mas:results.length > limit});
  }
  if (req.method !== 'POST') return reply({},405);
  if (req.headers.get('origin') !== url.origin) return reply({},403);
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== 'object') return reply({},400);
  if (admin) {
    if (data.accion === 'borrar' && Number.isSafeInteger(data.id)) {
      const result = await env.DB.prepare('DELETE FROM experiencias WHERE id=?').bind(data.id).run();
      return reply({ok:!!result.meta.changes},result.meta.changes ? 200 : 404);
    }
    if (!Number.isSafeInteger(data.id) || !['publicada','descartada'].includes(data.estado)) return reply({},400);
    const result = await env.DB.prepare("UPDATE experiencias SET estado=? WHERE id=? AND estado='pendiente'").bind(data.estado,data.id).run();
    return reply({ok:!!result.meta.changes},result.meta.changes ? 200 : 409);
  }
  const fields = [data.firma,data.opinion,data.servicio];
  if (!fields.every(v => typeof v === 'string') || data.consentimiento !== true) return reply({},400);
  const [firma,opinion,servicio] = fields.map(v => v.trim());
  if (!firma || firma.length>40 || !opinion || opinion.length>500 || servicio.length>60) return reply({},400);
  await env.DB.prepare('INSERT INTO experiencias (firma,opinion,servicio,consentimiento) VALUES (?,?,?,1)').bind(firma,opinion,servicio).run();
  return reply({ok:true},201);
}
