const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const D=window.LIVE_CONTENT||{};
const saved=Store.load();

let provider=new MockLiveProvider();
let remote=false, providerWired=false, sessionTimer=null, demoSeq=0;
let contentType="recommended", contentCategory="すべて";

const state={
  running:false,
  mode:saved.mode||"雑談",
  persona:saved.persona||"しっかり秘書",
  level:Number(saved.level??1),
  silence:0,
  maxSilence:0,
  duration:0,
  comments:0,
  viewers:0,
  interventions:0,
  responded:0,
  lastBot:false,
  startedAt:0,
  cue:null,
  activeInteractive:null,
  lastSuggestionAt:-999
};

function toast(t){
  const el=$("#toast"); if(!el)return;
  el.textContent=t; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}

function go(id){
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===id));
  $$("nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===id));
  if(id==="content")renderContent();
  if(id==="history")renderHistory();
  if(id==="home")renderHome();
  scrollTo({top:0,behavior:"smooth"});
}
$$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));

function features(){
  const o={};
  $$("[data-feature]").forEach(x=>o[x.dataset.feature]=x.checked);
  return o;
}

function saveSettings(){
  Store.save({
    mode:state.mode,
    persona:state.persona,
    level:Number($("#range")?.value??state.level),
    topic:$("#topic")?.value||"",
    features:features()
  });
  toast("設定を保存しました");
}

function applySavedSettings(){
  if(saved.topic&&$("#topic"))$("#topic").value=saved.topic;
  if($("#range"))$("#range").value=String(state.level);
  if(saved.features){
    $$("[data-feature]").forEach(x=>{
      if(saved.features[x.dataset.feature]!==undefined)x.checked=!!saved.features[x.dataset.feature];
    });
  }
  renderMode();
  renderPersona();
  updateLevelLabel();
}

