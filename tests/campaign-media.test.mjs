import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {campaigns} from '../src/campaigns.mjs';
import {auth} from '../src/auth.mjs';

test('subida privada, confirmación atómica y descarga idéntica',async()=>{
 const sql=new DatabaseSync(':memory:');
 for(const migration of ['0001_campaigns','0002_campaign_media_parts'])
   sql.exec(readFileSync(new URL('../drizzle/'+migration+'.sql',import.meta.url),'utf8'));
 sql.exec('CREATE TABLE agenda_settings(key TEXT PRIMARY KEY,value TEXT)');
 function prepare(query,args=[]){
   const stmt=sql.prepare(query);
   return {bind:(...values)=>prepare(query,values),first:()=>stmt.get(...args),
     run:()=>({meta:stmt.run(...args)}),all:()=>({results:stmt.all(...args)})};
 }
 const db={prepare,async batch(statements){sql.exec('BEGIN');try{const rows=statements.map(s=>s.run());sql.exec('COMMIT');return rows}catch(e){sql.exec('ROLLBACK');throw e}}};
 const env={DB:db,ADMIN_KEY:'local-test-secret-only'.repeat(2)},origin='https://test.invalid';
 const login=await auth(new Request(origin+'/api/auth/login',{method:'POST',headers:{origin},body:JSON.stringify({password:env.ADMIN_KEY})}),env);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const call=(path,method='GET',body,extra={})=>campaigns(new Request(origin+'/api/campaigns'+path,{method,body,headers:{origin,cookie,...extra}}),env);
 const id=crypto.randomUUID(), data=randomBytes(1048576*2+331);
 const finish=()=>call('/'+id+'/finish','POST',JSON.stringify({title:'Prueba',caption:'',mime:'video/mp4',size:data.length}));
 const send=async(i)=>{const bytes=data.subarray(i*1048576,(i+1)*1048576);return call('/'+id+'/parts/'+i,'POST',bytes,{'content-length':String(bytes.length)})};
 assert.equal((await send(0)).status,200);
 assert.equal((await finish()).status,409);
 assert.equal((await (await call('')).json()).items.length,0);
 for(const i of [1,1,2])assert.equal((await send(i)).status,200);
 assert.equal((await finish()).status,201);
 assert.equal((await finish()).status,201);
 assert.equal((await send(0)).status,409);
 const path='/'+id+'/media?download=1';
 assert.equal((await call(path,'GET',undefined,{cookie:''})).status,401);
 const result=await call(path);
 assert.match(result.headers.get('content-disposition'),/attachment/);
 assert.deepEqual(Buffer.from(await result.arrayBuffer()),data);
});
