class ConversationEngine{
  constructor(opts={}){
    this.level=opts.level||"normal";
    this.mode=opts.mode||"雑談";
    this.lastInterventionAt=-Infinity;
    this.lastAction="";
    this.recent=[];
  }
  thresholds(){
    const base=this.level==="high"?{nudge:25,topic:55,deep:90,cooldown:28}:this.level==="low"?{nudge:85,topic:145,deep:230,cooldown:85}:{nudge:50,topic:100,deep:165,cooldown:50};
    const mult={"まったり":1.2,"雑談":1,"恋バナ":.95,"深夜":1.15,"初見歓迎":.9,"わちゃわちゃ":.72}[this.mode]||1;
    return Object.fromEntries(Object.entries(base).map(([k,v])=>[k,Math.round(v*mult)]));
  }
  priority(features={}){
    const byMode={
      "まったり":["topic","choice","psych","game"],
      "雑談":["choice","topic","psych","game"],
      "恋バナ":["choice","psych","topic","game"],
      "深夜":["topic","psych","choice","game"],
      "初見歓迎":["choice","topic","game","psych"],
      "わちゃわちゃ":["game","choice","topic","psych"]
    };
    return (byMode[this.mode]||byMode["雑談"]).filter(a=>features[a==="choice"?"prompt":a]!==false);
  }
  remember(action){
    if(!action||action==="wait")return;
    this.lastAction=action;
    this.recent=[action,...this.recent.filter(x=>x!==action)].slice(0,3);
  }
  decide({silence=0,active=false,newcomer=false,features={},commentBurst=0}){
    const t=this.thresholds();
    if(active||commentBurst>=2)return{action:"wait",reason:"コメントが動いているため見守る",urgency:0};
    if(newcomer&&features.new!==false)return{action:"newcomer",reason:"初見が参加しやすい入口を作る",urgency:2};
    if(silence-this.lastInterventionAt<t.cooldown)return{action:"wait",reason:"連投防止クールダウン",urgency:0};

    const p=this.priority(features);
    let pool=[];
    let urgency=0;
    if(silence>=t.deep){pool=p;urgency=3}
    else if(silence>=t.topic){pool=p.filter(x=>x!=="game"||this.mode==="わちゃわちゃ");urgency=2}
    else if(silence>=t.nudge){pool=p.filter(x=>x==="choice"||x==="topic");urgency=1}
    if(!pool.length)return{action:"wait",reason:"まだ介入しない",urgency:0};

    let action=pool.find(x=>x!==this.lastAction&&!this.recent.slice(0,2).includes(x))||pool.find(x=>x!==this.lastAction)||pool[0];
    this.lastInterventionAt=silence;
    this.remember(action);
    return{action,reason:`${this.mode}モード・沈黙${silence}秒から選択`,urgency};
  }
}
window.ConversationEngine=ConversationEngine;