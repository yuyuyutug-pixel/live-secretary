const Store={
  key:"live-secretary-v3",
  legacyKeys:["live-secretary-v2","live-secretary-v1"],
  load(){
    try{
      const current=localStorage.getItem(this.key);
      if(current)return JSON.parse(current)||{};
      for(const k of this.legacyKeys){
        const raw=localStorage.getItem(k);
        if(raw){const v=JSON.parse(raw)||{};localStorage.setItem(this.key,JSON.stringify(v));return v}
      }
      return{};
    }catch{return{}}
  },
  save(v){localStorage.setItem(this.key,JSON.stringify({...this.load(),...v}))},
  addSession(session){
    const d=this.load(),sessions=[session,...(d.sessions||[])].slice(0,30);
    this.save({sessions,lastSession:session});
    return sessions;
  },
  trackUse({kind="topic",category="その他",text=""}={}){
    if(!text)return;
    const d=this.load();
    const usage={...(d.usage||{})};
    const catKey=category||"その他";
    usage[catKey]=(usage[catKey]||0)+1;
    const contentUsage={...(d.contentUsage||{})};
    const id=this.contentId(kind,catKey,text);
    contentUsage[id]=(contentUsage[id]||0)+1;
    const recent=[{id,kind,category:catKey,text,at:new Date().toISOString()},...(d.recentContent||[]).filter(x=>x.id!==id)].slice(0,30);
    this.save({usage,contentUsage,recentContent:recent});
  },
  contentId(kind,category,text){
    let h=2166136261;
    const s=`${kind}|${category}|${text}`;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(36);
  },
  toggleFavorite(item){
    const d=this.load(),favorites=[...(d.favorites||[])];
    const id=item.id||this.contentId(item.kind,item.category,item.text);
    const i=favorites.findIndex(x=>x.id===id);
    if(i>=0){favorites.splice(i,1);this.save({favorites});return false}
    favorites.unshift({...item,id,at:new Date().toISOString()});
    this.save({favorites:favorites.slice(0,100)});
    return true;
  },
  isFavorite(item){
    const id=item.id||this.contentId(item.kind,item.category,item.text);
    return (this.load().favorites||[]).some(x=>x.id===id);
  },
  favorites(){return this.load().favorites||[]},
  recent(){return this.load().recentContent||[]},
  usageRanking(limit=5){
    const usage=this.load().usage||{};
    return Object.entries(usage).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([category,count],i)=>({rank:i+1,category,count}));
  },
  topContent(limit=5){
    const d=this.load(),m=d.contentUsage||{},all=[...(d.recentContent||[]),...(d.favorites||[])];
    const byId={};for(const x of all)byId[x.id]=x;
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id,count],i)=>({rank:i+1,count,...(byId[id]||{id,text:"利用コンテンツ",category:""})}));
  },
  clear(){localStorage.removeItem(this.key)}
};
window.Store=Store;