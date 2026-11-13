const {randomInt,randomUUID} = require('node:crypto');

const districts = [
  'الشامية', 'سلوى', 'العدان', 'العيون', 'المنصورية',
  'جزيرة فيلكا', 'قرطبة', 'القصر', 'السالمية', 'حولي',
  'الرميثية', 'ضاحية عبدالله السالم', 'الشويخ', 'القادسية', 'الجابرية',
  'خيطان', 'الروضة', 'كيفان', 'الجهراء', 'الفروانية',
  'العارضية', 'الأحمدي', 'الفحيحيل', 'صباح السالم', 'المنقف'
];
const votes = [[0,10],[20,10],[40,12],[60,12],[80,12],[120,8],[180,6],[250,4],[300,3],[500,2]];
const definitions = {
  rest:['استريح',3,'يوقف المستهدف عن دوره القادم والسحب.'],
  swap:['بدل',8,'يُقفل منطقتين ويسجّل مجموعهما لكل طرف.'],
  exchange:['اطحس',2,'بدّل يدك مع يد الخصم.'],
  inspect:['تفتيش',2,'اعرض يد الخصم لك وحدك.'],
  mute:['اقطع المايك',2,'يمنع الكلام 3 أدوار.'],
  steal:['ما تستاهلها',2,'انقل منطقة مفتوحة بكل ما عليها.'],
  burnCard:['احرق ورقة',3,'احرق كرتًا مقلوبًا من يد الخصم.'],
  burn100:['احرق 100',3,'احرق أصواتًا بقيمة 100 أو أكثر حسب المتاح.'],
  burn200:['احرق 200',2,'احرق أصواتًا بقيمة 200 أو أكثر حسب المتاح.'],
  burn300:['احرق 300',1,'احرق أصواتًا بقيمة 300 أو أكثر حسب المتاح.'],
  strip:['رفع الحصانة',1,'يزيل الحصانة المتراكمة.'],
  confidence:['طرح الثقة',1,'يفتح تصويت طرد في الدورات الوسطى.'],
  restrict:['سحب صلاحيات',1,'يمنع الخصم من مهاجمتك لنهاية الدورة.'],
  fee:['رسوم التسجيل',1,'يطلب 100 صوت أو المتاح من كل خصم مؤهل.'],
  breakSwap:['كسر البدل',3,'أوقف عرض البدل قبل اعتماده.'],
  redirectSwap:['بدل غير مرشح',3,'استبعد الشريك الحالي من عرض البدل.'],
  cancel:['صعبة عليك',6,'ألغِ أمرًا أو ردًا موجهًا لك.'],
  aid:['ازهلها',3,'تدخل دفاعًا عن مرشح آخر.'],
  reverse:['وحدة بوحدة',2,'اعكس الهجوم على المهاجم.'],
  immunity:['حصانة',2,'تحميك 3 جولات وتتراكم مع التكرار.'],
  double:['دبل الصناديق',1,'ضاعف حصيلة منطقة مفتوحة.'],
  protect:['بالحفظ والصون',2,'يمنع حرق أصوات المنطقة من خصم.'],
  secret:['جلسة سرية',1,'اعرض القيد الكامل لك وحدك لمدة 60 ثانية.'],
  resign:['استقالة',1,'سجّل حصيلة مناطقك واخرج حتى الدورة التالية.'],
  extraDraw:['اسحب بطاقتين إضافيتين',7,'اسحب كرتين بحركة واحدة.'],
  extraMove:['زيادة لعبة',3,'أضف حركة قبل نفاد الحركات الأصلية.'],
  recover:['راحت عليكم',1,'خذ كرتًا من الساحة المكشوفة.'],
  count:['فرز الصناديق',1,'ينهي الدورة الوسطى ويسجّل الحصيلة.'],
  adjourn:['رفع الجلسة',1,'ينهي الدورة الوسطى ويلغي الحصيلة غير المسجلة.'],
  joker:['البشت',1,'اختر الكرت الذي يقلده البشت.']
};
const attacks = ['rest','exchange','inspect','mute','steal','burnCard','burn100','burn200','burn300','strip','confidence','restrict'];
const responses = ['breakSwap','redirectSwap','cancel','aid','reverse'];
const limits = {3:8,4:6,5:5,6:4};
const turnDuration=60_000;
const moveDurations=[15,30,45,60,90,120];
const decisionDuration=30_000;
const intermissionDuration=15_000;
const reactionDuration=5_000;
const reactionCooldown=3_000;
const reactions=new Set(['clap','wow','gg','thinking']);
const isAuto = s => s.mode==='auto';
const isHost = (s,actor) => isAuto(s)&&actor.id===s.host?.id;
const moveDuration = s => moveDurations.includes(s.moveDuration)?s.moveDuration:turnDuration/1000;
const amount = card => typeof card.as==='number' ? card.as : card.value;
const nameOf = card => amount(card)===undefined ? definitions[card.as || card.key][0] : amount(card)+' أصوات';
function cardInfo(card){
  const value=amount(card);
  const key=value!==undefined?'vote':card.as||card.key;
  return {id:card.id,key,name:nameOf(card),value,
    description:key==='vote'?'أضف الأصوات إلى منطقة مفتوحة.':definitions[key][2]};
}
const player = (s,id) => s.players.find(p=>p.id===id);
const region = (p,id) => p.regions.find(r=>r.id===id);
const open = p => p.regions.filter(r=>!r.locked);
const votesIn = r => r.cards.filter(c=>amount(c)!==undefined);
const regionScore = r => votesIn(r).reduce((sum,c)=>sum+amount(c),0)*(r.cards.some(c=>(c.as||c.key)==='double')?2:1);
const boardScore = p => open(p).reduce((sum,r)=>sum+regionScore(r),0);
const protectedRegion = r => r.cards.some(c=>(c.as||c.key)==='protect');
const middle = s => s.cycle>1 && s.cycle<s.cycles;
const immune = p => p.immunity>0;
const assert = (ok,message='هذه الحركة غير متاحة.') => {if(!ok) throw new Error(message)};
function shuffled(list){
  for(let i=list.length-1;i>0;i--){
    const j=randomInt(i+1);
    [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
}
function deck(){
  const cards=[];
  for(const [value,quantity] of votes) for(let i=0;i<quantity;i++) cards.push({id:randomUUID(),key:'vote',value});
  for(const [key,[,quantity]] of Object.entries(definitions)) for(let i=0;i<quantity;i++) cards.push({id:randomUUID(),key});
  return shuffled(cards);
}
function rows(s,value){
  return s.players.map(p=>({id:p.id,name:p.name,score:value(p)})).sort((a,b)=>b.score-a.score);
}
function record(s,p,kind,points){
  s.entries.push({cycle:s.cycle,id:p.id,name:p.name,kind,points});
  p.points+=points;
}
function finish(s,countBoard=true){
  for(const p of s.players){
    if(countBoard&&!p.out) record(s,p,'فرز المناطق',boardScore(p));
    if(p.penalty) record(s,p,'عقوبة',-p.penalty);
    p.total+=p.points;
  }
  s.results.push({cycle:s.cycle,rows:rows(s,p=>p.points)});
  s.phase=s.cycle===s.cycles?'finished':'intermission';
  s.pending=null;
  s.turn=null;
  s.moves=0;
  s.notice='تم فرز الدورة '+s.cycle;
}
function draw(s,p,count){ p.hand.push(...s.deck.splice(0,count)); }
function discard(s,card){ s.discard.push(card); }
function take(list,id){
  const i=list.findIndex(c=>c.id===id);
  assert(i>=0,'الكرت غير موجود.');
  return list.splice(i,1)[0];
}
function advance(s,now=Date.now()){
  const previous=player(s,s.turn);
  if(previous){
    while(previous.hand.length>7) discard(s,previous.hand.splice(randomInt(previous.hand.length),1)[0]);
    previous.mute=Math.max(0,previous.mute-1);
  }
  if(!s.deck.length || s.players.every(p=>p.out)){finish(s);return;}
  const cursor=s.players.findIndex(p=>p.id===s.turn);
  for(let step=1;step<=s.players.length*2;step++){
    const p=s.players[(cursor+step)%s.players.length];
    if(p.out) continue;
    p.immunity=Math.max(0,p.immunity-1);
    if(p.rest){p.rest--;p.mute=Math.max(0,p.mute-1);continue;}
    s.turn=p.id;
    s.turnAt=now;
    s.moves=3;
    s.baseMoves=3;
    s.notice='الدور على '+p.name;
    draw(s,p,2);
    return;
  }
  finish(s);
}
function cycle(s,now=Date.now()){
  s.cycle++;
  s.phase='playing';
  s.deck=deck();
  s.discard=[];
  s.pending=null;
  s.paused=false;
  for(const p of s.players){
    Object.assign(p,{regions:p.districts.map(id=>({id,name:districts[id],cards:[],locked:false})),hand:[],
      points:0,penalty:0,violations:0,immunity:0,rest:0,mute:0,out:false,restricted:[],secretUntil:0,inspection:null});
    draw(s,p,5);
  }
  s.turn=s.players[(s.first+s.cycle-2+s.players.length)%s.players.length].id;
  delete s.nextAt;
  delete s.turnPausedAt;
  advance(s,now);
}
function start(s,actor,a={}){
  assert(actor&&(isAuto(s)?isHost(s,actor):actor.id===s.judge.id),
    isAuto(s)?'صاحب الغرفة يبدأ المباراة.':'الحكم يبدأ المباراة.');
  assert(s.phase==='lobby'&&limits[s.players.length],'يحتاج اللعب من 3 إلى 6 مرشحين.');
  if(a.order?.length){
    assert(a.order.length===s.players.length&&new Set(a.order).size===s.players.length&&a.order.every(id=>player(s,id)));
    s.players=a.order.map(id=>player(s,id));
  }
  const first=a.first?s.players.findIndex(p=>p.id===a.first):0;
  assert(first>=0);
  for(const p of s.players) p.districts=(p.districts??[]).slice(0,limits[s.players.length]);
  const pool=shuffled(districts.map((_,id)=>id).filter(id=>!s.players.some(p=>p.districts.includes(id))));
  for(const p of s.players){
    p.districts.push(...pool.splice(0,limits[s.players.length]-p.districts.length));
    p.total=0;
  }
  Object.assign(s,{first,cycle:0,cycles:s.players.length,results:[],entries:[]});
  cycle(s);
}

function field(name,label,items,multiple=false){return {name,label,options:items,multiple};}
const option=(value,label)=>({value,label});
const targets=(s,p,fn)=>s.players.filter(q=>q.id!==p.id&&!q.out&&fn(q));
const playerField=(name,label,ps)=>field(name,label,ps.map(p=>option(p.id,p.name)));
const regionField=(name,label,rs)=>field(name,label,rs.map(r=>option(r.id,r.name)));
const choice=(label,type,fields=[],params={})=>({label,type,fields,...params});
const isFieldValue=(f,val)=> f.multiple ? Array.isArray(val)&&new Set(val).size===val.length&&val.every(v=>f.options.some(o=>o.value===v)) : f.options.some(o=>o.value===val);
function findChoice(choices,a){
  return choices.find(c=>c.type===a.type&&c.card===a.card&&c.as===a.as&&
    c.fields.every(f=>isFieldValue(f,a[f.name])));
}
function forPlay(s,p,card,key,as){
  if(key==='vote'&&card.key==='joker'&&!votes.some(([value])=>value===as))return [];
  if(key!=='vote'&&(!Object.hasOwn(definitions,key)||key==='joker'))return [];
  const param={card:card.id,...(as===undefined?{}:{as})};
  const label=key==='vote'?(as??card.value)+' أصوات':definitions[key][0];
  const description=definitions[key]?.[2];
  const make=(fields=[])=>fields.every(f=>f.options.length)?[choice(label,'play',fields,{...param,description})]:[];
  const rs=open(p);
  if(key==='vote')return make([regionField('region','المنطقة',rs.filter(r=>votesIn(r).length<4))]);
  if(key==='double'||key==='protect')return make([regionField('region','المنطقة',rs.filter(r=>!r.cards.some(c=>(c.as||c.key)===key)))]);
  if(key==='swap')return make([regionField('region','منطقتك',rs.filter(r=>votesIn(r).length)),playerField('target','شريك البدل',targets(s,p,q=>open(q).some(r=>votesIn(r).length)))]);
  if(key==='recover')return make([field('from','الكرت في الساحة',s.discard.map(c=>option(c.id,nameOf(c))))]);
  if(key==='extraMove'&&!s.baseMoves)return [];
  if(['count','adjourn','confidence'].includes(key)&&!middle(s))return [];
  if(responses.includes(key))return [];
  if(attacks.includes(key)){
    return make([playerField('target','المستهدف',targets(s,p,q=>!p.restricted.includes(q.id)&&(key==='strip'?immune(q):!immune(q))))]);
  }
  return make();
}
function playChoices(s,p){
  if(s.turn!==p.id||!s.moves||p.out)return [];
  return p.hand.flatMap(c=>c.key==='joker'
    ? [...votes.map(([v])=>v),...Object.keys(definitions).filter(k=>k!=='joker')].flatMap(as=>forPlay(s,p,c,typeof as==='number'?'vote':as,as))
    : forPlay(s,p,c,c.key));
}
function bankActions(s,p){
  if(p.out||s.turn!==p.id) return [];
  const result=[choice('إنهاء الدور','end')];
  if(s.moves) for(const r of open(p)) for(const c of votesIn(r)){
    result.push(choice('حرق '+amount(c)+' من '+r.name,'ownBurn',[],{card:c.id,region:r.id}));
    const destinations=open(p).filter(q=>q!==r&&votesIn(q).length<4);
    if(destinations.length) result.push(choice('نقل '+amount(c)+' من '+r.name,'move',[regionField('to','المنطقة الجديدة',destinations)],{card:c.id,region:r.id}));
  }
  return result;
}
function spend(s,bonus=false){
  if(bonus){s.moves++;return;}
  s.moves--;
  s.baseMoves=Math.max(0,s.baseMoves-1);
}
function discardPlay(s,card){
  if(card.key==='joker') delete card.as;
  discard(s,card);
}
function response(s,key,source,target,params={}){
  s.pending={kind:'response',id:randomUUID(),key,source,target,direction:0,effective:true,
    lastTarget:target,played:[],passed:[],...params};
  s.notice='بانتظار الرد على '+definitions[key][0];
}
function actualCard(p,a){return p.hand.find(c=>c.id===a.card);}
function use(s,p,a){
  const original=actualCard(p,a);
  assert(original,'هذا الكرت ليس في يدك.');
  const match=findChoice(forPlay(s,p,original,original.key==='joker'?
    typeof a.as==='number'?'vote':a.as:original.key,original.key==='joker'?a.as:undefined),a);
  const card=take(p.hand,a.card);
  if(!match){
    spend(s);
    discardPlay(s,card);
    s.notice='احترق كرت '+nameOf(card)+' بسبب توقيت أو هدف غير صالح.';
    return;
  }
  if(card.key==='joker') card.as=a.as;
  const key=amount(card)!==undefined?'vote':card.as||card.key;
  spend(s,key==='extraMove');
  s.notice=p.name+' لعب '+nameOf(card);
  if(['vote','double','protect'].includes(key)){
    region(p,a.region).cards.push(card);
    return;
  }
  discard(s,card);
  if(attacks.includes(key)){
    response(s,key,p.id,a.target);
    return;
  }
  if(key==='swap'){
    s.pending={kind:'swap',id:randomUUID(),source:p.id,target:a.target,region:a.region,excluded:[],passed:[],accepted:null};
    return;
  }
  if(key==='fee'){
    const due=targets(s,p,q=>!immune(q)&&!p.restricted.includes(q.id)).map(q=>q.id);
    nextFee(s,p.id,due);
    return;
  }
  if(key==='immunity')p.immunity+=3;
  if(key==='secret')p.secretUntil=Date.now()+60000;
  if(key==='extraDraw')draw(s,p,2);
  if(key==='recover'){
    const recovered=take(s.discard,a.from);
    if(recovered.key==='joker') delete recovered.as;
    p.hand.push(recovered);
  }
  if(key==='resign'){
    record(s,p,'استقالة',boardScore(p));
    exitCycle(s,p,'استقال');
    advance(s);
  }
  if(key==='count'||key==='adjourn')finish(s,key==='count');
}
function exitCycle(s,p,reason){
  p.out=reason;
  for(const c of p.hand) discard(s,c);
  p.hand=[];
  for(const r of p.regions) if(!r.locked) r.cards.splice(0).forEach(c=>discard(s,c));
}
function eligibleVotes(p,protect){
  return open(p).filter(r=>!protect||!protectedRegion(r)).flatMap(r=>votesIn(r).map(c=>({r,c})));
}
function removeVotes(s,p,ids,minimum,protect){
  const eligible=eligibleVotes(p,protect);
  const available=eligible.reduce((sum,{c})=>sum+amount(c),0);
  const chosen=eligible.filter(({c})=>ids.includes(c.id));
  assert(available<minimum?chosen.length===eligible.length:chosen.reduce((sum,{c})=>sum+amount(c),0)>=minimum,
    available<minimum?'اختر كل الأصوات المتاحة.':'اختر أصواتًا بمجموع '+minimum+' أو أكثر.');
  return chosen.map(({r,c})=>take(r.cards,c.id));
}
function nextFee(s,source,due){
  if(!due.length){s.pending=null;return;}
  response(s,'fee',source,due[0],{due:due.slice(1)});
}
function canRespond(p,t){
  if(p.out||t.passed.includes(p.id))return false;
  if(p.id===t.lastTarget)return true;
  return !p.rest&&p.id!==t.source&&p.id!==t.target;
}
function responseCards(p,key){
  return p.hand.filter(c=>c.key===key||c.key==='joker');
}
function responseChoices(p,t){
  if(!canRespond(p,t))return [];
  const choices=[choice('مرّر الرد','pass')];
  const side=p.id===t.lastTarget?t.lastTarget:(t.lastTarget===t.source?t.source:t.target);
  const allowed=p.id===t.lastTarget?['cancel']:['aid'];
  if(!t.swap&&!t.due&&p.id===t.target&&!t.played.length)allowed.push('reverse');
  for(const key of allowed){
    if(t.played.some(c=>c.side===side&&c.key===key))continue;
    for(const card of responseCards(p,key))
      choices.push(choice(definitions[key][0],'respond',[],{
        card:card.id,...(card.key==='joker'?{as:key}:{}),...(key==='aid'?{response:t.id,side}:{})
      }));
  }
  return choices;
}
function consumeResponse(s,p,a){
  const card=take(p.hand,a.card);
  if(card.key==='joker')card.as=a.as;
  discard(s,card);
  return card.as||card.key;
}
function eligibleSwapIntervention(s,p,t){
  return !p.out&&!p.rest&&!immune(player(s,t.source))&&p.id!==t.source&&p.id!==t.target&&!t.passed.includes(p.id);
}
function completeSwap(s,t){
  const p=player(s,t.source),q=player(s,t.target);
  const own=region(p,t.region),other=region(q,t.accepted);
  const points=regionScore(own)+regionScore(other);
  own.locked=other.locked=true;
  record(s,p,'بدل',points);
  record(s,q,'بدل',points);
  s.notice='تم تسجيل البدل · '+points+' لكل طرف';
  s.pending=null;
}
function maybeSwap(s,t){
  if(t.accepted!==null&&(isAuto(s)||!s.players.some(p=>eligibleSwapIntervention(s,p,t))))completeSwap(s,t);
}
function swapAcceptance(p,t){
  return choice('قبول البدل','accept',[regionField('region','المنطقة المعروضة',open(p).filter(r=>votesIn(r).length))],{offer:t.id});
}
function swapChoices(s,p,t){
  const out=[];
  if(p.id===t.target&&t.accepted===null){
    out.push(swapAcceptance(p,t),choice('رفض البدل','decline'));
  }
  const eligible=eligibleSwapIntervention(s,p,t);
  if(eligible||p.id===t.target&&t.accepted===null){
    for(const key of ['breakSwap','redirectSwap']) for(const card of responseCards(p,key))
      out.push(choice(definitions[key][0],'intervene',[],{offer:t.id,card:card.id,...(card.key==='joker'?{as:key}:{})}));
  }
  if(eligible)out.push(choice('لا أتدخل','pass'));
  return out;
}
function applySwap(s,p,t,a){
  if(a.type==='accept'){
    t.accepted=a.region;
    s.notice='قُبل العرض وبانتظار حسم التدخلات.';
    maybeSwap(s,t);
  }
  if(a.type==='decline'){s.pending=null;s.notice='رُفض البدل.';}
  if(a.type==='pass'){
    t.passed.push(p.id);
    maybeSwap(s,t);
  }
  if(a.type==='intervene'){
    const key=consumeResponse(s,p,a);
    if(p.id===t.target){
      s.pending=null;
      s.notice='احترق كرت الرد واحتُسب رفضًا للبدل.';
      return;
    }
    response(s,key,p.id,t.source,{swap:t});
  }
}
function resolveResponse(s,t,now=Date.now()){
  if(t.swap){
    if(!t.effective){
      s.pending=t.swap;
      s.pending.passed=[];
      maybeSwap(s,s.pending);
    }else if(t.key==='breakSwap'){
      s.pending=null;
      s.notice='انكسر البدل.';
    }else{
      const swap=t.swap;
      swap.excluded.push(swap.target);
      const p=player(s,swap.source);
      if(targets(s,p,q=>!swap.excluded.includes(q.id)&&open(q).some(r=>votesIn(r).length)).length){
        s.pending={kind:'redirect',swap};
        s.notice='اختر شريكًا آخر للبدل.';
      }else{
        s.pending=null;
        s.notice='احترق البدل لعدم توفر شريك آخر.';
      }
    }
    return;
  }
  if(!t.effective){
    s.notice='أُلغي '+definitions[t.key][0]+'.';
    if(t.due)nextFee(s,t.source,t.due);else s.pending=null;
    return;
  }
  const source=player(s,t.direction?t.target:t.source);
  const target=player(s,t.direction?t.source:t.target);
  s.pending=null;
  const key=t.key;
  s.notice='تم تنفيذ '+definitions[key][0];
  if(key==='rest'){
    if(t.direction)advance(s,now);else target.rest=Math.max(1,target.rest);
  }
  if(key==='exchange')[source.hand,target.hand]=[target.hand,source.hand];
  if(key==='inspect')source.inspection={name:target.name,hand:target.hand.map(cardInfo),until:Date.now()+60000};
  if(key==='mute')target.mute+=3;
  if(key==='strip')target.immunity=0;
  if(key==='restrict'&&!target.restricted.includes(source.id))target.restricted.push(source.id);
  if(key==='confidence')s.pending={kind:'vote',target:target.id,votes:{}};
  if(key==='steal'&&open(target).length)s.pending={kind:'steal',chooser:source.id,target:target.id};
  if(key==='burnCard'&&target.hand.length)s.pending={kind:'burnCard',chooser:source.id,target:target.id};
  if(key.startsWith('burn')&&key!=='burnCard'&&eligibleVotes(target,true).length)
    s.pending={kind:'burnVotes',chooser:(t.direction?source:target).id,target:target.id,minimum:Number(key.slice(4))};
  if(key==='fee'){
    if(eligibleVotes(target,false).length)
      s.pending={kind:'pay',chooser:target.id,target:target.id,source:source.id,due:t.due,minimum:100};
    else nextFee(s,t.source,t.due);
  }
}
function applyResponse(s,p,t,a){
  if(a.type==='accept'){
    t.swap.accepted=a.region;
    s.notice='القبول والتدخل بانتظار قرار الحكم.';
    return;
  }
  if(a.type==='pass')t.passed.push(p.id);
  if(a.type==='respond'){
    const key=consumeResponse(s,p,a);
    const side=t.lastTarget;
    t.played.push({side,key,actor:p.id});
    if(key==='reverse'){
      t.direction=1;
      t.lastTarget=t.source;
    }else{
      t.effective=!t.effective;
      t.lastTarget=side===t.source?t.target:t.source;
    }
    t.passed=[];
    s.notice=p.name+' لعب '+definitions[key][0];
  }
  if((isAuto(s)||!(t.swap&&t.swap.accepted!==null))&&!s.players.some(q=>responseChoices(q,t).some(c=>c.type==='respond')))resolveResponse(s,t);
}
function pendingChoices(s,p,t){
  if(!p||p.out)return [];
  if(t.kind==='swap')return swapChoices(s,p,t);
  if(t.kind==='response'){
    const result=responseChoices(p,t);
    if(t.swap&&t.swap.target===p.id&&t.swap.accepted===null)result.push(swapAcceptance(p,t.swap));
    return result;
  }
  if(t.kind==='redirect'){
    if(t.swap.source!==p.id)return [];
    return [choice('عرض البدل','redirect',[playerField('target','الشريك الجديد',targets(s,p,q=>!t.swap.excluded.includes(q.id)&&open(q).some(r=>votesIn(r).length)))]),choice('التنازل عن البدل','decline')];
  }
  if(t.kind==='vote')return Object.hasOwn(t.votes,p.id)?[]:[choice('صوّت على طرح الثقة','confidenceVote',[
    field('vote','تصويتك',[option(true,'مع الطرد'),option(false,'ضد الطرد')])])];
  if(p.id!==t.chooser)return [];
  const target=player(s,t.target);
  if(t.kind==='steal')return [choice('خذ منطقة','steal',[regionField('region','المنطقة',open(target))])];
  if(t.kind==='burnCard')return [choice('احرق كرتًا مقلوبًا','burnCard',[field('index','موقع الكرت',target.hand.map((_,i)=>option(i,'كرت '+(i+1))))])];
  if(t.kind==='burnVotes'||t.kind==='pay'){
    const items=eligibleVotes(target,t.kind==='burnVotes').map(({r,c})=>option(c.id,r.name+' · '+amount(c)));
    return [choice((t.kind==='pay'?'سلّم':'احرق')+' '+t.minimum+' صوت أو المتاح',t.kind,[field('cards','اختر الأصوات',items,true)])];
  }
  if(t.kind==='allocate')return [choice('ضع '+amount(t.cards[0])+' صوت','allocate',[regionField('region','المنطقة',open(p).filter(r=>votesIn(r).length<4))])];
  return [];
}
function startAllocation(s,t,cards){
  const source=player(s,t.source);
  if(!cards.length||!open(source).some(r=>votesIn(r).length<4)){
    cards.forEach(c=>discard(s,c));
    nextFee(s,t.source,t.due);
    return;
  }
  s.pending={kind:'allocate',source:t.source,chooser:t.source,target:t.target,due:t.due,cards};
}
function applyPending(s,p,t,a){
  if(t.kind==='response'){applyResponse(s,p,t,a);return;}
  if(t.kind==='swap'){applySwap(s,p,t,a);return;}
  if(t.kind==='redirect'){
    if(a.type==='decline'){s.pending=null;return;}
    s.pending={...t.swap,id:randomUUID(),target:a.target,passed:[],accepted:null};
    return;
  }
  if(t.kind==='vote'){
    t.votes[p.id]=a.vote;
    const electorate=s.players.filter(q=>!q.out);
    if(electorate.every(q=>Object.hasOwn(t.votes,q.id))){
      if(Object.values(t.votes).filter(Boolean).length>electorate.length/2)exitCycle(s,player(s,t.target),'مطرود');
      s.pending=null;
    }
    return;
  }
  const target=player(s,t.target);
  if(t.kind==='steal'){
    const index=target.regions.findIndex(r=>r.id===a.region);
    p.regions.push(target.regions.splice(index,1)[0]);
    s.pending=null;
  }
  if(t.kind==='burnCard'){
    discard(s,target.hand.splice(a.index,1)[0]);
    s.pending=null;
  }
  if(t.kind==='burnVotes'){
    removeVotes(s,target,a.cards,t.minimum,true).forEach(c=>discard(s,c));
    s.pending=null;
  }
  if(t.kind==='pay')startAllocation(s,t,removeVotes(s,target,a.cards,t.minimum,false));
  if(t.kind==='allocate'){
    region(p,a.region).cards.push(t.cards.shift());
    startAllocation(s,t,t.cards);
  }
}
const pendingLabels={
  response:'بانتظار الردود',swap:'بانتظار حسم البدل',redirect:'بانتظار اختيار شريك آخر',
  vote:'تصويت طرح الثقة',steal:'بانتظار اختيار المنطقة',burnCard:'بانتظار اختيار الكرت',
  burnVotes:'بانتظار اختيار الأصوات',pay:'بانتظار دفع رسوم التسجيل',allocate:'بانتظار توزيع الأصوات'
};
function judgeChoices(s){
  if(s.phase==='lobby'){
    const first=playerField('first','أول مرشح',s.players);
    const actions=limits[s.players.length]?[choice('بدء المباراة','start',[first])]:[];
    if(s.players.length>1)actions.push(choice('رتّب المقاعد','reorder',[
      playerField('target','المرشح',s.players),field('seat','ترتيب المقعد',s.players.map((_,i)=>option(i,i+1)))
    ]));
    if(isAuto(s))actions.push(choice('غيّر وقت الحركة','setMoveDuration',[
      field('seconds','الوقت لكل حركة',moveDurations.map(seconds=>option(seconds,seconds+' ثانية')))
    ]));
    return actions;
  }
  if(s.phase==='intermission')return [choice('ابدأ الدورة التالية','next')];
  if(s.phase!=='playing')return [];
  const pause=choice(s.paused?'استئناف اللعب':'إيقاف اللعب مؤقتًا',s.paused?'resume':'pause');
  const penaltyTarget=playerField('target','المرشح',s.players);
  const adjustments=[
    choice('سجّل عقوبة','penalty',[penaltyTarget]),
    choice('عدّل مجموع العقوبة','adjustPenalty',[penaltyTarget,
      field('points','مجموع الخصم',Array.from({length:31},(_,i)=>option(i*100,i*100)))]),
    choice('ارفع العقوبة','clearPenalty',[penaltyTarget]),
    choice('طرد حتى الدورة التالية','expel',[penaltyTarget])
  ];
  if(s.paused)return [pause,...adjustments];
  const choices=[pause,...adjustments];
  if(s.pending){
    if(s.pending.kind==='response'||s.pending.kind==='swap'&&s.pending.accepted!==null)
      choices.push(choice('اعتمد الردود الحالية','resolve'));
    if(s.pending.kind==='response'&&s.pending.swap?.accepted!=null)
      choices.push(choice('اعتمد قبول البدل أولًا','acceptFirst'));
    choices.push(choice('إلغاء الإجراء المعلّق','void'));
  }else if(Date.now()-s.turnAt>=turnDuration)choices.push(choice('إنهاء الدور بعد 60 ثانية','forceEnd'));
  return choices;
}
function choices(s,actor){
  if(!isAuto(s)&&actor.id===s.judge.id)return judgeChoices(s);
  const p=player(s,actor.id);
  if(!p)return [];
  if(s.phase==='lobby'){
    const options=districts.map((name,id)=>option(id,name)).filter(o=>!s.players.some(q=>q.id!==p.id&&q.districts?.includes(o.value)));
    return [...(isHost(s,actor)?judgeChoices(s):[]),choice('اختيار المناطق','districts',[field('districts','المناطق المفضلة',options,true)])];
  }
  if(s.phase==='intermission'&&isHost(s,actor))return judgeChoices(s);
  if(s.phase!=='playing'||s.paused)return [];
  return s.pending?pendingChoices(s,p,s.pending):[...playChoices(s,p),...bankActions(s,p)];
}
function judgeAct(s,actor,a){
  if(a.type==='start'){start(s,actor,a);return;}
  assert(findChoice(judgeChoices(s),a),'هذا الإجراء غير متاح للحكم.');
  if(a.type==='setMoveDuration'){
    s.moveDuration=a.seconds;
    return;
  }
  if(a.type==='reorder'){
    const index=s.players.findIndex(p=>p.id===a.target);
    s.players.splice(a.seat,0,s.players.splice(index,1)[0]);
    return;
  }
  if(a.type==='next'){cycle(s);return;}
  if(a.type==='pause'||a.type==='resume'){
    s.paused=a.type==='pause';
    if(s.paused)s.pausedAt=Date.now();
    else{
      if(Number.isFinite(s.turnAt)&&Number.isFinite(s.pausedAt))s.turnAt+=Date.now()-s.pausedAt;
      delete s.pausedAt;
    }
    s.notice=s.paused?'اللعب متوقف بقرار الحكم.':'استأنف الحكم اللعب.';
    return;
  }
  const p=player(s,a.target);
  if(a.type==='penalty'){
    p.penalty+=(s.cycle+p.violations)*100;
    p.violations++;
    s.notice='سجّل الحكم عقوبة على '+p.name;
  }
  if(a.type==='adjustPenalty'||a.type==='clearPenalty')p.penalty=a.type==='clearPenalty'?0:a.points;
  if(a.type==='expel'){
    exitCycle(s,p,'مطرود');
    if(s.pending){s.pending=null;s.notice='أُلغي الإجراء المعلّق بعد الطرد.';}
    if(p.id===s.turn||s.players.every(q=>q.out))advance(s);
  }
  if(a.type==='forceEnd')advance(s);
  if(a.type==='void'){s.pending=null;s.notice='ألغى الحكم الإجراء المعلّق.';}
  if(a.type==='resolve'){
    if(s.pending.kind==='response')resolveResponse(s,s.pending);
    else completeSwap(s,s.pending);
  }
  if(a.type==='acceptFirst')completeSwap(s,s.pending.swap);
}
function applyAction(s,actor,a){
  assert(a&&typeof a.type==='string');
  if(!isAuto(s)&&actor.id===s.judge.id){judgeAct(s,actor,a);return;}
  if(isHost(s,actor)&&(s.phase==='lobby'&&['start','reorder','setMoveDuration'].includes(a.type)||s.phase==='intermission'&&a.type==='next')){
    judgeAct(s,actor,a);
    return;
  }
  const p=player(s,actor.id);
  assert(p,'أنت خارج الغرفة.');
  if(s.phase==='lobby'){
    assert(a.type==='districts'&&findChoice(choices(s,actor),a));
    assert(a.districts.length<=(limits[s.players.length]||8),'اختر عددًا أقل من المناطق.');
    p.districts=a.districts;
    return;
  }
  assert(s.phase==='playing'&&!s.paused,'اللعب متوقف حاليًا.');
  if(s.pending){
    const t=s.pending;
    const card=actualCard(p,a);
    const sameAid=a.type==='respond'&&t.kind==='response'&&t.id===a.response&&
      (card?.key==='aid'||card?.key==='joker'&&a.as==='aid')&&
      !p.out&&!p.rest&&p.id!==t.source&&p.id!==t.target&&
      t.played.some(reply=>reply.key==='aid'&&reply.side===a.side&&reply.actor!==p.id);
    if(sameAid){
      consumeResponse(s,p,a);
      s.notice='احترق ازهلها الثاني لنفس الجهة.';
      return;
    }
    const match=findChoice(pendingChoices(s,p,s.pending),a);
    assert(match&&(!match.offer||a.offer===match.offer)&&(!match.response||a.response===match.response&&a.side===match.side),'هذا الرد غير متاح.');
    applyPending(s,p,s.pending,a);
    return;
  }
  assert(s.turn===p.id&&!p.out,'انتظر دورك.');
  if(a.type==='end'){advance(s);return;}
  assert(s.moves>0,'خلصت حركاتك.');
  if(a.type==='play'){use(s,p,a);return;}
  const match=findChoice(bankActions(s,p),a);
  assert(match);
  const card=take(region(p,match.region).cards,a.card);
  spend(s);
  if(a.type==='move')region(p,a.to).cards.push(card);
  else discard(s,card);
}
function captureTimer(s){
  return {turn:s.turn,turnAt:s.turnAt,pending:s.pending};
}
function settleAuto(s,now){
  while(s.pending){
    const t=s.pending;
    if(t.kind==='response'&&!s.players.some(p=>responseChoices(p,t).some(c=>c.type==='respond'))){
      resolveResponse(s,t,now);
      continue;
    }
    if(t.kind==='burnVotes'||t.kind==='pay'){
      const cards=eligibleVotes(player(s,t.target),t.kind==='burnVotes').map(({c})=>c);
      if(cards.reduce((sum,c)=>sum+amount(c),0)<t.minimum){
        applyPending(s,player(s,t.chooser),t,{cards:cards.map(c=>c.id)});
        continue;
      }
    }
    if(['steal','burnCard','allocate'].includes(t.kind)){
      const p=player(s,t.chooser);
      const field=pendingChoices(s,p,t)[0]?.fields[0];
      if(field?.options.length===1){
        applyPending(s,p,t,{[field.name]:field.options[0].value});
        continue;
      }
    }
    return;
  }
}
function updateTimers(s,before,now,newReply=false){
  if(s.phase==='intermission'){
    s.nextAt??=now+intermissionDuration;
    delete s.turnPausedAt;
    return;
  }
  if(s.phase!=='playing'){
    delete s.turnPausedAt;
    return;
  }
  settleAuto(s,now);
  if(s.phase!=='playing'){
    updateTimers(s,before,now);
    return;
  }
  if(s.pending){
    s.turnPausedAt??=now;
    if(s.pending!==before.pending||newReply)s.pending.deadline=now+decisionDuration;
    return;
  }
  if(s.turnPausedAt!==undefined){
    if(s.turn===before.turn&&s.turnAt===before.turnAt)s.turnAt+=now-s.turnPausedAt;
    delete s.turnPausedAt;
  }
}
function act(s,actor,a){
  if(a?.type==='emote'){
    const p=player(s,actor.id);
    const now=Date.now();
    assert(canReact(s,p),'الإشارات غير متاحة الآن.');
    assert(reactions.has(a.reaction),'اختر إشارة من القائمة.');
    assert(now-(p.reactedAt??-Infinity)>=reactionCooldown,'انتظر لحظة قبل إرسال إشارة ثانية.');
    p.reactedAt=now;
    s.reaction={by:p.id,name:p.name,reaction:a.reaction,at:now};
    return;
  }
  if(!isAuto(s)){applyAction(s,actor,a);return;}
  const before=captureTimer(s);
  const replyCount=before.pending?.played?.length;
  applyAction(s,actor,a);
  const now=Date.now();
  const committedMove=!before.pending&&before.turn===actor.id&&['play','ownBurn','move'].includes(a.type);
  if(committedMove&&s.phase==='playing'&&s.turn===before.turn)s.turnAt=now;
  const newReply=before.pending?.played?.length!==replyCount;
  updateTimers(s,before,now,newReply);
}
function fallbackVotes(p,t){
  const cards=eligibleVotes(p,t.kind==='burnVotes').map(({c})=>c).sort((a,b)=>amount(b)-amount(a));
  const chosen=[];
  let sum=0;
  for(const card of cards){
    if(sum>=t.minimum)break;
    chosen.push(card.id);
    sum+=amount(card);
  }
  return chosen;
}
function closePending(s,t,now){
  if(t.kind==='response'){resolveResponse(s,t,now);return;}
  if(t.kind==='swap'||t.kind==='redirect'){
    s.pending=null;
    s.notice='انتهت مهلة البدل.';
    return;
  }
  if(t.kind==='vote'){
    const electorate=s.players.filter(p=>!p.out);
    if(Object.values(t.votes).filter(Boolean).length>electorate.length/2)exitCycle(s,player(s,t.target),'مطرود');
    s.pending=null;
    s.notice='انتهت مهلة التصويت.';
    return;
  }
  const p=player(s,t.chooser);
  const action=pendingChoices(s,p,t)[0];
  const fields=Object.fromEntries(action.fields.map(f=>[f.name,f.multiple?fallbackVotes(player(s,t.target),t):f.options[0].value]));
  applyPending(s,p,t,{...action,...fields});
}
function tick(s,now=Date.now()){
  if(!isAuto(s))return false;
  const before=captureTimer(s);
  if(s.phase==='intermission'&&now>=s.nextAt)cycle(s,now);
  else if(s.phase==='playing'&&s.pending&&now>=s.pending.deadline)closePending(s,s.pending,now);
  else if(s.phase==='playing'&&!s.pending&&now-s.turnAt>=moveDuration(s)*1000)advance(s,now);
  else return false;
  updateTimers(s,before,now);
  return true;
}
function canReact(s,p){
  return !!(p&&s.phase==='playing'&&!s.paused&&!p.out&&!p.mute);
}
function view(s,actor){
  const now=Date.now();
  const p=player(s,actor.id);
  const isJudge=!isAuto(s)&&actor.id===s.judge.id;
  const pending=s.pending;
  const timedMove=isAuto(s)&&s.phase==='playing'&&!pending&&Number.isFinite(s.turnAt);
  const ledger=isJudge||s.phase==='finished'||p?.secretUntil>now;
  return {
    me:actor.id,judge:s.judge,mode:isAuto(s)?'auto':'human',host:s.host,isHost:isHost(s,actor),
    phase:s.phase,cycle:s.cycle,cycles:s.cycles,turn:s.turn,nextAt:s.nextAt,
    turnAt:s.turnAt,moves:s.moves,deckCount:s.deck?.length,notice:s.notice,paused:!!s.paused,
    moveDeadline:timedMove?s.turnAt+moveDuration(s)*1000:undefined,moveDuration:isAuto(s)?moveDuration(s):undefined,
    canReact:canReact(s,p),reaction:s.phase==='playing'&&s.reaction?.at>now-reactionDuration?s.reaction:undefined,
    pending:pending?{kind:pending.kind,label:pendingLabels[pending.kind],deadline:pending.deadline,
      duration:pending.deadline===undefined?undefined:decisionDuration/1000}:null,
    players:s.players.map(q=>({
      id:q.id,name:q.name,handCount:q.hand?.length||0,out:q.out||false,muted:q.mute||0,
      immunity:q.immunity||0,rest:q.rest||0,
      regions:q.regions?.map(r=>({
        id:r.id,name:r.name,votes:votesIn(r).map(amount),locked:r.locked,
        double:r.cards.some(c=>(c.as||c.key)==='double'),protected:protectedRegion(r),score:regionScore(r)
      }))??q.districts?.map(id=>({id,name:districts[id],votes:[]}))??[]
    })),
    hand:p?.hand?.map(cardInfo)??[],discard:s.discard?.map(cardInfo)??[],results:s.results??[],
    choices:choices(s,actor),inspection:p?.inspection?.until>now?p.inspection:undefined,
    ledger:ledger?rows(s,q=>s.phase==='playing'?q.total+q.points-q.penalty:q.total||0):undefined,
    entries:ledger?s.entries:undefined
  };
}
module.exports={start,act,view,tick};
