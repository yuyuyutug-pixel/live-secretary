import crypto from "node:crypto";

const STATIC_RAW_BASE=(process.env.STATIC_RAW_BASE||"https://raw.githubusercontent.com/yuyuyutug-pixel/live-secretary/spoon-api-integration").replace(/\\/$/,"");
const API_BASE=(process.env.SPOON_API_BASE||"https://jp-openapi.spooncast.net").replace(/\/$/,"");
const AUTHORIZE_URL=process.env.SPOON_AUTHORIZE_URL||"https://spooncast.net/jp/oauth/authorize";
const TOKEN_URL=process.env.SPOON_TOKEN_URL||API_BASE+"/v1/oauth/token";
const EVENTS_URL=process.env.SPOON_EVENTS_URL||API_BASE+"/v1/live/events";
const LIVE_URL=process.env.SPOON_LIVE_URL||API_BASE+"/v1/live";
const LISTENERS_URL=process.env.SPOON_LISTENERS_URL||API_BASE+"/v1/live/listeners";
const FANS_URL=process.env.SPOON_FANS_URL||API_BASE+"/v1/live/fans";
const CHAT_URL=process.env.SPOON_CHAT_URL||API_BASE+"/v1/live/chat";
const CLIENT_ID=process.env.SPOON_CLIENT_ID||"";
const CLIENT_SECRET=process.env.SPOON_CLIENT_SECRET||"";
const FIXED_REDIRECT=process.env.SPOON_REDIRECT_URI||"";
const SESSION_SECRET=process.env.SESSION_SECRET||"";
const SCOPES=process.env.SPOON_SCOPES||"live.read listeners.read fans.read events.chat events.presence events.like events.donation chat.send";
const CHAT_FIELD=process.env.SPOON_CHAT_FIELD||"message";
const TOKEN_AUTH=(process.env.SPOON_TOKEN_AUTH||"basic").toLowerCase();
const COOKIE="live_secretary_session",STATE_COOKIE="live_secretary_oauth_state";
const key=crypto.createHash("sha256").update(SESSION_SECRET||"dev-only-change-me").digest();

