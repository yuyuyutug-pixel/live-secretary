const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

const PORT=Number(process.env.PORT||3000);
const ROOT=__dirname;
const API_BASE=(process.env.SPOON_API_BASE||"https://jp-openapi.spooncast.net").replace(/\/$/,"");
const AUTHORIZE_URL=process.env.SPOON_AUTHORIZE_URL||"https://spooncast.net/jp/oauth/authorize";
const TOKEN_URL=process.env.SPOON_TOKEN_URL||API_BASE+"/v1/oauth/token";
const REVOKE_URL=process.env.SPOON_REVOKE_URL||API_BASE+"/v1/oauth/revoke";
const EVENTS_URL=process.env.SPOON_EVENTS_URL||API_BASE+"/v1/live/events";
const LIVE_URL=process.env.SPOON_LIVE_URL||API_BASE+"/v1/live";
const LISTENERS_URL=process.env.SPOON_LISTENERS_URL||API_BASE+"/v1/live/listeners";
const FANS_URL=process.env.SPOON_FANS_URL||API_BASE+"/v1/live/fans";
const CHAT_URL=process.env.SPOON_CHAT_URL||API_BASE+"/v1/live/chat";
const CLIENT_ID=process.env.SPOON_CLIENT_ID||"";
const CLIENT_SECRET=process.env.SPOON_CLIENT_SECRET||"";
const FIXED_REDIRECT=process.env.SPOON_REDIRECT_URI||"";
const SCOPES=process.env.SPOON_SCOPES||"live.read listeners.read fans.read events.chat events.presence events.like events.donation chat.send";
const CHAT_FIELD=process.env.SPOON_CHAT_FIELD||"message";
const TOKEN_AUTH=(process.env.SPOON_TOKEN_AUTH||"basic").toLowerCase();
const SESSION_SECRET=process.env.SESSION_SECRET||"";
const COOKIE="live_secretary_session";
const STATE_COOKIE="live_secretary_oauth_state";
const key=crypto.createHash("sha256").update(SESSION_SECRET||"dev-only-change-me").digest();
const streams=new Map();

