import {isAdmin} from './auth.mjs';
const max=50*1024*1024;
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const validText=(title,caption)=>title.length>0&&title.length<=120&&caption.length<=2200;
const validFile=file=>file&&typeof file!=='string'&&file.size>0&&file.size<=max&&['video/mp4','image/jpeg','image/png','image/webp'].includes(file.type);
export async function campaigns(req,env){
 if(!await isAdmin(req,env))return json({error:'Iniciá sesión para acceder a las campañas'},401);
 const u=new URL(req.url),part=u.pathname.slice('/api/campaigns'.length).split('/').filter(Boolean);
 if(!['GET','POST'].includes(req.method))return json({error:'Método no permitido'},405);
 if(req.method==='POST'&&req.headers.get('origin')!==u.origin)return json({error:'Origen inválido'},403);
 if(!env.DB)return json({error:'Base de datos no disponible'},503);
 try{
 if(req.method==='GET'&&!part.length){let rows;try{rows=await env.DB.prepare('SELECT * FROM campaigns ORDER BY created DESC').all()}catch{return json({error:'Biblioteca pendiente de aplicar su actualización en Cloudflare',setupRequired:true},503)}return json({items:rows.results,uploadsReady:!!env.CAMPAIGN_MEDIA,instagramConnected:false})}
 if(part.length===2&&part[1]==='media'){
  const row=await env.DB.prepare('SELECT * FROM campaigns WHERE id=?').bind(part[0]).first();if(!row)return json({error:'Campaña no encontrada'},404);
  if(req.method==='GET'){
   if(!row.media_key)return json({error:'Este borrador todavía no tiene archivo'},404);
   if(!env.CAMPAIGN_MEDIA)return json({error:'Almacenamiento de videos sin conectar'},503);
   const file=await env.CAMPAIGN_MEDIA.get(row.media_key);if(!file)return json({error:'Archivo no encontrado'},404);
   return new Response(file.body,{headers:{'Content-Type':row.mime,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
  }
  if(!env.CAMPAIGN_MEDIA)return json({error:'Falta conectar el almacenamiento para adjuntar videos o imágenes'},503);
  if(row.media_key)return json({error:'La campaña ya tiene un archivo. Creá otra campaña para conservar el original.'},409);
  if(Number(req.headers.get('content-length')||0)>max+65536)return json({error:'Máximo 50 MB por archivo'},413);
  const file=(await req.formData()).get('file');if(!validFile(file))return json({error:'Elegí MP4/JPG/PNG/WebP de hasta 50 MB'},400);
  const key='campaigns/'+row.id+'/'+crypto.randomUUID();await env.CAMPAIGN_MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
  try{const result=await env.DB.prepare("UPDATE campaigns SET media_key=?,mime=?,size=?,updated=? WHERE id=? AND media_key=''").bind(key,file.type,file.size,new Date().toISOString(),row.id).run();if(result.meta?.changes===0||result.changes===0){await env.CAMPAIGN_MEDIA.delete(key);return json({error:'Otro administrador ya adjuntó un archivo. Actualizá la biblioteca.'},409)}}catch(e){await env.CAMPAIGN_MEDIA.delete(key);throw e}
  return json({ok:true})
 }
 if(req.method==='POST'&&!part.length){
  if(Number(req.headers.get('content-length')||0)>max+65536)return json({error:'Máximo 50 MB por archivo'},413);
  const form=await req.formData(),raw=form.get('file'),file=raw&&typeof raw!=='string'&&raw.size===0&&!raw.name?null:raw,title=String(form.get('title')||'').trim(),caption=String(form.get('caption')||'');
  if(!validText(title,caption))return json({error:'Revisá título (1–120 caracteres) y texto (hasta 2200)'},400);
  if(file&&!validFile(file))return json({error:'Elegí MP4/JPG/PNG/WebP de hasta 50 MB'},400);
  if(file&&!env.CAMPAIGN_MEDIA)return json({error:'El video no se guardó: falta conectar el almacenamiento. Podés guardar el título y texto sin archivo.'},503);
  const id=crypto.randomUUID(),key=file?'campaigns/'+id:'',now=new Date().toISOString();
  if(file)await env.CAMPAIGN_MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
  try{await env.DB.prepare('INSERT INTO campaigns(id,title,caption,status,media_key,mime,size,created,updated,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,title,caption,'ready',key,file?.type||'',file?.size||0,now,now,null).run()}catch(e){if(file)await env.CAMPAIGN_MEDIA.delete(key);throw e}
  return json({ok:true,id},201)
 }
 if(req.method==='POST'&&part.length===2&&part[1]==='content'){
  const b=await req.json(),title=typeof b.title==='string'?b.title.trim():'',caption=typeof b.caption==='string'?b.caption:'';
  if(!validText(title,caption))return json({error:'Revisá título y texto (hasta 2200 caracteres)'},400);
  const row=await env.DB.prepare('SELECT id FROM campaigns WHERE id=?').bind(part[0]).first();if(!row)return json({error:'Campaña no encontrada'},404);
  await env.DB.prepare('UPDATE campaigns SET title=?,caption=?,updated=? WHERE id=?').bind(title,caption,new Date().toISOString(),row.id).run();return json({ok:true})
 }
 if(req.method==='POST'&&part.length===2&&part[1]==='status'){
  const b=await req.json();if(!['ready','published','archived'].includes(b.status))return json({error:'Estado inválido'},400);
  const row=await env.DB.prepare('SELECT * FROM campaigns WHERE id=?').bind(part[0]).first();if(!row)return json({error:'Campaña no encontrada'},404);
  if(b.status==='published'&&!row.media_key)return json({error:'Adjuntá el video o imagen antes de marcarla publicada'},400);
  const now=new Date().toISOString();await env.DB.prepare('UPDATE campaigns SET status=?,updated=?,published_at=? WHERE id=?').bind(b.status,now,b.status==='published'?now:null,part[0]).run();return json({ok:true})
 }
 return json({error:'Operación no disponible'},404)
 }catch{return json({error:'No se pudo completar. Revisá la conexión y la configuración de la biblioteca.'},500)}
}
