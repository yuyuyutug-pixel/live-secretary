const Store={
  key:"live-secretary-v2",
  legacyKey:"live-secretary-v1",
  load(){
    try{
      const current=localStorage.getItem(this.key);
      if(current)return JSON.parse(current)||{};
      const legacy=localStorage.getItem(this.legacyKey);
      if(legacy){const v=JSON.parse(legacy)||{};localStorage.setItem(this.key,JSON.stringify(v));return v}
      return{};
    }catch{return{}}
  },
  save(v){localStorage.setItem(this.key,JSON.stringify({...this.load(),...v}))},
  addSession(session){
    const d=this.load(), sessions=[session,...(d.sessions||[])].slice(0,10);
    this.save({sessions,lastSession:session});
    return sessions;
  },
  clear(){localStorage.removeItem(this.key)}
};
window.Store=Store;