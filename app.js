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
function itemCategory(x){return Array.isArray(x)?x[0]:(x?.category||"その他")}
function itemText(x,k="topic"){
  if(Array.isArray(x))return x[1];
  if(k==="psych"&&x?.q)return x.q+" "+(x.options||[]).map((o,i)=>String(i+1)+" "+o).join(" / ");
  return x?.text||x?.q||String(x||"");
}
function makeItem(x,kind){return{kind,category:itemCategory(x),text:itemText(x,kind),raw:x}}
function items(k){return(D[k]||[]).map(x=>makeItem(x,k))}
function arr(k){return items(k).map(x=>x.text)}
function randomItem(k){const a=items(k);return a.length?a[Math.floor(Math.random()*a.length)]:null}
function trackItem(item){if(!item?.text)return;Store.trackUse?.(item);renderDiscovery?.()}
function formatTime(sec){let m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function voice(t){return state.persona==="関西ツッコミ"?t+" ほな、数字だけでも答えてみよか。":state.persona==="毒舌"?t+" 静かすぎるので秘書が仕事します。":state.persona==="ふわふわ"?t+" 気軽に答えてね。":state.persona==="執事"?"皆様、"+t:t}
function add(t,type="bot"){let d=document.createElement("div");d.className="message "+type;d.innerHTML="<span>"+(type==="bot"?"":type==="event"?"◆":"●")+"</span><p></p>";d.querySelector("p").textContent=t;$("#feed").append(d);$("#feed").scrollTop=99999}
function bot(t,item=null){
  if(!t)return;if(item)trackItem(item);const spoken=voice(t);add(spoken);state.interventions++;state.lastBot=true;$("#stateText").textContent="会話のきっかけを提案しました";update();
  if(remote&&state.running)provider.sendMessage(spoken).catch(e=>toast("Bot送信失敗: "+e.message));
}
function features(){let o={};$$("[data-feature]").forEach(x=>o[x.dataset.feature]=x.checked);return o}
function intervene(force=false){
  let lv=["low","normal","high"][$("#range").value],e=new ConversationEngine({level:lv,mode:state.mode});e.lastInterventionAt=state._last;
  if(force){let pref={"わちゃわちゃ":"games","恋バナ":"psych","深夜":"topics","初見歓迎":"choices"}[state.mode]||"topics";let it=randomItem(pref);if(it)bot(it.text,it);$("#stateText").textContent="手動で次の一手を提案しました";return}
  let r=e.decide({silence:state.silence,active:false,features:features()});
  if(r.action!=="wait"){state._last=state.silence;let map={choice:"choices",topic:"topics",psych:"psych",game:"games"},it=randomItem(map[r.action]||"topics");if(it)bot(it.text,it)}
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
$("#start").onclick=()=>start();$("#useRecommend").onclick=()=>{const it={kind:"topics",category:"初見",text:"最近ちょっと嬉しかったこと"};trackItem(it);start(it.text)};
$("#skip").onclick=()=>{state.silence+=30;state.maxSilence=Math.max(state.maxSilence,state.silence);intervene();update()};
$("#newcomer").onclick=()=>{if(remote){toast("本番ではSpoonの入室イベントを自動受信します");return}state.viewers++;if(features().new)bot("初見さんいらっしゃい！ 今の気分は ①元気 ②普通 ③お疲れ？ 数字だけでもどうぞ。");update()};
$("#psychNow").onclick=()=>{const it=randomItem("psych");if(it)bot(it.text,it)};$("#gameNow").onclick=()=>{const it=randomItem("games");if(it)bot(it.text,it)};$("#instantAssist").onclick=()=>intervene(true);
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

let libraryMode="すべて",psychIndex=0;
function allLibraryItems(){
  return [["話題","topics"],["二択","choices"],["心理テスト","psych"],["ゲーム","games"]].flatMap(([label,key])=>items(key).map(x=>({...x,label})));
}
function ensureLibraryChips(){
  const wrap=$("#library .chips");if(!wrap)return;
  const cats=["すべて","お気に入り","最近",...(D.categories||[])];
  wrap.innerHTML="";
  cats.forEach(cat=>{const b=document.createElement("button");b.textContent=cat;b.classList.toggle("active",cat===libraryMode);b.onclick=()=>{libraryMode=cat;ensureLibraryChips();renderLib($("#search")?.value||"")};wrap.append(b)});
}
function renderLib(search=""){
  const list=$("#libraryList");if(!list)return;list.innerHTML="";
  let data=allLibraryItems();
  if(libraryMode==="お気に入り")data=Store.favorites?.()||[];
  else if(libraryMode==="最近")data=Store.recent?.()||[];
  else if(libraryMode!=="すべて")data=data.filter(x=>x.category===libraryMode);
  const q=search.trim().toLowerCase();
  if(q)data=data.filter(x=>(x.text+" "+x.category+" "+(x.label||x.kind||"")).toLowerCase().includes(q));
  if(!data.length){list.innerHTML='<div class="lib-empty">まだ該当するカードがありません。</div>';return}
  data.slice(0,250).forEach(item=>{
    const row=document.createElement("div");row.className="libitem";
    const main=document.createElement("button");main.className="lib-main";
    main.innerHTML="<small></small><p></p>";main.querySelector("small").textContent=(item.label||({"topics":"話題","choices":"二択","psych":"心理テスト","games":"ゲーム"}[item.kind]||"カード"))+" · "+item.category;main.querySelector("p").textContent=item.text;
    main.onclick=()=>{trackItem(item);start(item.text)};
    const fav=document.createElement("button");fav.className="fav-btn";fav.textContent=Store.isFavorite?.(item)?"★":"☆";fav.setAttribute("aria-label","お気に入り");
    fav.onclick=e=>{e.stopPropagation();const on=Store.toggleFavorite?.(item);fav.textContent=on?"★":"☆";toast(on?"お気に入りに追加":"お気に入りから削除");renderDiscovery()};
    row.append(main,fav);list.append(row);
  });
}
function renderDiscovery(){
  let board=$("#usageRank");
  if(!board){board=document.createElement("section");board.id="usageRank";board.className="usage-board";const rec=$(".recommend");rec?.after(board)}
  const ranks=Store.usageRanking?.(5)||[],recent=Store.recent?.().slice(0,3)||[];
  board.innerHTML='<div class="section-head compact"><div><small>MY TRENDS</small><h2>よく使うカテゴリ</h2></div><button data-open-library>一覧</button></div>'+
    (ranks.length?'<div class="rank-list">'+ranks.map(r=>'<div><b>'+r.rank+'</b><span>'+r.category+'</span><em>'+r.count+'回</em></div>').join("")+'</div>':'<div class="rank-empty">カードを使うと、ここにあなたの利用ランキングが育ちます。</div>')+
    '<div class="mini-head"><b>最近使った</b></div>'+
    (recent.length?'<div class="recent-mini">'+recent.map(x=>'<button data-recent-id="'+x.id+'"><span>'+x.category+'</span>'+x.text+'</button>').join("")+'</div>':'<div class="rank-empty small">まだ履歴はありません。</div>');
  board.querySelector("[data-open-library]")?.addEventListener("click",()=>go("library"));
  board.querySelectorAll("[data-recent-id]").forEach(b=>b.onclick=()=>{const it=recent.find(x=>x.id===b.dataset.recentId);if(it){trackItem(it);start(it.text)}});
}
function psychPrompt(t){return t.q+" "+(t.options||[]).map((o,i)=>String(i+1)+" "+o).join(" / ")}
function renderPsych(){
  const card=$(".testcard");if(!card||!D.psych?.length)return;
  const t=D.psych[psychIndex%D.psych.length];
  card.innerHTML='<span class="testno">PSYCHOLOGY · '+t.category+'</span><h2 id="psychQ"></h2><div id="psychOptions"></div><div id="psychResult" class="psych-result"></div><div class="psych-actions"><button id="psychUse">配信で使う</button><button id="psychNext">次のテスト</button></div><small>※娯楽用コンテンツです。心理学的診断ではありません。</small>';
  $("#psychQ").textContent=t.q;
  const ops=$("#psychOptions");
  (t.options||[]).forEach((o,i)=>{const b=document.createElement("button");b.textContent=String(i+1)+" "+o;b.onclick=()=>{$("#psychResult").textContent=(t.results||[])[i]||"";trackItem({kind:"psych",category:t.category,text:psychPrompt(t)})};ops.append(b)});
  $("#psychUse").onclick=()=>{const it={kind:"psych",category:t.category,text:psychPrompt(t)};trackItem(it);start(it.text)};
  $("#psychNext").onclick=()=>{psychIndex=(psychIndex+1)%D.psych.length;renderPsych()};
}
ensureLibraryChips();renderLib();$("#search").oninput=e=>renderLib(e.target.value);renderPsych();
$(".play").forEach(b=>b.onclick=()=>{const it=randomItem("games");if(it){trackItem(it);start(it.text)}});renderDiscovery();
setMode(state.mode,true);update();initGateway();
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
