import {Buffer} from 'node:buffer';

const chunk = 1048576;
const types = new Map([['video/mp4','mp4'],['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']]);
const reply = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function uploadPart(req,db,id,index) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^(?:[0-9]|[1-4][0-9])$/.test(index)) return reply({error:'Parte inválida'},400);
  const size = Number(req.headers.get('content-length'));
  if (!(size>0 && size<=chunk)) return reply({error:'Tamaño de parte inválido'},413);
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length!==size) return reply({error:'Carga incompleta'},400);
  if (index==='0') await db.prepare('DELETE FROM campaign_media_parts WHERE expires < unixepoch()').run();
  const result = await db.prepare(`INSERT INTO campaign_media_parts SELECT ?,?,?,?,unixepoch()+86400
    WHERE NOT EXISTS(SELECT 1 FROM campaigns WHERE id=?)
    ON CONFLICT(campaign_id,part) DO UPDATE SET data=excluded.data,bytes=excluded.bytes,expires=excluded.expires
    WHERE campaign_media_parts.expires IS NOT NULL`).bind(id,Number(index),data.toString('base64'),size,id).run();
  return result.meta.changes ? reply({ok:true}) : reply({error:'El archivo ya está guardado'},409);
}

export async function finishUpload(req,db,id) {
  const {title,caption,mime,size} = await req.json();
  if(typeof title!=='string'||!title.trim()||title.length>120||typeof caption!=='string'||caption.length>2200||
    !types.has(mime)||!Number.isSafeInteger(size)||size<1||size>50*chunk) return reply({error:'Revisá los datos de la campaña'},400);
  const count=Math.ceil(size/chunk), now=new Date().toISOString();
  const [insert] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO campaigns(id,title,caption,status,media_key,mime,size,created,updated,published_at)
      SELECT ?,?,?,'ready',?,?,?,?,?,NULL FROM campaign_media_parts WHERE campaign_id=?
      GROUP BY campaign_id HAVING COUNT(*)=? AND MAX(part)=?-1 AND SUM(bytes)=? AND MIN(expires)>unixepoch()
      AND SUM(CASE WHEN part<?-1 AND bytes<>1048576 THEN 1 ELSE 0 END)=0`)
      .bind(id,title.trim(),caption,'d1/'+id,mime,size,now,now,id,count,count,size,count),
    db.prepare('UPDATE campaign_media_parts SET expires=NULL WHERE campaign_id=? AND EXISTS(SELECT 1 FROM campaigns WHERE id=? AND media_key=?)').bind(id,id,'d1/'+id)
  ]);
  if(!insert.meta.changes && !await db.prepare('SELECT id FROM campaigns WHERE id=? AND media_key=?').bind(id,'d1/'+id).first()) return reply({error:'Carga incompleta. Volvé a intentar.'},409);
  return reply({ok:true,id},201);
}

export function readMedia(db,row,download) {
  let part=0;
  const count=Math.ceil(row.size/chunk);
  const body=new ReadableStream({async pull(controller){
    const {results}=await db.prepare('SELECT part,data FROM campaign_media_parts WHERE campaign_id=? AND part>=? ORDER BY part LIMIT 2').bind(row.id,part).all();
    if(!results.length) throw Error('Archivo incompleto');
    for(const item of results){
      if(item.part!==part++) throw Error('Parte faltante');
      controller.enqueue(Buffer.from(item.data,'base64'));
    }
    if(part===count) controller.close();
  }});
  const headers={'Content-Type':row.mime,'Content-Length':String(row.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  if(download) headers['Content-Disposition']='attachment; filename="campana.'+types.get(row.mime)+'"';
  return new Response(body,{headers});
}
