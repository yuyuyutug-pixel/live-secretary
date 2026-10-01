class LiveProvider{
  async connect(){throw new Error("not implemented")}
  async disconnect(){}
  async sendMessage(message){return{ok:false,message}}
  async getCapabilities(){return{comments:false,joins:false,leaves:false,gifts:false,likes:false,follows:false,sendMessage:false}}
  onComment(handler){}
  onJoin(handler){}
  onLeave(handler){}
  onGift(handler){}
  onLike(handler){}
  onFollow(handler){}
  onLiveState(handler){}
}

class MockLiveProvider extends LiveProvider{
  constructor(){super();this.handlers={comment:[],join:[],leave:[],gift:[],like:[],follow:[],live:[]}}
  async connect(){this.emit("live",{state:"connected",mode:"mock"});return{ok:true,mode:"mock"}}
  async disconnect(){this.emit("live",{state:"disconnected"});return{ok:true}}
  async sendMessage(message){return{ok:true,message,mock:true}}
  async getCapabilities(){return{comments:true,joins:true,leaves:true,gifts:true,likes:true,follows:false,sendMessage:true,mock:true}}
  onComment(h){this.handlers.comment.push(h)}
  onJoin(h){this.handlers.join.push(h)}
  onLeave(h){this.handlers.leave.push(h)}
  onGift(h){this.handlers.gift.push(h)}
  onLike(h){this.handlers.like.push(h)}
  onFollow(h){this.handlers.follow.push(h)}
  onLiveState(h){this.handlers.live.push(h)}
  emit(type,payload){(this.handlers[type]||[]).forEach(h=>h(payload))}
}

class SpoonLiveProvider extends LiveProvider{
  constructor(){
    super();
    this.handlers={comment:[],join:[],leave:[],gift:[],like:[],follow:[],live:[]};
    this.es=null;
    this.connected=false;
  }
  async status(){
    const r=await fetch("/api/status",{cache:"no-store"});
    if(!r.ok)throw new Error("gateway status "+r.status);
    return r.json();
  }
  async connect(){
    const st=await this.status();
    if(!st.configured)throw new Error("Spoon API設定が未完了です");
    if(!st.authenticated)throw new Error("Spoon連携が必要です");
    if(!this.es){
      this.es=new EventSource("/api/events");
      const bind=(name)=>this.es.addEventListener(name,e=>this.route(name,this.parse(e.data)));
      ["chat","presence","like","donation","end","live_state","gateway","message"].forEach(bind);
      this.es.addEventListener("error",e=>this.emit("live",{state:"gateway_error",detail:e}));
    }
    const r=await fetch("/api/live/connect",{method:"POST"});
    if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||"LIVE接続に失敗しました");
    this.connected=true;
    this.emit("live",{state:"connecting"});
    return{ok:true,mode:"spoon"};
  }
  async disconnect(){
    await fetch("/api/live/disconnect",{method:"POST"}).catch(()=>{});
    this.es?.close();this.es=null;this.connected=false;
    this.emit("live",{state:"disconnected"});
    return{ok:true};
  }
  async sendMessage(message){
    const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||"チャット送信に失敗しました");
    return data;
  }
  async getCapabilities(){
    const s=await this.status();
    return{...(s.capabilities||{}),authenticated:s.authenticated,configured:s.configured,mock:false};
  }
  onComment(h){this.handlers.comment.push(h)}
  onJoin(h){this.handlers.join.push(h)}
  onLeave(h){this.handlers.leave.push(h)}
  onGift(h){this.handlers.gift.push(h)}
  onLike(h){this.handlers.like.push(h)}
  onFollow(h){this.handlers.follow.push(h)}
  onLiveState(h){this.handlers.live.push(h)}
  emit(type,payload){(this.handlers[type]||[]).forEach(h=>h(payload))}
  parse(v){try{return JSON.parse(v)}catch{return{raw:v}}}
  route(name,payload){
    const type=String(name||payload?.type||payload?.event||"").toLowerCase();
    if(type==="chat"){this.emit("comment",payload);return}
    if(type==="presence"){
      const action=String(payload?.action||payload?.state||payload?.presence||payload?.type||"").toLowerCase();
      if(action.includes("leave")||action.includes("exit"))this.emit("leave",payload);
      else this.emit("join",payload);
      return;
    }
    if(type==="donation"){this.emit("gift",payload);return}
    if(type==="like"){this.emit("like",payload);return}
    if(type==="end"){this.emit("live",{state:"ended",payload});return}
    if(type==="live_state"){this.emit("live",payload);return}
  }
}

window.LiveProvider=LiveProvider;
window.MockLiveProvider=MockLiveProvider;
window.SpoonLiveProvider=SpoonLiveProvider;
