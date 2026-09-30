// Spoon Developers正式API公開後は、このアダプターだけを公式仕様へ差し替える。
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
  async connect(){this.emit("live",{state:"connected"});return{ok:true,mode:"mock"}}
  async disconnect(){this.emit("live",{state:"disconnected"});return{ok:true}}
  async sendMessage(message){return{ok:true,message}}
  async getCapabilities(){return{comments:true,joins:true,leaves:true,gifts:true,likes:true,follows:true,sendMessage:true,mock:true}}
  onComment(h){this.handlers.comment.push(h)}
  onJoin(h){this.handlers.join.push(h)}
  onLeave(h){this.handlers.leave.push(h)}
  onGift(h){this.handlers.gift.push(h)}
  onLike(h){this.handlers.like.push(h)}
  onFollow(h){this.handlers.follow.push(h)}
  onLiveState(h){this.handlers.live.push(h)}
  emit(type,payload){(this.handlers[type]||[]).forEach(h=>h(payload))}
}
window.LiveProvider=LiveProvider;
window.MockLiveProvider=MockLiveProvider;