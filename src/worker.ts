import {campaigns} from './campaigns.mjs';
import {GET,POST} from './agenda-api';
import {auth} from './auth.mjs';
export default {async fetch(req:Request,env:any){const u=new URL(req.url);if(u.pathname==='/api/campaigns'||u.pathname.startsWith('/api/campaigns/'))return campaigns(req,env);if(u.pathname==='/api/auth/login'||u.pathname==='/api/auth/logout')return auth(req,env);if(u.pathname.startsWith('/api/agenda/')){if(!['GET','POST'].includes(req.method))return new Response('Método no permitido',{status:405});return req.method==='POST'?POST(req):GET(req)}if(u.pathname==='/signin-with-chatgpt')return Response.redirect(u.origin+'/acceso.html',302);return env.ASSETS.fetch(req)}};