function json(res,status,data,headers={}){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers});
  res.end(JSON.stringify(data));
}
function redirect(res,url,headers={}){res.writeHead(302,{location:url,"cache-control":"no-store",...headers});res.end()}
function parseCookies(req){
  const out={};
  for(const part of String(req.headers.cookie||"").split(";")){
    const i=part.indexOf("="); if(i<0)continue;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function cookie(name,value,maxAge=2592000){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function seal(obj){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const ct=Buffer.concat([cipher.update(JSON.stringify(obj),"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,ct]).toString("base64url");
}
function unseal(value){
  try{
    const raw=Buffer.from(value,"base64url");
    const iv=raw.subarray(0,12),tag=raw.subarray(12,28),ct=raw.subarray(28);
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ct),decipher.final()]).toString("utf8"));
  }catch{return null}
}
function origin(req){
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
  return `${proto}://${req.headers.host}`;
}
function redirectUri(req){return FIXED_REDIRECT||origin(req)+"/api/oauth/callback"}
async function body(req){
  const chunks=[]; for await(const c of req)chunks.push(c);
  const raw=Buffer.concat(chunks).toString("utf8");
  if(!raw)return{};
  try{return JSON.parse(raw)}catch{return Object.fromEntries(new URLSearchParams(raw))}
}
async function tokenCall(params,authMode=TOKEN_AUTH){
  const form=new URLSearchParams(params);
  const headers={"content-type":"application/x-www-form-urlencoded","accept":"application/json"};
  if(authMode==="basic"){
    headers.authorization="Basic "+Buffer.from(CLIENT_ID+":"+CLIENT_SECRET).toString("base64");
  }else{
    form.set("client_id",CLIENT_ID);form.set("client_secret",CLIENT_SECRET);
  }
  let r=await fetch(TOKEN_URL,{method:"POST",headers,body:form});
  if(!r.ok && authMode==="basic"){
    const fallback=new URLSearchParams(params);
    fallback.set("client_id",CLIENT_ID);fallback.set("client_secret",CLIENT_SECRET);
    r=await fetch(TOKEN_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:fallback});
  }
  const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok)throw new Error(`token endpoint ${r.status}: ${text.slice(0,500)}`);
  return data;
}
function sessionFrom(req){const v=parseCookies(req)[COOKIE];return v?unseal(v):null}
function saveSession(res,s){
  res.setHeader("set-cookie",cookie(COOKIE,seal(s),60*60*24*30));
}
async function ensureAccess(req,res){
  let s=sessionFrom(req); if(!s?.access_token)return null;
  if((s.expires_at||0)>Date.now()+60_000)return s;
  if(!s.refresh_token)return null;
  const fresh=await tokenCall({grant_type:"refresh_token",refresh_token:s.refresh_token});
  s={...s,...fresh,refresh_token:fresh.refresh_token||s.refresh_token,expires_at:Date.now()+Number(fresh.expires_in||3600)*1000};
  saveSession(res,s); return s;
}
function authHeaders(token,extra={}){return{authorization:"Bearer "+token,accept:"application/json",...extra}}
async function apiGet(url,token){
  const r=await fetch(url,{headers:authHeaders(token)});
  const t=await r.text(); let d;try{d=JSON.parse(t)}catch{d={raw:t}};
  if(!r.ok)throw new Error(`${r.status}: ${t.slice(0,500)}`);
  return d;
}
function broadcast(sid,event,data){
  const st=streams.get(sid); if(!st)return;
  const payload=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for(const client of st.clients){try{client.write(payload)}catch{}}
}
function inferEvent(name,data){
  return String(name||data?.event||data?.type||data?.name||"message").toLowerCase();
}
async function startUpstream(sid,token){
  let st=streams.get(sid);
  if(st?.controller)return;
  if(!st){st={clients:new Set(),controller:null};streams.set(sid,st)}
  const controller=new AbortController(); st.controller=controller;
  broadcast(sid,"live_state",{state:"connecting"});
  try{
    const r=await fetch(EVENTS_URL,{headers:{...authHeaders(token),accept:"text/event-stream"},signal:controller.signal});
    if(!r.ok)throw new Error(`events ${r.status}: ${(await r.text()).slice(0,500)}`);
    broadcast(sid,"live_state",{state:"connected"});
    const reader=r.body.getReader(),dec=new TextDecoder();
    let buf="",eventName="";
    while(true){
      const {done,value}=await reader.read(); if(done)break;
      buf+=dec.decode(value,{stream:true});
      let idx;
      while((idx=buf.indexOf("\n\n"))>=0){
        const block=buf.slice(0,idx).replace(/\r/g,"");buf=buf.slice(idx+2);
        if(!block.trim()||block.startsWith(":"))continue;
        let ev=eventName,dataLines=[];eventName="";
        for(const line of block.split("\n")){
          if(line.startsWith("event:"))ev=line.slice(6).trim();
          else if(line.startsWith("data:"))dataLines.push(line.slice(5).trimStart());
        }
        const raw=dataLines.join("\n"); if(!raw)continue;
        let data;try{data=JSON.parse(raw)}catch{data={raw}};
        const kind=inferEvent(ev,data);
        broadcast(sid,kind,data);
        if(kind==="end")broadcast(sid,"live_state",{state:"ended"});
      }
    }
    broadcast(sid,"live_state",{state:"disconnected"});
  }catch(e){
    if(e.name!=="AbortError")broadcast(sid,"error",{message:String(e.message||e)});
  }finally{
    const cur=streams.get(sid);if(cur)cur.controller=null;
  }
}
function stopUpstream(sid){
  const st=streams.get(sid); if(st?.controller)st.controller.abort(); if(st)st.controller=null;
}
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
function serveStatic(req,res){
  let p=new URL(req.url,"http://x").pathname;
  if(p==="/")p="/index.html";
  const safe=path.normalize(p).replace(/^(\.\.(\/|\\|$))+/,"");
  const file=path.join(ROOT,safe);
  if(!file.startsWith(ROOT)||["server.js","package.json"].includes(path.basename(file)))return json(res,404,{error:"not found"});
  fs.stat(file,(err,st)=>{
    if(err||!st.isFile())return json(res,404,{error:"not found"});
    res.writeHead(200,{"content-type":MIME[path.extname(file)]||"application/octet-stream","cache-control":path.extname(file)===".html"?"no-cache":"public, max-age=300"});
    fs.createReadStream(file).pipe(res);
  });
}

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,"http://local");
  try{
    if(u.pathname==="/health")return json(res,200,{ok:true,service:"live-secretary",version:"0.2.0"});
    if(u.pathname==="/api/status"){
      const s=sessionFrom(req);
      return json(res,200,{configured:Boolean(CLIENT_ID&&CLIENT_SECRET&&SESSION_SECRET),authenticated:Boolean(s?.access_token),liveConnected:Boolean(s?.sid&&streams.get(s.sid)?.controller),apiBase:API_BASE,scopes:SCOPES.split(/\s+/),capabilities:{comments:true,presence:true,likes:true,donations:true,listeners:true,fans:true,sendMessage:true}});
    }
    if(u.pathname==="/api/oauth/start"){
      if(!CLIENT_ID||!CLIENT_SECRET||!SESSION_SECRET)return json(res,503,{error:"Spoon OAuth is not configured"});
      const state=crypto.randomBytes(24).toString("base64url");
      const stateToken=seal({state,exp:Date.now()+10*60*1000});
      const q=new URLSearchParams({response_type:"code",client_id:CLIENT_ID,redirect_uri:redirectUri(req),scope:SCOPES,state});
      return redirect(res,AUTHORIZE_URL+"?"+q.toString(),{"set-cookie":cookie(STATE_COOKIE,stateToken,600)});
    }
    if(u.pathname==="/api/oauth/callback"){
      const stateCookie=unseal(parseCookies(req)[STATE_COOKIE]||"");
      const code=u.searchParams.get("code"),state=u.searchParams.get("state");
      if(!code||!stateCookie||stateCookie.state!==state||stateCookie.exp<Date.now())return redirect(res,"/?oauth=state_error");
      const tok=await tokenCall({grant_type:"authorization_code",code,redirect_uri:redirectUri(req)});
      const s={sid:crypto.randomBytes(16).toString("hex"),access_token:tok.access_token,refresh_token:tok.refresh_token,token_type:tok.token_type||"Bearer",scope:tok.scope||SCOPES,expires_at:Date.now()+Number(tok.expires_in||3600)*1000};
      res.setHeader("set-cookie",[cookie(COOKIE,seal(s),60*60*24*30),cookie(STATE_COOKIE,"",0)]);
      return redirect(res,"/?oauth=connected");
    }
    if(u.pathname==="/api/oauth/logout"&&req.method==="POST"){
      const s=sessionFrom(req); if(s?.sid)stopUpstream(s.sid);
      res.setHeader("set-cookie",cookie(COOKIE,"",0));return json(res,200,{ok:true});
    }
    if(u.pathname==="/api/live"&&req.method==="GET"){
      const s=await ensureAccess(req,res);if(!s)return json(res,401,{error:"not authenticated"});
      return json(res,200,await apiGet(LIVE_URL,s.access_token));
    }
    if(u.pathname==="/api/listeners"&&req.method==="GET"){
      const s=await ensureAccess(req,res);if(!s)return json(res,401,{error:"not authenticated"});
      return json(res,200,await apiGet(LISTENERS_URL,s.access_token));
    }
    if(u.pathname==="/api/fans"&&req.method==="GET"){
      const s=await ensureAccess(req,res);if(!s)return json(res,401,{error:"not authenticated"});
      return json(res,200,await apiGet(FANS_URL,s.access_token));
    }
    if(u.pathname==="/api/live/connect"&&req.method==="POST"){
      const s=await ensureAccess(req,res);if(!s)return json(res,401,{error:"not authenticated"});
      if(!streams.has(s.sid))streams.set(s.sid,{clients:new Set(),controller:null});
      startUpstream(s.sid,s.access_token);
      return json(res,202,{ok:true,state:"connecting"});
    }
    if(u.pathname==="/api/live/disconnect"&&req.method==="POST"){
      const s=sessionFrom(req);if(s?.sid)stopUpstream(s.sid);return json(res,200,{ok:true});
    }
    if(u.pathname==="/api/events"&&req.method==="GET"){
      const s=sessionFrom(req);if(!s?.sid)return json(res,401,{error:"not authenticated"});
      if(!streams.has(s.sid))streams.set(s.sid,{clients:new Set(),controller:null});
      const st=streams.get(s.sid);
      res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache, no-transform","connection":"keep-alive","x-accel-buffering":"no"});
      res.write(`event: gateway\ndata: ${JSON.stringify({state:"connected"})}\n\n`);
      st.clients.add(res);
      const ping=setInterval(()=>{try{res.write(": ping\n\n")}catch{}},20000);
      req.on("close",()=>{clearInterval(ping);st.clients.delete(res)});
      return;
    }
    if(u.pathname==="/api/chat"&&req.method==="POST"){
      const s=await ensureAccess(req,res);if(!s)return json(res,401,{error:"not authenticated"});
      const b=await body(req);const message=String(b.message||"").trim();if(!message)return json(res,400,{error:"message required"});
      const payload={[CHAT_FIELD]:message};
      const r=await fetch(CHAT_URL,{method:"POST",headers:authHeaders(s.access_token,{"content-type":"application/json"}),body:JSON.stringify(payload)});
      const t=await r.text();let d;try{d=JSON.parse(t)}catch{d={raw:t}};
      if(!r.ok)return json(res,r.status,{error:"spoon chat failed",details:d});
      return json(res,200,{ok:true,result:d});
    }
    if(u.pathname==="/api/debug/config"){
      return json(res,200,{configured:Boolean(CLIENT_ID&&CLIENT_SECRET&&SESSION_SECRET),authorizeUrl:AUTHORIZE_URL,tokenUrl:TOKEN_URL,eventsUrl:EVENTS_URL,liveUrl:LIVE_URL,chatUrl:CHAT_URL,scopes:SCOPES.split(/\s+/),chatField:CHAT_FIELD,redirectUri:redirectUri(req)});
    }
    return serveStatic(req,res);
  }catch(e){return json(res,500,{error:String(e.message||e)})}
});
server.listen(PORT,"0.0.0.0",()=>console.log(`LIVE秘書 gateway listening on :${PORT}`));
