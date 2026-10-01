const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const D=window.LIVE_CONTENT||{},pick=a=>a?.length?a[Math.floor(Math.random()*a.length)]:"";
let saved=Store.load();
let state={running:false,silence:0,comments:0,viewers:0,interventions:0,responded:0,lastBot:false,persona:saved.persona||"しっかり秘書",mode:saved.mode||"雑談",maxSilence:0,duration:0,startedAt:0,_last:-999,activeInteractive:null,cue:null};
let demoSeq=0;
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
    const demo=$("#demoSimulator");if(demo)demo.hidden=remote;
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
    const text=payloadText(p)||"（コメント）",name=payloadName(p);state.comments++;state.silence=0;
    if(state.lastBot){state.responded++;state.lastBot=false}
    add(name+"："+text,"user");const handled=handleInteractiveAnswer(text,name);
    $("#feedStatus")&&($("#feedStatus").textContent="コメント受信");
    if(!handled)suggestReply(text,name);
    update();
  });
  provider.onJoin(p=>{
    if(!state.running)return;const name=payloadName(p);state.viewers++;add(name+" さんが入室","event");
    if(features().new)setCue({kind:"reply",title:"初見さんへの一言",text:name+"さん、いらっしゃい！ 聞き専でも大丈夫やで。今の気分だけ①元気 ②普通 ③お疲れ？",reason:"初見入室",urgency:"NOW"});update();
  });
  provider.onLeave(()=>{if(state.running)state.viewers=Math.max(0,state.viewers-1);update()});
  provider.onGift(p=>{if(state.running){const name=payloadName(p);add("🎁 "+name+" さんから応援が届きました","event");setCue({kind:"reply",title:"応援へのお礼",text:name+"さんありがとう！ めっちゃ嬉しい。",reason:"応援イベント",urgency:"NOW"});update()}});
  provider.onLike(()=>{if(state.running)$("#stateText").textContent="いいねが増えています"});
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
function add(t,type="bot"){
  const feed=$("#feed");if(!feed)return;
  let d=document.createElement("div");d.className="message "+type;d.innerHTML="<span>"+(type==="bot"?"":type==="event"?"◆":"●")+"</span><p></p>";d.querySelector("p").textContent=t;feed.append(d);
  while(feed.children.length>12)feed.removeChild(feed.firstElementChild);
  feed.scrollTop=99999;
}
function cueLabel(kind){return kind==="reply"?"返し案":kind==="topics"?"話題":kind==="choices"?"二択":kind==="psych"?"心理テスト":kind==="games"?"ゲーム":kind==="interactive-result"?"進行":"提案"}
function renderCue(){
  const cue=state.cue,title=$("#cueTitle"),text=$("#cueText"),reason=$("#cueReason"),urg=$("#cueUrgency"),send=$("#sendCue"),card=$("#cueCard");
  if(!title||!text||!reason||!urg||!send||!card)return;
  if(!cue){
    title.textContent="今は無理に動かなくてOK";
    text.textContent="コメントや沈黙の流れを見て、必要な時だけ次の一手を出します。";
    reason.textContent="NEXT BEST ACTION";urg.textContent="WAIT";send.disabled=true;send.textContent="この一手を使う";card.classList.add("is-idle");return;
  }
  card.classList.remove("is-idle");reason.textContent=(cue.reason||"秘書の提案")+" · "+cueLabel(cue.kind);
  title.textContent=cue.title||"次の一手";
  text.textContent=cue.text||cue.item?.text||"";
  urg.textContent=cue.urgency||"SUGGEST";send.disabled=false;
  send.textContent=cue.kind==="interactive-result"?"結果を確認する":"この一手を使う";
}
function setCue(cue,{allowAuto=true}={}){
  state.cue=cue;renderCue();
  $("#stateText")&&($("#stateText").textContent=cue?.reason||"次の一手を用意しました");
  if(allowAuto&&features().autosend&&state.running)setTimeout(()=>useCurrentCue(),250);
}
function clearCue(message="会話を見守っています"){
  state.cue=null;renderCue();$("#stateText")&&($("#stateText").textContent=message);
}
function replySuggestion(text){
  const v=String(text||"").trim();
  if(/[?？]/.test(v))return"それ気になる。みんなはどう思う？";
  if(/疲|しんど|眠/.test(v))return"おつかれさま。今日は無理せずゆるくいこ。";
  if(/嬉|楽しかった|最高|好き/.test(v))return"ええやん。何が一番よかった？";
  if(/恋|彼氏|彼女|好きな人/.test(v))return"恋バナきた。そこ、もう少し詳しく聞きたい。";
  if(/仕事|会社|バイト/.test(v))return"今日いちばん大変やったのどこ？";
  if(/ご飯|ごはん|食べ|ラーメン|焼肉|寿司/.test(v))return"飯テロやな。今もう一品選ぶなら何？";
  return pick(["それもうちょい聞きたい。","なるほど。みんなならどうする？","それ分かる人いる？","そこから話広げたい。もう一個聞いていい？"]);
}
function suggestReply(text,name="リスナー"){
  const reply=replySuggestion(text);
  setCue({kind:"reply",title:name+"への返し案",text:reply,reason:"コメントが入りました",urgency:"NOW"});
}
function contentCue(kind,reason="今の枠に合いそう"){
  const it=randomItem(kind);if(!it)return null;
  const names={topics:"この話題で広げる",choices:"二択で参加を促す",psych:"心理テストを入れる",games:"ゲームで空気を動かす"};
  return{kind,item:it,title:names[kind]||"次の一手",text:it.text,reason,urgency:"SUGGEST"};
}
function suggestKind(kind,reason){const cue=contentCue(kind,reason);if(cue)setCue(cue,{allowAuto:false})}
async function useCurrentCue(){
  const cue=state.cue;if(!cue)return;
  if(cue.kind==="interactive-result"){
    if(state.activeInteractive){state.activeInteractive.revealed=true;renderLiveInteractive();clearCue("結果を確認できます")}
    return;
  }
  if(cue.kind==="reply"){bot(cue.text);clearCue("送信しました");return}
  if(cue.item){const it=cue.item;clearCue("実行しました");launchContent(it)}
}
function suggestNext(force=false){
  if(state.activeInteractive&&state.activeInteractive.total>0){
    setCue({kind:"interactive-result",title:"回答を締めて結果を確認",text:state.activeInteractive.total+"件の回答が集まっています。ここで結果を見るか、もう少し待てます。",reason:"参加型コンテンツ進行中",urgency:"NOW"},{allowAuto:false});return;
  }
  let kind="topics";
  if(state.mode==="恋バナ")kind=Math.random()<.55?"psych":"topics";
  else if(state.mode==="わちゃわちゃ")kind=Math.random()<.55?"games":"choices";
  else if(state.mode==="初見歓迎")kind=Math.random()<.65?"choices":"topics";
  else if(state.mode==="深夜")kind=Math.random()<.7?"topics":"psych";
  else if(state.silence>=45)kind=Math.random()<.5?"choices":"games";
  const reason=force?"秘書が今の枠から選びました":state.silence>=30?state.silence+"秒沈黙しています":"会話の流れを変える候補";
  const cue=contentCue(kind,reason);if(cue)setCue(cue,{allowAuto:!force});
}

