const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const D=window.LIVE_CONTENT||{},pick=a=>a?.length?a[Math.floor(Math.random()*a.length)]:"";
let saved=Store.load();
let state={running:false,silence:0,comments:0,viewers:0,interventions:0,responded:0,lastBot:false,persona:saved.persona||"しっかり秘書",mode:saved.mode||"雑談",maxSilence:0,duration:0,startedAt:0,_last:-999};
let sessionTimer=null,provider=new MockLiveProvider(),remote=false,providerWired=false,apiStatus={configured:false,authenticated:false};

function toast(t){let x=$("#toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2200)}
function go(id){$$(".page").forEach(x=>x.classList.remove("active"));$("#"+id)?.classList.add("active");$$("nav button").forEach(x=>x.classList.toggle("active",x.dataset.go===id));scrollTo({top:0,behavior:"smooth"})}
$$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));$$(".back").forEach(b=>b.onclick=()=>go("home"));

function setConnection(label,live=false){
  const c=$(".connection span");if(c)c.textContent=label;
  const p=$(".live-pill");if(p){p.innerHTML='<i></i> '+label;p.classList.toggle("is-live",live)}
  const s=$(".statusline span");if(s)s.textContent=live?"Spoon LIVEと接続中":apiStatus.authenticated?"Spoon連携済み・配信開始待ち":apiStatus.configured?"Spoon連携が必要です":"Spoon API設定前";
}
function ensureConnectButton(){
  if($("#spoonConnect"))return;
  const b=document.createElement("button");b.id="spoonConnect";b.className="primary";b.style.marginTop="12px";
  const anchor=$(".statusline");anchor?.after(b);
  b.onclick=async()=>{
    if(!apiStatus.configured){toast("Spoon APIのClient ID / Secret設定が必要です");return}
    if(!apiStatus.authenticated){location.href="/api/oauth/start";return}
    toast("Spoon連携済みです。配信アシストを開始してください");
  };
}
function refreshConnectButton(){
  ensureConnectButton();const b=$("#spoonConnect");if(!b)return;
  b.textContent=!apiStatus.configured?"Spoon API設定待ち":apiStatus.authenticated?"✓ Spoon連携済み":"Spoonと連携";
  b.disabled=!apiStatus.configured;
}
async function initGateway(){
  try{
    const r=await fetch("/api/status",{cache:"no-store"});if(!r.ok)throw 0;
    apiStatus=await r.json();
    if(apiStatus.authenticated){provider=new SpoonLiveProvider();remote=true;setConnection("READY",false)}
    else{provider=new MockLiveProvider();remote=false;setConnection(apiStatus.configured?"CONNECT":"DEMO",false)}
    wireProvider();refreshConnectButton();
    const q=new URLSearchParams(location.search);
    if(q.get("oauth")==="connected"){toast("Spoon連携が完了しました");history.replaceState({},"",location.pathname)}
    if(q.get("oauth")==="state_error"){toast("Spoon連携に失敗しました。もう一度お試しください");history.replaceState({},"",location.pathname)}
  }catch{provider=new MockLiveProvider();remote=false;setConnection("DEMO",false);refreshConnectButton()}
}
function payloadText(p){return p?.message||p?.text||p?.content||p?.chat?.message||p?.data?.message||p?.data?.text||""}
function payloadName(p){return p?.nickname||p?.name||p?.user?.nickname||p?.user?.name||p?.data?.nickname||"リスナー"}
function wireProvider(){
  if(providerWired)return;providerWired=true;
  provider.onComment(p=>{
    if(!state.running)return;
    const text=payloadText(p)||"（コメント）";state.comments++;state.silence=0;
    if(state.lastBot){state.responded++;state.lastBot=false}
    add(payloadName(p)+"："+text,"user");$("#stateText").textContent="コメントが動いたので待機します";update();
  });
  provider.onJoin(p=>{
    if(!state.running)return;state.viewers++;add(payloadName(p)+" さんが入室","event");
    if(features().new)bot("初見さんいらっしゃい！ 今の気分は ①元気 ②普通 ③お疲れ？ 数字だけでもどうぞ。");update();
  });
  provider.onLeave(()=>{if(state.running)state.viewers=Math.max(0,state.viewers-1);update()});
  provider.onGift(p=>{if(state.running){add("🎁 "+payloadName(p)+" さんから応援が届きました","event");$("#stateText").textContent="応援イベントを受信しました";update()}});
  provider.onLike(()=>{if(state.running)$("#stateText").textContent="いいねを受信しました"});
  provider.onLiveState(p=>{
    const s=String(p?.state||"");
    if(s==="connected"){setConnection("LIVE",true);$("#stateText").textContent="Spoon LIVEを見守っています"}
    else if(s==="connecting")setConnection("CONNECTING",false);
    else if(s==="ended"&&state.running)endCurrentLive(true);
    else if(s==="gateway_error")toast("Spoon接続で通信エラーが発生しました");
  });
}