function renderMode(){
  $$("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===state.mode));
  if($("#homeModeLabel"))$("#homeModeLabel").textContent=state.mode;
  if($("#settingsModeLabel"))$("#settingsModeLabel").textContent=state.mode;
}
$$("[data-mode]").forEach(b=>b.onclick=()=>{
  state.mode=b.dataset.mode;
  Store.save({mode:state.mode});
  renderMode();
  if(state.running)suggestNext("枠モードを変更しました");
});

function personaName(p){
  return p==="しっかり秘書"?"しっかり":p==="軽め毒舌"?"軽め毒舌":p;
}
function renderPersona(){
  $$("[data-p]").forEach(b=>b.classList.toggle("active",b.dataset.p===state.persona));
  if($("#personaLabel"))$("#personaLabel").textContent=personaName(state.persona);
}
$$("[data-p]").forEach(b=>b.onclick=()=>{
  state.persona=b.dataset.p;
  Store.save({persona:state.persona});
  renderPersona();
});

function updateLevelLabel(){
  const labels=["控えめ","普通","積極的"];
  if($("#levelLabel"))$("#levelLabel").textContent=labels[Number($("#range")?.value??state.level)]||"普通";
}
if($("#range"))$("#range").oninput=updateLevelLabel;
if($("#saveSettings"))$("#saveSettings").onclick=saveSettings;

function itemCategory(x){return Array.isArray(x)?x[0]:(x?.category||"その他")}
function itemText(x,kind){
  if(Array.isArray(x))return x[1];
  if(kind==="psych"&&x?.q)return x.q;
  return x?.text||x?.q||String(x||"");
}
function makeItem(x,kind){
  return {kind,category:itemCategory(x),text:itemText(x,kind),raw:x};
}
function items(kind){return (D[kind]||[]).map(x=>makeItem(x,kind))}
function allItems(){
  return [
    ...items("topics"),
    ...items("choices"),
    ...items("psych"),
    ...items("games")
  ];
}
function itemId(item){return Store.contentId?.(item.kind,item.category,item.text)||item.text}
function randomFresh(kind){
  const list=items(kind); if(!list.length)return null;
  const recent=new Set((Store.recent?.()||[]).slice(0,20).map(x=>x.id));
  const fresh=list.filter(x=>!recent.has(itemId(x)));
  const pool=fresh.length?fresh:list;
  return pool[Math.floor(Math.random()*pool.length)];
}
function track(item){if(item?.text)Store.trackUse?.(item)}

function payloadText(p){return p?.message||p?.text||p?.content||p?.chat?.message||p?.data?.message||p?.data?.text||""}
function payloadName(p){return p?.nickname||p?.name||p?.user?.nickname||p?.user?.name||p?.data?.nickname||"リスナー"}

function voice(text){
  if(state.persona==="関西ツッコミ")return text+" ほな、コメントで教えて〜";
  if(state.persona==="ふわふわ")return text+" 気軽に答えてね。";
  if(state.persona==="毒舌")return text+" さあ、逃げずに答えて。";
  if(state.persona==="執事")return "皆さま、"+text;
  return text;
}

function addFeed(text,type="user"){
  const feed=$("#feed"); if(!feed)return;
  const empty=feed.querySelector(".empty-chat"); if(empty)empty.remove();
  const row=document.createElement("div");
  row.className="feed-row "+type;
  const icon=document.createElement("span");
  const body=document.createElement("p");
  body.textContent=text;
  row.append(icon,body);
  feed.append(row);
  while(feed.children.length>10)feed.removeChild(feed.firstElementChild);
  feed.scrollTop=feed.scrollHeight;
}

async function sendOut(text){
  const message=voice(text);
  state.interventions++;
  state.lastBot=true;
  addFeed("秘書送信："+message,"assistant");
  if(remote){
    try{await provider.sendMessage(message)}
    catch(e){toast("送信失敗："+(e.message||"通信エラー"));return false}
  }
  return true;
}

function setFeedStatus(t){if($("#feedStatus"))$("#feedStatus").textContent=t}

function answerNumber(text){
  const s=String(text||"").trim();
  const map={"①":1,"②":2,"③":3,"④":4,"１":1,"２":2,"３":3,"４":4};
  if(map[s])return map[s];
  if(/^[1-4]$/.test(s))return Number(s);
  return null;
}

function parseTwoChoice(text){
  const s=String(text||"");
  const m=s.match(/^(.*?)①\s*(.*?)②(.*)$/);
  if(!m)return {question:"①か②で答えて",options:["①","②"]};
  return {
    question:(m[3]||"").replace(/^。/,"").trim()||"どっち派？",
    options:[m[1].trim()||"①",m[2].trim()||"②"]
  };
}
function isVoteGame(item){
  return ["多数派","一致ゲーム","究極二択"].includes(item?.category);
}

function psychPrompt(test){
  return test.q+" "+test.options.map((o,i)=>String(i+1)+" "+o).join(" / ");
}

function startInteractive(item){
  if(!item)return;
  let a=null;
  if(item.kind==="psych"){
    const t=item.raw;
    a={type:"psych",item,test:t,question:t.q,options:t.options,votes:[0,0,0,0],answers:{},total:0,revealed:false};
  }else if(item.kind==="choices"){
    const p=parseTwoChoice(item.text);
    a={type:"vote",item,question:p.question,options:p.options,votes:[0,0],answers:{},total:0};
  }else if(item.kind==="games"&&isVoteGame(item)){
    const p=parseTwoChoice(item.text);
    a={type:"vote",item,question:p.question,options:p.options,votes:[0,0],answers:{},total:0};
  }else if(item.kind==="games"){
    a={type:"free",item,question:item.text,answers:[],counts:{},total:0};
  }
  if(!a)return;
  state.activeInteractive=a;
  track(item);
  renderInteractive();
  const prompt=a.type==="psych"?psychPrompt(a.test):
    a.type==="vote"?a.options.map((o,i)=>String(i+1)+" "+o).join(" / ")+"  数字で答えて！":
    a.question;
  sendOut(prompt);
  clearCue("企画を進行中");
}

function handleInteractiveAnswer(text,name){
  const a=state.activeInteractive; if(!a)return false;
  if(a.type==="free"){
    const v=String(text||"").trim(); if(!v)return false;
    a.answers.unshift({name,text:v});
    a.answers=a.answers.slice(0,12);
    a.counts[v]=(a.counts[v]||0)+1;
    a.total++;
    renderInteractive();
    setFeedStatus("企画回答 "+a.total+"件");
    return true;
  }
  const n=answerNumber(text);
  if(!n||n>a.options.length)return false;
  const prev=a.answers[name];
  if(prev===n)return true;
  if(prev)a.votes[prev-1]=Math.max(0,a.votes[prev-1]-1);
  else a.total++;
  a.answers[name]=n;
  a.votes[n-1]++;
  renderInteractive();
  setFeedStatus("企画回答 "+a.total+"件");
  return true;
}

function renderInteractive(){
  const panel=$("#interactivePanel"); if(!panel)return;
  const a=state.activeInteractive;
  if(!a){panel.hidden=true;panel.innerHTML="";return}
  panel.hidden=false;
  let body="";
  if(a.type==="free"){
    const top=Object.entries(a.counts).sort((x,y)=>y[1]-x[1]).slice(0,5);
    body=top.length
      ?'<div class="free-answers">'+top.map(([t,c])=>'<div><span>'+escapeHtml(t)+'</span><b>'+c+'件</b></div>').join("")+'</div>'
      :'<div class="event-empty">回答待ち。自由コメントをそのまま集めます。</div>';
  }else{
    body='<div class="vote-list">'+a.options.map((o,i)=>{
      const count=a.votes[i]||0,pct=a.total?Math.round(count/a.total*100):0;
      return '<div class="vote-item"><div><b>'+(i+1)+'</b><span>'+escapeHtml(o)+'</span><em>'+count+'票 · '+pct+'%</em></div><i><u style="width:'+pct+'%"></u></i></div>';
    }).join("")+'</div>';
    if(a.type==="psych"&&a.revealed){
      body+='<div class="psych-results">'+a.test.results.map((r,i)=>'<div><b>'+(i+1)+'</b><span>'+escapeHtml(r)+'</span></div>').join("")+'</div>';
    }
  }
  const title=a.type==="psych"?"心理テスト":a.type==="free"?"参加ゲーム":"投票";
  panel.innerHTML='<div class="event-head"><div><small>'+title+' · '+escapeHtml(a.item.category)+'</small><b>'+escapeHtml(a.question)+'</b></div><button id="closeEvent">×</button></div>'+
    body+
    '<div class="event-foot"><span>'+a.total+'回答</span>'+
    (a.type==="psych"?'<button id="toggleResults">'+(a.revealed?"結果を閉じる":"結果を見る")+'</button>':"")+
    '<button id="finishEvent">終了</button></div>';
  $("#closeEvent").onclick=finishInteractive;
  $("#finishEvent").onclick=finishInteractive;
  if($("#toggleResults"))$("#toggleResults").onclick=()=>{a.revealed=!a.revealed;renderInteractive()};
}
function finishInteractive(){
  state.activeInteractive=null;
  renderInteractive();
  clearCue("企画を終了。コメントを見守ります");
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function replySuggestion(text){
  const v=String(text||"").trim();
  if(/[?？]/.test(v))return"それ気になる。みんなはどう思う？";
  if(/疲|しんど|眠/.test(v))return"おつかれさま。今日は無理せずゆるくいこ。";
  if(/嬉|楽しかった|最高|好き/.test(v))return"ええやん。何が一番よかった？";
  if(/恋|彼氏|彼女|好きな人/.test(v))return"恋バナきた。そこ、もう少し詳しく聞きたい。";
  if(/仕事|会社|バイト/.test(v))return"今日いちばん大変やったのどこ？";
  if(/ご飯|ごはん|食べ|ラーメン|焼肉|寿司/.test(v))return"飯テロやな。今もう一品選ぶなら何？";
  const a=["それもうちょい聞きたい。","なるほど。みんなならどうする？","それ分かる人いる？","そこから話広げたい。もう一個聞いていい？"];
  return a[Math.floor(Math.random()*a.length)];
}

function renderCue(){
  const cue=state.cue;
  const box=$("#cueBox"), title=$("#cueTitle"), text=$("#cueText"), reason=$("#cueReason"), urgency=$("#cueUrgency"), use=$("#sendCue");
  if(!box||!title||!text||!reason||!urgency||!use)return;
  if(!cue){
    box.classList.add("idle");
    reason.textContent="今やること";
    title.textContent="まだ何もしなくてOK";
    text.textContent="コメントが来るか、沈黙が続いた時にここへ提案を出します。";
    urgency.textContent="待機";
    use.disabled=true;
    use.textContent="この提案を使う";
    return;
  }
  box.classList.remove("idle");
  reason.textContent=cue.reason||"秘書の提案";
  title.textContent=cue.title||"次の一手";
  text.textContent=cue.text||cue.item?.text||"";
  urgency.textContent=cue.urgency||"提案";
  use.disabled=false;
  use.textContent="この提案を使う";
}

function setCue(cue){
  state.cue=cue;
  renderCue();
  if($("#stateText"))$("#stateText").textContent=cue.reason||"提案があります";
  if(features().autosend&&state.running)setTimeout(useCue,300);
}
function clearCue(msg="今は見守っています"){
  state.cue=null;
  renderCue();
  if($("#stateText"))$("#stateText").textContent=msg;
}
function suggestReply(text,name){
  setCue({
    kind:"reply",
    title:name+"への返し案",
    text:replySuggestion(text),
    reason:"コメントが入りました",
    urgency:"今"
  });
}
function modeKind(){
  const f=features();
  const choices={
    "恋バナ":["topics",...(f.psych?["psych"]:[]),"choices"],
    "わちゃわちゃ":[...(f.game?["games"]:[]),"choices","topics"],
    "初見歓迎":["choices","topics"],
    "深夜":["topics",...(f.psych?["psych"]:[])],
    "まったり":["topics","choices"],
    "雑談":["topics","choices",...(f.psych?["psych"]:[])]
  }[state.mode]||["topics","choices"];
  return choices[Math.floor(Math.random()*choices.length)]||"topics";
}
function suggestionFor(kind,reason){
  const item=randomFresh(kind); if(!item)return null;
  const title={
    topics:"この話題で広げる",
    choices:"二択で参加してもらう",
    psych:"心理テストを入れる",
    games:"ゲームで空気を変える"
  }[kind]||"この案を使う";
  return {kind:"content",item,title,text:item.kind==="psych"?item.raw.q:item.text,reason,urgency:"提案"};
}
function suggestKind(kind,reason){
  const cue=suggestionFor(kind,reason);
  if(cue)setCue(cue);
}
function suggestNext(reason){
  if(state.activeInteractive){
    setCue({kind:"event",title:"今の企画を続ける",text:"回答が"+state.activeInteractive.total+"件集まっています。もう少し待つか、結果を見て締められます。",reason:"企画進行中",urgency:"進行"});
    return;
  }
  suggestKind(modeKind(),reason||"今の枠に合う候補");
}
async function useCue(){
  const cue=state.cue; if(!cue)return;
  if(cue.kind==="reply"){
    const ok=await sendOut(cue.text); if(ok)clearCue("送信しました");
    return;
  }
  if(cue.kind==="event"){
    if(state.activeInteractive?.type==="psych"){state.activeInteractive.revealed=true;renderInteractive()}
    clearCue("企画を確認できます");
    return;
  }
  if(cue.item){
    const item=cue.item;
    clearCue("実行しました");
    await launchContent(item);
  }
}

if($("#sendCue"))$("#sendCue").onclick=useCue;
if($("#nextCue"))$("#nextCue").onclick=()=>suggestNext("別の案を選びました");
if($("#snoozeCue"))$("#snoozeCue").onclick=()=>{
  state.lastSuggestionAt=state.silence;
  clearCue("今は使わず見守ります");
};

async function launchContent(item){
  if(!item)return;
  if(!state.running){
    const ok=await startSession();
    if(!ok)return;
  }
  if(item.kind==="topics"){
    track(item);
    await sendOut(item.text);
    return;
  }
  startInteractive(item);
}

function updateLive(){
  if($("#viewers"))$("#viewers").textContent=state.viewers;
  if($("#comments"))$("#comments").textContent=state.comments;
  if($("#silence"))$("#silence").textContent=state.silence;
  if($("#liveElapsed"))$("#liveElapsed").textContent=formatTime(state.duration);
}
function formatTime(sec){
  const m=Math.floor(sec/60),s=sec%60;
  return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}

function wireProvider(){
  if(providerWired)return;
  providerWired=true;
  provider.onComment(p=>{
    if(!state.running)return;
    const text=payloadText(p)||"（コメント）", name=payloadName(p);
    state.comments++; state.silence=0;
    if(state.lastBot){state.responded++;state.lastBot=false}
    addFeed(name+"："+text,"user");
    const handled=handleInteractiveAnswer(text,name);
    setFeedStatus("コメント受信");
    if(!handled)suggestReply(text,name);
    updateLive();
  });
  provider.onJoin(p=>{
    if(!state.running)return;
    const name=payloadName(p);
    state.viewers++;
    addFeed(name+" さんが入室","event");
    if(features().new){
      setCue({kind:"reply",title:"初見さんへの一言",text:name+"さん、いらっしゃい！ 聞き専でも大丈夫やで。",reason:"初見さんが入りました",urgency:"今"});
    }
    updateLive();
  });
  provider.onLeave(()=>{if(state.running){state.viewers=Math.max(0,state.viewers-1);updateLive()}});
  provider.onGift(p=>{
    if(!state.running)return;
    const name=payloadName(p);
    addFeed("応援："+name+" さん","event");
    setCue({kind:"reply",title:"応援へのお礼",text:name+"さんありがとう！ めっちゃ嬉しい。",reason:"応援が届きました",urgency:"今"});
  });
  provider.onLike(()=>{if(state.running&&$("#stateText"))$("#stateText").textContent="いいねが増えています"});
  provider.onLiveState(p=>{
    const s=String(p?.state||"");
    if(s==="connected"){
      if($("#liveStatus"))$("#liveStatus").textContent=remote?"接続中":"デモ中";
      if($("#stateText"))$("#stateText").textContent="コメントを見守っています";
    }else if(s==="ended"&&state.running)endSession(true);
    else if(s==="gateway_error")toast("Spoonとの通信でエラーが発生しました");
  });
}

async function initGateway(){
  let st={configured:false,authenticated:false};
  try{
    const r=await fetch("/api/status",{cache:"no-store"});
    if(r.ok)st=await r.json();
  }catch{}
  if(st.authenticated){
    provider=new SpoonLiveProvider(); remote=true;
  }else{
    provider=new MockLiveProvider(); remote=false;
  }
  wireProvider();

  const conn=$(".connection span");
  if(conn)conn.textContent=st.authenticated?"Spoon連携済み":st.configured?"連携待ち":"デモ";
  if($("#connectionNotice")){
    $("#connectionNotice").innerHTML=st.authenticated
      ?"<b>Spoon連携済み</b><p>配信アシスト開始後、LIVEイベントを自動で受け取ります。</p>"
      :"<b>現在はデモモード</b><p>Spoon連携前でも、コメント→秘書の提案→企画実行まで試せます。</p>";
  }
  if($("#startLabel"))$("#startLabel").textContent=st.authenticated?"配信アシストを始める":"デモを始める";
  if($("#startSub"))$("#startSub").textContent=st.authenticated?"Spoon LIVEと接続":"まずは動きを試す";
  if($("#settingsConnection"))$("#settingsConnection").textContent=st.authenticated?"連携済み":st.configured?"未連携":"デモモード";
  if($("#settingsConnectionText"))$("#settingsConnectionText").textContent=st.authenticated?"SpoonのLIVEイベントを受信できます。":st.configured?"下のボタンからSpoon連携できます。":"API資格情報が設定されるまではデモで確認できます。";
  if($("#spoonConnect")){
    $("#spoonConnect").disabled=!st.configured||st.authenticated;
    $("#spoonConnect").textContent=st.authenticated?"Spoon連携済み":st.configured?"Spoonと連携":"Spoon API設定待ち";
    $("#spoonConnect").onclick=()=>{if(st.configured&&!st.authenticated)location.href="/api/oauth/start"};
  }
  if($("#demoSimulator"))$("#demoSimulator").hidden=remote;
}

async function startSession(){
  if(state.running){go("live");return true}
  try{
    if(remote)await provider.connect();
    else await provider.connect().catch(()=>{});
  }catch(e){
    toast(e.message||"接続できませんでした");
    return false;
  }
  state.running=true;
  state.silence=0; state.maxSilence=0; state.duration=0; state.comments=0; state.interventions=0; state.responded=0;
  state.startedAt=Date.now(); state.viewers=remote?0:6; state.cue=null; state.activeInteractive=null; state.lastSuggestionAt=-999;
  demoSeq=0;
  renderCue(); renderInteractive(); updateLive();
  if($("#feed"))$("#feed").innerHTML='<div class="empty-chat">コメント待ち。秘書は裏で見守ります。</div>';
  setFeedStatus(remote?"LIVE受信中":"デモ待機中");
  if($("#liveStatus"))$("#liveStatus").textContent=remote?"接続中":"デモ中";
  if($("#liveStatusSmall"))$("#liveStatusSmall").textContent=remote?"Spoon LIVE":"デモ配信";
  clearInterval(sessionTimer);
  sessionTimer=setInterval(()=>{
    if(!state.running)return;
    state.silence++;
    state.duration=Math.floor((Date.now()-state.startedAt)/1000);
    state.maxSilence=Math.max(state.maxSilence,state.silence);
    const thresholds=[90,60,35], threshold=thresholds[state.level]||60;
    if(!state.cue&&!state.activeInteractive&&state.silence>=threshold&&state.silence-state.lastSuggestionAt>=threshold){
      state.lastSuggestionAt=state.silence;
      suggestNext(state.silence+"秒コメントが止まっています");
    }
    updateLive();
  },1000);
  go("live");
  return true;
}
if($("#start"))$("#start").onclick=startSession;

async function endSession(fromSpoon=false){
  if(!state.running){go("history");return}
  state.running=false;
  clearInterval(sessionTimer);
  if(remote&&!fromSpoon)await provider.disconnect().catch(()=>{});
  Store.addSession?.({
    at:new Date().toISOString(),
    mode:state.mode,
    persona:state.persona,
    duration:state.duration,
    viewers:state.viewers,
    comments:state.comments,
    interventions:state.interventions,
    responseRate:state.interventions?Math.round(state.responded/state.interventions*100):0,
    maxSilence:state.maxSilence
  });
  state.cue=null; state.activeInteractive=null;
  renderHistory(); renderHome(); go("history");
  toast(fromSpoon?"LIVE終了を検知しました":"配信履歴を保存しました");
}
if($("#endLive"))$("#endLive").onclick=()=>endSession(false);

async function demoComment(){
  const input=$("#manual"); const v=input?.value.trim(); if(!v||remote)return;
  demoSeq++;
  const name="デモ視聴者"+demoSeq;
  state.comments++; state.silence=0;
  addFeed(name+"："+v,"user");
  const handled=handleInteractiveAnswer(v,name);
  if(!handled)suggestReply(v,name);
  setFeedStatus("デモコメント "+state.comments+"件");
  input.value="";
  updateLive();
}
if($("#send"))$("#send").onclick=demoComment;
if($("#manual"))$("#manual").addEventListener("keydown",e=>{if(e.key==="Enter")demoComment()});
if($("#newcomer"))$("#newcomer").onclick=()=>{
  if(remote)return;
  demoSeq++; state.viewers++;
  const name="初見リスナー"+demoSeq;
  addFeed(name+" さんが入室","event");
  if(features().new)setCue({kind:"reply",title:"初見さんへの一言",text:"初見さんいらっしゃい！ 聞き専でも大丈夫やで。",reason:"初見さんが入りました",urgency:"今"});
  updateLive();
};
if($("#skip"))$("#skip").onclick=()=>{
  if(remote)return;
  state.silence+=30; state.maxSilence=Math.max(state.maxSilence,state.silence);
  state.lastSuggestionAt=state.silence;
  suggestNext("30秒コメントが止まりました");
  updateLive();
};

if($("#topicNow"))$("#topicNow").onclick=()=>suggestKind("topics","話題を出したい時の候補");
if($("#choiceNow"))$("#choiceNow").onclick=()=>suggestKind("choices","参加しやすい二択");
if($("#psychNow"))$("#psychNow").onclick=()=>suggestKind("psych","4択で参加できる心理テスト");
if($("#gameNow"))$("#gameNow").onclick=()=>suggestKind("games","枠を動かすゲーム");
if($("#instantAssist"))$("#instantAssist").onclick=()=>suggestNext("今の枠モードから選びました");

function renderContentTabs(){
  const wrap=$("#contentTypeTabs"); if(!wrap)return;
  const tabs=[
    ["recommended","おすすめ"],
    ["topics","話題"],
    ["choices","二択"],
    ["psych","心理"],
    ["games","ゲーム"],
    ["favorites","お気に入り"],
    ["recent","最近"]
  ];
  wrap.innerHTML="";
  tabs.forEach(([id,label])=>{
    const b=document.createElement("button"); b.textContent=label; b.classList.toggle("active",contentType===id);
    b.onclick=()=>{contentType=id;contentCategory="すべて";renderContent()};
    wrap.append(b);
  });
}
function relevantCategories(){
  return {
    "恋バナ":["恋愛","深夜","価値観"],
    "初見歓迎":["初見","配信","日常"],
    "深夜":["深夜","恋愛","価値観"],
    "わちゃわちゃ":["ゲーム","食","もしも","配信"],
    "まったり":["日常","趣味","音楽","旅行"],
    "雑談":["日常","食","仕事","友達","もしも"]
  }[state.mode]||["日常","初見"];
}
function contentPool(){
  if(contentType==="favorites")return Store.favorites?.()||[];
  if(contentType==="recent")return Store.recent?.()||[];
  if(contentType==="recommended"){
    const cats=new Set(relevantCategories());
    return allItems().filter(x=>cats.has(x.category)).slice(0,80);
  }
  return items(contentType);
}
function renderCategoryChips(pool){
  const wrap=$("#categoryChips"); if(!wrap)return;
  const cats=["すべて",...new Set(pool.map(x=>x.category).filter(Boolean))];
  wrap.innerHTML="";
  cats.forEach(cat=>{
    const b=document.createElement("button"); b.textContent=cat; b.classList.toggle("active",contentCategory===cat);
    b.onclick=()=>{contentCategory=cat;renderContent()};
    wrap.append(b);
  });
}
function kindLabel(k){return {topics:"話題",choices:"二択",psych:"心理",games:"ゲーム"}[k]||"カード"}
function renderContent(){
  renderContentTabs();
  let pool=contentPool();
  renderCategoryChips(pool);
  const q=($("#search")?.value||"").trim().toLowerCase();
  if(contentCategory!=="すべて")pool=pool.filter(x=>x.category===contentCategory);
  if(q)pool=pool.filter(x=>(x.text+" "+x.category+" "+kindLabel(x.kind)).toLowerCase().includes(q));
  if($("#contentCount"))$("#contentCount").textContent=allItems().length+"件";
  const list=$("#libraryList"); if(!list)return;
  list.innerHTML="";
  if(!pool.length){list.innerHTML='<div class="empty-list">該当するカードがありません</div>';return}
  pool.slice(0,160).forEach(item=>{
    const card=document.createElement("div"); card.className="content-card";
    const fav=Store.isFavorite?.(item);
    card.innerHTML='<div class="content-meta"><span>'+escapeHtml(kindLabel(item.kind))+'</span><em>'+escapeHtml(item.category)+'</em></div>'+
      '<p>'+escapeHtml(item.kind==="psych"?item.raw?.q||item.text:item.text)+'</p>'+
      '<div class="content-actions"><button class="favorite">'+(fav?"★":"☆")+'</button><button class="use-card">'+(state.running?"配信で使う":"これで試す")+'</button></div>';
    card.querySelector(".favorite").onclick=()=>{
      const on=Store.toggleFavorite?.(item);
      card.querySelector(".favorite").textContent=on?"★":"☆";
      toast(on?"お気に入りに追加":"お気に入りから削除");
    };
    card.querySelector(".use-card").onclick=()=>launchContent(item);
    list.append(card);
  });
}
if($("#search"))$("#search").oninput=renderContent;

function renderHome(){
  const sessions=Store.load().sessions||[];
  if($("#homeHistoryCount"))$("#homeHistoryCount").textContent=sessions.length;
  const recent=(Store.recent?.()||[]).slice(0,3);
  const box=$("#homeRecent"); if(!box)return;
  if(!recent.length){box.innerHTML="";return}
  box.innerHTML='<div class="section-title"><span>最近使った</span><small>すぐ再利用</small></div>'+
    '<div class="recent-cards">'+recent.map(x=>'<button data-id="'+x.id+'"><small>'+escapeHtml(x.category)+'</small><b>'+escapeHtml(x.text)+'</b></button>').join("")+'</div>';
  box.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>{
    const item=recent.find(x=>x.id===b.dataset.id); if(item)launchContent(item);
  });
}

function renderHistory(){
  const d=Store.load(), sessions=d.sessions||[], recent=Store.recent?.()||[], fav=Store.favorites?.()||[];
  const has=sessions.length||recent.length;
  if($("#historyEmpty"))$("#historyEmpty").hidden=!!has;
  if($("#historyContent"))$("#historyContent").hidden=!has;
  if(!has)return;
  if($("#sessionCount"))$("#sessionCount").textContent=sessions.length;
  if($("#usedCount"))$("#usedCount").textContent=Object.keys(d.contentUsage||{}).length;
  if($("#favCount"))$("#favCount").textContent=fav.length;
  const ranks=Store.usageRanking?.(8)||[];
  const rank=$("#usageRanking");
  if(rank)rank.innerHTML=ranks.length?ranks.map(r=>'<div class="rank-row"><b>'+r.rank+'</b><span>'+escapeHtml(r.category)+'</span><em>'+r.count+'回</em></div>').join(""):'<div class="empty-list">まだ利用データがありません</div>';
  const rh=$("#recentHistory");
  if(rh)rh.innerHTML=recent.length?recent.slice(0,12).map(x=>'<div class="history-row"><span>'+escapeHtml(x.category)+'</span><p>'+escapeHtml(x.text)+'</p></div>').join(""):'<div class="empty-list">まだ履歴がありません</div>';
}

applySavedSettings();
renderHome();
renderContent();
renderHistory();
renderCue();
renderInteractive();
initGateway();

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}