function answerNumber(text){
  const m=String(text||"").trim().match(/^[①②③④1-4１-４]$/);if(!m)return null;
  const ch=m[0],map={"①":1,"②":2,"③":3,"④":4,"１":1,"２":2,"３":3,"４":4};
  return map[ch]||Number(ch);
}
function interactivePrompt(interactive){
  if(interactive.type==="psych"){
    return interactive.test.q+" "+interactive.test.options.map((o,i)=>String(i+1)+" "+o).join(" / ");
  }
  return interactive.text;
}
function startInteractive(item){
  if(!item)return;
  let active;
  if(item.kind==="psych"){
    const test=item.raw||D.psych?.find(x=>psychPrompt(x)===item.text);
    if(!test)return;
    active={type:"psych",kind:"psych",category:test.category,test,text:psychPrompt(test),votes:[0,0,0,0],total:0,revealed:false,answers:{}};
  }else if(item.kind==="choices"){
    const parts=item.text.split(/\s+/);
    active={type:"choice",kind:"choices",category:item.category,text:item.text,votes:[0,0],total:0,revealed:false,answers:{}};
  }else if(item.kind==="games"){
    const max=/[③④34]/.test(item.text)?4:2;
    active={type:"game",kind:"games",category:item.category,text:item.text,votes:Array(max).fill(0),total:0,revealed:false,answers:{}};
  }else return;
  state.activeInteractive=active;trackItem(item);renderLiveInteractive();
  bot(interactivePrompt(active));
}
function renderLiveInteractive(){
  const panel=$("#interactivePanel");if(!panel)return;
  const a=state.activeInteractive;
  if(!a){panel.hidden=true;panel.innerHTML="";return}
  panel.hidden=false;
  const labels=a.type==="psych"?(a.test.options||[]):Array.from({length:a.votes.length},(_,i)=>String(i+1));
  const title=a.type==="psych"?"心理テスト":a.type==="choice"?"二択":"参加型ゲーム";
  const question=a.type==="psych"?a.test.q:a.text;
  const bars=labels.map((label,i)=>{
    const count=a.votes[i]||0,pct=a.total?Math.round(count/a.total*100):0;
    return '<div class="interactive-row"><div><b>'+(i+1)+'</b><span>'+label+'</span><em>'+count+'票 · '+pct+'%</em></div><i><u style="width:'+pct+'%"></u></i></div>';
  }).join("");
  const resultList=a.type==="psych"&&a.revealed?'<div class="psych-result-list">'+(a.test.results||[]).map((r,i)=>'<div><b>'+(i+1)+'</b><span>'+r+'</span></div>').join("")+'</div>':"";
  panel.innerHTML='<div class="interactive-head"><div><small>'+title+' · '+a.category+'</small><strong>'+question+'</strong></div><button id="interactiveClose">×</button></div>'+
    '<div class="interactive-votes">'+bars+'</div>'+resultList+
    '<div class="interactive-foot"><span>'+a.total+'回答を集計中</span>'+(a.type==="psych"?'<button id="interactiveReveal">'+(a.revealed?"結果を閉じる":"結果一覧")+'</button>':'')+'</div>';
  $("#interactiveClose").onclick=()=>{state.activeInteractive=null;renderLiveInteractive();clearCue("企画を終了しました")};
  if($("#interactiveReveal"))$("#interactiveReveal").onclick=()=>{a.revealed=!a.revealed;renderLiveInteractive()};
}
function handleInteractiveAnswer(text,name="リスナー"){
  const a=state.activeInteractive,n=answerNumber(text);if(!a||!n||n>a.votes.length)return false;
  const voter=String(name||"リスナー"),prev=a.answers?.[voter];
  if(prev===n){$("#stateText").textContent=voter+" はすでに "+n+" に回答済みです";return true}
  if(prev){a.votes[prev-1]=Math.max(0,(a.votes[prev-1]||0)-1)}
  else a.total++;
  a.answers[voter]=n;a.votes[n-1]=(a.votes[n-1]||0)+1;renderLiveInteractive();
  if(a.type==="psych"&&a.revealed){
    const result=a.test.results?.[n-1];if(result)$("#stateText").textContent=voter+"："+result;
  }else $("#stateText").textContent=prev?voter+" が回答を "+prev+"→"+n+" に変更しました":voter+" の回答を集計しました";
  return true;
}