function setMode(m,q=false){state.mode=m||"雑談";$$("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===state.mode));$("#settingsModeLabel")&&($("#settingsModeLabel").textContent=state.mode);$("#liveMode")&&($("#liveMode").textContent=state.mode);Store.save({mode:state.mode});if(!q)toast(state.mode+"モードに変更")}
$$("[data-mode]").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function arr(k){return(D[k]||[]).map(x=>Array.isArray(x)?x[1]:x)}
function formatTime(sec){let m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function voice(t){return state.persona==="関西ツッコミ"?t+" ほな、数字だけでも答えてみよか。":state.persona==="毒舌"?t+" 静かすぎるので秘書が仕事します。":state.persona==="ふわふわ"?t+" 気軽に答えてね。":state.persona==="執事"?"皆様、"+t:t}
function add(t,type="bot"){let d=document.createElement("div");d.className="message "+type;d.innerHTML="<span>"+(type==="bot"?"":type==="event"?"◆":"●")+"</span><p></p>";d.querySelector("p").textContent=t;$("#feed").append(d);$("#feed").scrollTop=99999}
function bot(t){
  if(!t)return;const spoken=voice(t);add(spoken);state.interventions++;state.lastBot=true;$("#stateText").textContent="会話のきっかけを提案しました";update();
  if(remote&&state.running)provider.sendMessage(spoken).catch(e=>toast("Bot送信失敗: "+e.message));
}
function features(){let o={};$$("[data-feature]").forEach(x=>o[x.dataset.feature]=x.checked);return o}
function intervene(force=false){
  let lv=["low","normal","high"][$("#range").value],e=new ConversationEngine({level:lv,mode:state.mode});e.lastInterventionAt=state._last;
  if(force){let pref={"わちゃわちゃ":"games","恋バナ":"psych","深夜":"topics","初見歓迎":"choices"}[state.mode]||"topics";bot(pick(arr(pref)));$("#stateText").textContent="手動で次の一手を提案しました";return}
  let r=e.decide({silence:state.silence,active:false,features:features()});
  if(r.action!=="wait"){state._last=state.silence;let map={choice:"choices",topic:"topics",psych:"psych",game:"games"};bot(pick(arr(map[r.action]||"topics")))}
  else $("#stateText").textContent=r.reason||"まだ介入せず見守っています";
}
function update(){
  const rr=state.interventions?Math.round(state.responded/state.interventions*100):0;
  $("#viewers")&&($("#viewers").textContent=state.viewers);$("#comments")&&($("#comments").textContent=state.comments);$("#silence")&&($("#silence").textContent=state.silence);$("#liveMode")&&($("#liveMode").textContent=state.mode);$("#livePersona")&&($("#livePersona").textContent=state.persona);$("#liveElapsed")&&($("#liveElapsed").textContent=formatTime(state.duration));
  $("#aMode")&&($("#aMode").textContent=state.mode);$("#aMaxSilence")&&($("#aMaxSilence").textContent=state.maxSilence+"s");$("#aDuration")&&($("#aDuration").textContent=formatTime(state.duration));$("#aViewers")&&($("#aViewers").textContent=state.viewers);$("#aComments")&&($("#aComments").textContent=state.comments);$("#aInterventions")&&($("#aInterventions").textContent=state.interventions);$("#responseRate")&&($("#responseRate").textContent=rr+"%");
  if($("#insightText"))$("#insightText").textContent=state.comments===0?"コメントが入ると反応率を計測します。":rr>=50?"秘書の介入後に会話が戻る傾向があります。":state.interventions?"介入頻度を少し下げると自然な会話を保ちやすそうです。":"会話が動いているので秘書は控えめで良さそうです。";
  $("#contentCount")&&($("#contentCount").textContent=(arr("topics").length+arr("choices").length+arr("psych").length+arr("games").length)+" CARDS");
}
async function start(topic){
  if(remote){
    try{await provider.connect()}catch(e){toast(e.message||"Spoon LIVEに接続できません");return}
  }else await provider.connect().catch(()=>{});
  state.running=true;state.silence=0;state.maxSilence=0;state.duration=0;state.comments=0;state.interventions=0;state.responded=0;state.lastBot=false;state.startedAt=Date.now();state.viewers=remote?0:6;
  clearInterval(sessionTimer);sessionTimer=setInterval(()=>{if(!state.running)return;state.silence++;state.duration=Math.floor((Date.now()-state.startedAt)/1000);state.maxSilence=Math.max(state.maxSilence,state.silence);if(state.silence%30===0)intervene();update()},1000);
  $("#feed").innerHTML="";add(remote?"Spoon LIVE接続を開始しました。イベントを待っています。":"準備OK。デモモードで会話を見守ります。");
  let t=topic||$("#topic").value.trim();if(t)add("今日のテーマ「"+t+"」を覚えました。");
  $("#stateText").textContent=remote?"Spoon LIVEを接続しています":"会話を見守っています";go("live");update();
}
$("#start").onclick=()=>start();$("#useRecommend").onclick=()=>start("最近ちょっと嬉しかったこと");
$("#skip").onclick=()=>{state.silence+=30;state.maxSilence=Math.max(state.maxSilence,state.silence);intervene();update()};
$("#newcomer").onclick=()=>{if(remote){toast("本番ではSpoonの入室イベントを自動受信します");return}state.viewers++;if(features().new)bot("初見さんいらっしゃい！ 今の気分は ①元気 ②普通 ③お疲れ？ 数字だけでもどうぞ。");update()};
$("#psychNow").onclick=()=>bot(pick(arr("psych")));$("#gameNow").onclick=()=>bot(pick(arr("games")));$("#instantAssist").onclick=()=>intervene(true);
async function endCurrentLive(fromSpoon=false){
  state.running=false;clearInterval(sessionTimer);if(remote&&!fromSpoon)await provider.disconnect().catch(()=>{});
  let rr=state.interventions?Math.round(state.responded/state.interventions*100):0;Store.addSession&&Store.addSession({at:new Date().toISOString(),mode:state.mode,persona:state.persona,duration:state.duration,viewers:state.viewers,comments:state.comments,interventions:state.interventions,responseRate:rr,maxSilence:state.maxSilence});
  update();go("analysis");setConnection(apiStatus.authenticated?"READY":"DEMO",false);toast(fromSpoon?"Spoon LIVE終了を検知しました":"配信データを保存しました");
}
$("#endLive").onclick=()=>endCurrentLive(false);

async function send(){
  let v=$("#manual").value.trim();if(!v)return;
  if(remote){
    try{await provider.sendMessage(v);add("BOT："+v,"bot");$("#manual").value="";$("#stateText").textContent="Botメッセージを送信しました"}catch(e){toast(e.message||"送信に失敗しました")}
    return;
  }
  state.comments++;state.silence=0;if(state.lastBot){state.responded++;state.lastBot=false}add(v,"user");$("#manual").value="";$("#stateText").textContent="コメントが動いたので待機します";update();
}
$("#send").onclick=send;$("#manual").addEventListener("keydown",e=>e.key==="Enter"&&send());

$$(".personas button").forEach(b=>b.onclick=()=>{$$(".personas button").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");state.persona=b.dataset.p;$("#livePersona")&&($("#livePersona").textContent=state.persona);Store.save({persona:state.persona});toast(state.persona+"に変更")});
[...$$(".personas button")].find(x=>x.dataset.p===state.persona)?.classList.add("selected");
$("#range").oninput=e=>$("#levelLabel").textContent=["控えめ","普通","積極的"][e.target.value];
$("#saveSettings").onclick=()=>{Store.save({persona:state.persona,mode:state.mode,level:$("#range").value,topic:$("#topic").value,features:features()});toast("設定を保存しました")};
if(saved.level)$("#range").value=saved.level;if(saved.topic)$("#topic").value=saved.topic;if(saved.features)$$("[data-feature]").forEach(x=>x.checked=saved.features[x.dataset.feature]??x.checked);$("#levelLabel").textContent=["控えめ","普通","積極的"][$("#range").value];

function renderLib(filter=""){let list=$("#libraryList");list.innerHTML="";[["話題",D.topics],["二択",D.choices],["心理テスト",D.psych],["ゲーム",D.games]].forEach(([cat,a])=>(a||[]).forEach(x=>{let text=Array.isArray(x)?x[1]:x,tag=Array.isArray(x)?x[0]:"";if(filter&&!text.includes(filter)&&!tag.includes(filter))return;let b=document.createElement("button");b.className="libitem";b.innerHTML="<div><small>"+cat+" · "+tag+"</small><p></p></div>";b.querySelector("p").textContent=text;b.onclick=()=>start(text);list.append(b)}))}
renderLib();$("#search").oninput=e=>renderLib(e.target.value);$$(".chips button").forEach(b=>b.onclick=()=>{$$(".chips button").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderLib(b.textContent==="すべて"?"":b.textContent)});
$$(".testcard button").forEach(b=>b.onclick=()=>{bot($("#psychQ").textContent+" "+b.textContent);go("live")});$$(".play").forEach(b=>b.onclick=()=>{bot(pick(arr("games")));go("live")});
setMode(state.mode,true);update();initGateway();
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