const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}})}
function redirect(url,headers={}){return new Response(null,{status:302,headers:{location:url,"cache-control":"no-store",...headers}})}
function cookies(req){const o={};for(const p of String(req.headers.get("cookie")||"").split(";")){const i=p.indexOf("=");if(i<0)continue;o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}return o}
function cookie(name,value,maxAge=2592000){return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`}
function seal(obj){const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",key,iv);const ct=Buffer.concat([c.update(JSON.stringify(obj),"utf8"),c.final()]);return Buffer.concat([iv,c.getAuthTag(),ct]).toString("base64url")}
function unseal(value){try{const raw=Buffer.from(value,"base64url"),iv=raw.subarray(0,12),tag=raw.subarray(12,28),ct=raw.subarray(28),d=crypto.createDecipheriv("aes-256-gcm",key,iv);d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(ct),d.final()]).toString("utf8"))}catch{return null}}
function origin(req){const u=new URL(req.url);return u.origin}
function redirectUri(req){return FIXED_REDIRECT||origin(req)+"/api/oauth/callback"}
function authHeaders(token,extra={}){return{authorization:"Bearer "+token,accept:"application/json",...extra}}
async function tokenCall(params,mode=TOKEN_AUTH){
  const headers={"content-type":"application/x-www-form-urlencoded","accept":"application/json"};
  let form=new URLSearchParams(params);
  if(mode==="basic")headers.authorization="Basic "+Buffer.from(CLIENT_ID+":"+CLIENT_SECRET).toString("base64");
  else{form.set("client_id",CLIENT_ID);form.set("client_secret",CLIENT_SECRET)}
  let r=await fetch(TOKEN_URL,{method:"POST",headers,body:form});
  if(!r.ok&&mode==="basic"){
    form=new URLSearchParams(params);form.set("client_id",CLIENT_ID);form.set("client_secret",CLIENT_SECRET);
    r=await fetch(TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:form});
  }
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!r.ok)throw new Error(`token endpoint ${r.status}: ${text.slice(0,500)}`);
  return data;
}
function sessionFrom(req){const v=cookies(req)[COOKIE];return v?unseal(v):null}
async function ensureAccess(req){
  let s=sessionFrom(req);if(!s?.access_token)return{session:null,setCookie:null};
  if((s.expires_at||0)>Date.now()+60000)return{session:s,setCookie:null};
  if(!s.refresh_token)return{session:null,setCookie:null};
  const fresh=await tokenCall({grant_type:"refresh_token",refresh_token:s.refresh_token});
  s={...s,...fresh,refresh_token:fresh.refresh_token||s.refresh_token,expires_at:Date.now()+Number(fresh.expires_in||3600)*1000};
  return{session:s,setCookie:cookie(COOKIE,seal(s),60*60*24*30)};
}
async function apiGet(url,token){
  const r=await fetch(url,{headers:authHeaders(token)});const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t}};
  if(!r.ok)throw new Error(`${r.status}: ${t.slice(0,500)}`);return d;
}
async function readBody(req){const t=await req.text();if(!t)return{};try{return JSON.parse(t)}catch{return Object.fromEntries(new URLSearchParams(t))}}
async function staticResponse(pathname){
  let p=pathname==="/"?"/index.html":pathname;
  if(p.includes(".."))return json({error:"not found"},404);
  const target=STATIC_RAW_BASE+p;
  const r=await fetch(target,{headers:{accept:"*/*"}});
  if(!r.ok)return json({error:"not found"},404);
  const ext=p.includes(".")?p.slice(p.lastIndexOf(".")):"";
  const headers={"content-type":MIME[ext]||r.headers.get("content-type")||"application/octet-stream","cache-control":ext===".html"?"no-cache":"public, max-age=300"};
  return new Response(r.body,{status:200,headers});
}
function sseProxy(upstream,extraHeaders={}){
  const reader=upstream.body.getReader();
  let timer,closed=false;
  const stream=new ReadableStream({
    start(controller){
      const enc=new TextEncoder();
      const ping=()=>{if(!closed){try{controller.enqueue(enc.encode(": live-secretary ping\n\n"))}catch{}}};
      timer=setInterval(ping,25000);
      (async()=>{
        try{
          while(true){const {done,value}=await reader.read();if(done)break;if(!closed)controller.enqueue(value)}
          if(!closed){closed=true;clearInterval(timer);controller.close()}
        }catch(e){if(!closed){closed=true;clearInterval(timer);controller.error(e)}}
      })();
    },
    cancel(){closed=true;clearInterval(timer);reader.cancel().catch(()=>{})}
  });
  return new Response(stream,{status:200,headers:{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","connection":"keep-alive",...extraHeaders}});
}

export default {
  async fetch(req){
    const u=new URL(req.url);
    try{
      if(u.pathname==="/health")return json({ok:true,service:"live-secretary-neon",version:"0.3.0"});
      if(u.pathname==="/api/status"){
        const s=sessionFrom(req);
        return json({configured:Boolean(CLIENT_ID&&CLIENT_SECRET&&SESSION_SECRET),authenticated:Boolean(s?.access_token),apiBase:API_BASE,scopes:SCOPES.split(/\s+/),capabilities:{comments:true,presence:true,likes:true,donations:true,listeners:true,fans:true,sendMessage:true}});
      }
      if(u.pathname==="/api/oauth/start"){
        if(!CLIENT_ID||!CLIENT_SECRET||!SESSION_SECRET)return json({error:"Spoon OAuth is not configured"},503);
        const state=crypto.randomBytes(24).toString("base64url"),st=seal({state,exp:Date.now()+600000});
        const q=new URLSearchParams({response_type:"code",client_id:CLIENT_ID,redirect_uri:redirectUri(req),scope:SCOPES,state});
        return redirect(AUTHORIZE_URL+"?"+q.toString(),{"set-cookie":cookie(STATE_COOKIE,st,600)});
      }
      if(u.pathname==="/api/oauth/callback"){
        const st=unseal(cookies(req)[STATE_COOKIE]||""),code=u.searchParams.get("code"),state=u.searchParams.get("state");
        if(!code||!st||st.state!==state||st.exp<Date.now())return redirect("/?oauth=state_error");
        const tok=await tokenCall({grant_type:"authorization_code",code,redirect_uri:redirectUri(req)});
        const s={access_token:tok.access_token,refresh_token:tok.refresh_token,token_type:tok.token_type||"Bearer",scope:tok.scope||SCOPES,expires_at:Date.now()+Number(tok.expires_in||3600)*1000};
        const h=new Headers({location:"/?oauth=connected","cache-control":"no-store"});h.append("set-cookie",cookie(COOKIE,seal(s),60*60*24*30));h.append("set-cookie",cookie(STATE_COOKIE,"",0));
        return new Response(null,{status:302,headers:h});
      }
      if(u.pathname==="/api/oauth/logout"&&req.method==="POST")return json({ok:true},200,{"set-cookie":cookie(COOKIE,"",0)});
      if(u.pathname==="/api/live/connect"&&req.method==="POST"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        return json({ok:true,state:"ready"},200,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/live/disconnect"&&req.method==="POST")return json({ok:true});
      if(u.pathname==="/api/events"&&req.method==="GET"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        const r=await fetch(EVENTS_URL,{headers:{...authHeaders(session.access_token),accept:"text/event-stream"},signal:req.signal});
        if(!r.ok)return json({error:"Spoon events failed",status:r.status,details:(await r.text()).slice(0,500)},r.status);
        return sseProxy(r,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/live"&&req.method==="GET"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        return json(await apiGet(LIVE_URL,session.access_token),200,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/listeners"&&req.method==="GET"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        return json(await apiGet(LISTENERS_URL,session.access_token),200,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/fans"&&req.method==="GET"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        return json(await apiGet(FANS_URL,session.access_token),200,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/chat"&&req.method==="POST"){
        const {session,setCookie}=await ensureAccess(req);if(!session)return json({error:"not authenticated"},401);
        const b=await readBody(req),message=String(b.message||"").trim();if(!message)return json({error:"message required"},400);
        const r=await fetch(CHAT_URL,{method:"POST",headers:authHeaders(session.access_token,{"content-type":"application/json"}),body:JSON.stringify({[CHAT_FIELD]:message})});
        const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t}};
        if(!r.ok)return json({error:"spoon chat failed",details:d},r.status,setCookie?{"set-cookie":setCookie}:{});
        return json({ok:true,result:d},200,setCookie?{"set-cookie":setCookie}:{});
      }
      if(u.pathname==="/api/debug/config")return json({configured:Boolean(CLIENT_ID&&CLIENT_SECRET&&SESSION_SECRET),authorizeUrl:AUTHORIZE_URL,tokenUrl:TOKEN_URL,eventsUrl:EVENTS_URL,chatUrl:CHAT_URL,scopes:SCOPES.split(/\s+/),chatField:CHAT_FIELD,redirectUri:redirectUri(req)});
      return staticResponse(u.pathname);
    }catch(e){return json({error:String(e?.message||e)},500)}
  }
};