function launchContent(item){
  if(!item?.text)return;
  if(!state.running){start().then(()=>{if(item.kind==="topics"){trackItem(item);bot(item.text)}else startInteractive(item)});return}
  if(item.kind==="topics"){trackItem(item);bot(item.text);return}
  startInteractive(item);
}
function bot(t,item=null){
  if(!t)return;if(item)trackItem(item);const spoken=voice(t);add(spoken);state.interventions++;state.lastBot=true;$("#stateText").textContent="会話のきっかけを提案しました";update();
  if(remote&&state.running)provider.sendMessage(spoken).catch(e=>toast("Bot送信失敗: "+e.message));
}
function features(){let o={};$$("[data-feature]").forEach(x=>o[x.dataset.feature]=x.checked);return o}
function intervene(force=false){
  let lv=["low","normal","high"][$("#range").value],e=new ConversationEngine({level:lv,mode:state.mode});e.lastInterventionAt=state._last;
  if(force){suggestNext(true);return}
  if(state.cue)return
  let r=e.decide({silence:state.silence,active:false,features:features()});
  if(r.action!=="wait"){
    state._last=state.silence;const map={choice:"choices",topic:"topics",psych:"psych",game:"games"},kind=map[r.action]||"topics";
    const cue=contentCue(kind,state.silence+"秒沈黙しています");if(cue)setCue(cue);
  }else if(!state.cue)$("#stateText").textContent=r.reason||"まだ介入せず見守っています";
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
  state.running=true;state.silence=0;state.maxSilence=0;state.duration=0;state.comments=0;state.interventions=0;state.responded=0;state.lastBot=false;state.startedAt=Date.now();state.viewers=remote?0:6;state.activeInteractive=null;state.cue=null;renderLiveInteractive();renderCue();demoSeq=0;
  clearInterval(sessionTimer);sessionTimer=setInterval(()=>{if(!state.running)return;state.silence++;state.duration=Math.floor((Date.now()-state.startedAt)/1000);state.maxSilence=Math.max(state.maxSilence,state.silence);if(state.silence%30===0)intervene();update()},1000);
  $("#feed").innerHTML="";$("#feedStatus")&&($("#feedStatus").textContent=remote?"LIVE受信中":"デモ待機中");add(remote?"Spoon LIVE接続を開始しました。イベントを待っています。":"デモ開始。下のデモ操作からリスナー反応を試せます。","event");
  let t=topic||$("#topic").value.trim();if(t)add("今日のテーマ「"+t+"」を覚えました。");
  $("#stateText").textContent=remote?"Spoon LIVEを接続しています":"会話を見守っています";go("live");update();
}
$("#start").onclick=()=>start();$("#useRecommend").onclick=()=>{const it={kind:"topics",category:"初見",text:"最近ちょっと嬉しかったこと"};trackItem(it);start(it.text)};
$("#skip").onclick=()=>{state.silence+=30;state.maxSilence=Math.max(state.maxSilence,state.silence);suggestNext(false);update()};
$("#newcomer").onclick=()=>{if(remote){toast("本番ではSpoonの入室イベントを自動受信します");return}state.viewers++;const name="初見リスナー";add(name+" さんが入室","event");if(features().new)setCue({kind:"reply",title:"初見さんへの一言",text:"初見さんいらっしゃい！ 聞き専でも大丈夫。今の気分だけ①元気 ②普通 ③お疲れ？",reason:"初見入室",urgency:"NOW"},{allowAuto:false});update()};
$("#topicNow").onclick=()=>suggestKind("topics","話題を広げたい時の候補");$("#choiceNow").onclick=()=>suggestKind("choices","コメント参加を増やす候補");$("#psychNow").onclick=()=>suggestKind("psych","4択で参加を作る候補");$("#gameNow").onclick=()=>suggestKind("games","枠を動かす候補");$("#instantAssist").onclick=()=>suggestNext(true);$("#sendCue").onclick=()=>useCurrentCue();$("#nextCue").onclick=()=>suggestNext(true);$("#snoozeCue").onclick=()=>clearCue("今は見守ります");
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
  demoSeq++;const name="デモ視聴者"+demoSeq;
  state.comments++;state.silence=0;if(state.lastBot){state.responded++;state.lastBot=false}
  add(name+"："+v,"user");const handled=handleInteractiveAnswer(v,name);$("#manual").value="";
  $("#feedStatus")&&($("#feedStatus").textContent="デモコメント "+state.comments+"件");
  if(!handled)suggestReply(v,name);else $("#stateText").textContent=name+" の回答を集計しました";
  update();
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
    main.onclick=()=>launchContent(item);
    const fav=document.createElement("button");fav.className="fav-btn";fav.textContent=Store.isFavorite?.(item)?"★":"☆";fav.setAttribute("aria-label","お気に入り");
    fav.onclick=e=>{e.stopPropagation();const on=Store.toggleFavorite?.(item);fav.textContent=on?"★":"☆";toast(on?"お気に入りに追加":"お気に入りから削除");renderDiscovery()};
    row.append(main,fav);list.append(row);
  });
}
function renderDiscovery(){
  let board=$("#usageRank");
  if(!board){board=document.createElement("section");board.id="usageRank";board.className="usage-board";const rec=$(".recommend");rec?.after(board)}
  const ranks=Store.usageRanking?.(5)||[],recent=Store.recent?.().slice(0,3)||[];
  board.innerHTML='<div class="section-head compact"><div><small>MY TRENDS</small><h2>あなたの利用傾向</h2></div><button data-open-library>一覧</button></div>'+
    (ranks.length?'<div class="rank-list">'+ranks.map(r=>'<div><b>'+r.rank+'</b><span>'+r.category+'</span><em>'+r.count+'回</em></div>').join("")+'</div>':'<div class="rank-empty">カードを使うと、ここにあなたの利用ランキングが育ちます。</div>')+
    '<div class="mini-head"><b>最近使った</b></div>'+
    (recent.length?'<div class="recent-mini">'+recent.map(x=>'<button data-recent-id="'+x.id+'"><span>'+x.category+'</span>'+x.text+'</button>').join("")+'</div>':'<div class="rank-empty small">まだ履歴はありません。</div>');
  board.querySelector("[data-open-library]")?.addEventListener("click",()=>go("library"));
  board.querySelectorAll("[data-recent-id]").forEach(b=>b.onclick=()=>{const it=recent.find(x=>x.id===b.dataset.recentId);if(it)launchContent(it)});
}
function psychPrompt(t){return t.q+" "+(t.options||[]).map((o,i)=>String(i+1)+" "+o).join(" / ")}
function renderPsych(){
  const card=$(".testcard");if(!card||!D.psych?.length)return;
  const t=D.psych[psychIndex%D.psych.length];
  card.innerHTML='<span class="testno">PSYCHOLOGY · '+t.category+'</span><h2 id="psychQ"></h2><div id="psychOptions"></div><div id="psychResult" class="psych-result"></div><div class="psych-actions"><button id="psychUse">配信で使う</button><button id="psychNext">次のテスト</button></div><small>※娯楽用コンテンツです。心理学的診断ではありません。</small>';
  $("#psychQ").textContent=t.q;
  const ops=$("#psychOptions");
  (t.options||[]).forEach((o,i)=>{const b=document.createElement("button");b.textContent=String(i+1)+" "+o;b.onclick=()=>{$("#psychResult").textContent=(t.results||[])[i]||"";trackItem({kind:"psych",category:t.category,text:psychPrompt(t)})};ops.append(b)});
  $("#psychUse").onclick=()=>{const it={kind:"psych",category:t.category,text:psychPrompt(t),raw:t};launchContent(it)};
  $("#psychNext").onclick=()=>{psychIndex=(psychIndex+1)%D.psych.length;renderPsych()};
}
ensureLibraryChips();renderLib();$("#search").oninput=e=>renderLib(e.target.value);renderPsych();
$(".play").forEach(b=>b.onclick=()=>{const it=randomItem("games");if(it)launchContent(it)});renderDiscovery();
setMode(state.mode,true);update();initGateway();
if("serviceWorker"in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
