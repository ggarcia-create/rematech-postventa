// Run locally with the OAuth client JSON downloaded from the user's Google Cloud project.
// Tokens remain in a private temporary file; never bundle this file or print token values.
import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Indica la ruta del JSON de cliente OAuth descargado de Google Cloud.');
const config=JSON.parse(readFileSync(file,'utf8')).web;
const redirect='http://127.0.0.1:8765/oauth2callback';
if(!config?.client_id||!config.client_secret||!config.redirect_uris?.includes(redirect))throw Error('Usa un cliente web con redirección '+redirect);
const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search=new URLSearchParams({client_id:config.client_id,redirect_uri:redirect,response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',login_hint:'g.garcia@rematech.mx',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
const resultFile='/tmp/rematech-gmail.env',urlFile='/tmp/rematech-gmail-auth-url.txt';
let processing=false;
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const callback=new URL(req.url,'http://127.0.0.1:8765');
 const candidate=callback.searchParams.get('state')||'';
 if(req.method!=='GET'||callback.pathname!=='/oauth2callback'||Buffer.byteLength(candidate)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(candidate),Buffer.from(state))){res.writeHead(400);res.end('Solicitud de autorización no válida.');return;}
 if(processing){res.writeHead(409);res.end('La autorización ya está procesándose.');return;}
 if(callback.searchParams.has('error')){res.writeHead(400);res.end('No se concedió autorización. Puedes volver al programa.');return;}
 const code=callback.searchParams.get('code');if(!code){res.writeHead(400);res.end('Falta el código de Google.');return;}
 processing=true;
 try{
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Google no completó la autorización.');const token=await r.json();
  if(!token.refresh_token||!token.scope?.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Error('Falta el permiso de envío o la autorización persistente.');
  const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(20000)});
  if(!identity.ok)throw Error('No se pudo confirmar la cuenta autorizada.');const account=await identity.json();
  if(account.email!=='g.garcia@rematech.mx'||!account.email_verified)throw Error('Debes autorizar exactamente g.garcia@rematech.mx.');
  const secrets={GMAIL_CLIENT_ID:config.client_id,GMAIL_CLIENT_SECRET:config.client_secret,GMAIL_REFRESH_TOKEN:token.refresh_token,GMAIL_ACCOUNT:account.email};
  writeFileSync(resultFile,Object.entries(secrets).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});chmodSync(resultFile,0o600);
  res.end('Cuenta de Gmail autorizada. Puedes volver a Codex. No se ha enviado ningún correo de prueba.');
  console.log('Cuenta correcta verificada. Autorización privada preparada para el servidor.');
  clearTimeout(expiry);server.close();
 }catch(error){res.writeHead(400);res.end(error.message);console.error(error.message);clearTimeout(expiry);server.close();process.exitCode=1;}
});
const expiry=setTimeout(()=>{console.error('La preparación caducó sin autorización.');server.close();process.exitCode=1;},20*60*1000);
server.listen(8765,'127.0.0.1',()=>{writeFileSync(urlFile,url.href,{mode:0o600});console.log('Conexión preparada. La dirección de autorización está en '+urlFile);});
