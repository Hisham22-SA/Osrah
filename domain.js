export const normalize = value => String(value??'').toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c));
const regions = [['الرياض','riyadh'],['جدة','jeddah'],['الدمام','dammam'],['مكة','makkah','mecca'],['المدينة المنورة','madinah','medina'],['بريدة','buraydah'],['أبها','abha'],['الطائف','taif'],['الأحساء','ahsa'],['تبوك','tabuk']];
const synonyms = [['هدية','هدايا','gift','gifts'],['مأكولات','اكل','طعام','food'],['حرف','يدوي','craft','crafts'],['جريش','jareesh'],['مرقوق','marqooq'],['حنيني','hanini'],['كيكة','كيك','cake'],['معمول','maamoul'],['تمر','dates'],['سلة','سلال','basket'],['شمعة','شموع','candle'],['صابون','soap'],['حقيبة','حقائب','bag'],['كوب','اكواب','mug'],['دفتر','دفاتر','notebook']].map(g=>g.map(normalize));
const stop = new Set(normalize('ابي ابغي ابغى اريد احتاج ابيلي لي عندكم فيه في من عن علي على ب ريال ريالات ر س بسعر سعر ميزانيه ميزانية ميزانيتي وبميزانيه تحت اقل اكثر فوق بين الي إلى و يكون تكون شي شيء منتجات منتج محلي منزلي اقلمن بأقل باقل سعره within under below less than up to at most more over above between and in for a an i want need please sar riyals riyal budget with').split(/\s+/));
const numberWords = [['ميه',100],['مئه',100],['مائه',100],['خمسين',50],['عشرين',20],['ثلاثين',30],['اربعين',40],['ستين',60],['سبعين',70],['ثمانين',80],['تسعين',90],['مئتين',200],['ميتين',200]];
export function parseQuery(query) {
  let text=normalize(query);for(const [word,n] of numberWords)text=text.replace(new RegExp(`(^|\\s)${word}(?=\\s|$)`,'g'),`$1${n}`);
  const result={regions:[],min:null,max:null,minExclusive:false,maxExclusive:false,gift:false,category:null,terms:[],unsupported:false};
  for(const aliases of regions)for(const alias of aliases){const a=normalize(alias);if(text.includes(a)){result.regions.push(aliases[0]);text=text.split(a).join(' ');break;}}
  const range=text.match(/(?:بين|between)\s*(\d+(?:\.\d+)?)\s*(?:و|and|الي|to|-)\s*(\d+(?:\.\d+)?)/);
  if(range){result.min=Math.round(Number(range[1])*100);result.max=Math.round(Number(range[2])*100);text=text.replace(range[0],' ');}
  for(const [regex,field,exclusive] of [[/(?:باقل من|اقل من|تحت|under|below|less than)\s*(\d+(?:\.\d+)?)/,'max',true],[/(?:حتي|بحد اقصي|لا يزيد عن|up to|at most|ميزانيتي|ميزانيه|budget)\s*(\d+(?:\.\d+)?)/,'max',false],[/(?:اكثر من|فوق|over|above|more than)\s*(\d+(?:\.\d+)?)/,'min',true]]){
    const m=text.match(regex);if(m){result[field]=Math.round(Number(m[1])*100);result[field+'Exclusive']=exclusive;text=text.replace(m[0],' ');}
  }
  // Unqualified amounts and contradictory ranges cannot silently broaden a search.
  if(/\d/.test(text)||result.regions.length>1||(result.min!==null&&result.max!==null&&result.min>result.max))result.unsupported=true;
  const words=text.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean);
  for(let word of words){if(stop.has(word))continue;let group=synonyms.find(g=>g.includes(word)||g.includes(word.replace(/^ال/,'')));if(group===synonyms[0])result.gift=true;else if(group===synonyms[1])result.category='Food';else if(group===synonyms[2])result.category='Crafts';else result.terms.push(group||[word]);}
  return result;
}
export function searchProducts(products,query,{region='',category=''}={}) {
  const intent=parseQuery(query);
  return products.filter(p=>!intent.unsupported&&p.stock>0&&(!region||p.region===region)&&(!category||p.category===category)&&(!intent.regions.length||p.region===intent.regions[0])&&(!intent.category||p.category===intent.category)&&(!intent.gift||p.gift===1)&&
    (intent.min===null||(intent.minExclusive?p.price>intent.min:p.price>=intent.min))&&(intent.max===null||(intent.maxExclusive?p.price<intent.max:p.price<=intent.max))&&intent.terms.every(group=>group.some(term=>normalize(p.name+' '+p.description+' '+p.family).includes(term))));
}
export function rankProducts(products,events,purchases=[]) {
  const scores=new Map(products.map(p=>[p.id,0]));const byId=new Map(products.map(p=>[p.id,p]));
  for(const e of events){const weight={view:2,recommendation_click:3,add_to_cart:4,search:1}[e.type]||0;const matches=e.product_id?[byId.get(e.product_id)].filter(Boolean):searchProducts(products,e.query||'');
    for(const match of matches)for(const p of products){let affinity=p.id===match.id?1:p.family_id===match.family_id?0.5:p.category===match.category?0.15:0;affinity+=(p.region===match.region?0.2:0)+(1-Math.abs(p.price-match.price)/Math.max(p.price,match.price))*0.1;scores.set(p.id,scores.get(p.id)+weight*affinity);}}
  for(const purchase of purchases){const source=byId.get(purchase.product_id);if(source)for(const p of products)scores.set(p.id,scores.get(p.id)+(p.id===source.id?6:p.family_id===source.family_id?3:p.category===source.category?1:0));}
  return [...products].sort((a,b)=>scores.get(b.id)-scores.get(a.id)||b.id-a.id);
}
export function validateSchedule(weekly,exceptions) {
  if(!Array.isArray(weekly)||!Array.isArray(exceptions)||weekly.length>7||exceptions.length>100)throw Error('Invalid schedule');
  const time=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
  const days=new Set();for(const row of weekly){if(!Number.isInteger(row.day)||row.day<0||row.day>6||days.has(row.day)||!time(row.start)||!time(row.end)||row.start>=row.end)throw Error('Invalid working hours');days.add(row.day);}
  const dates=new Set();for(const row of exceptions){if(!validDate(row.date)||dates.has(row.date)||typeof row.closed!=='boolean'||(!row.closed&&(!time(row.start)||!time(row.end)||row.start>=row.end)))throw Error('Invalid exception');dates.add(row.date);}
  return {weekly:weekly.map(({day,start,end})=>({day,start,end})),exceptions:exceptions.map(({date,closed,start,end})=>closed?{date,closed}:{date,closed,start,end})};
}
function validDate(date){return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;}
export function isAvailable(schedule,scheduledAt) {
  if(typeof scheduledAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/.test(scheduledAt))return false;
  const date=scheduledAt.slice(0,10),time=scheduledAt.slice(11,16);if(!validDate(date))return false;
  const override=schedule.exceptions.find(x=>x.date===date);const row=override||(schedule.weekly.find(x=>x.day===new Date(date).getUTCDay()));
  return !!row&&!row.closed&&time>=row.start&&time<row.end;
}
export function analytics(orders,items,now=new Date()) {
  const end=now.getTime(),start=end-7*86400000,previousStart=start-7*86400000;
  const paid=orders.filter(o=>['simulated_paid','paid','cash_on_pickup'].includes(o.payment_status)&&o.status!=='cancelled');
  const current=paid.filter(o=>Date.parse(o.created_at)>=start&&Date.parse(o.created_at)<=end),previous=paid.filter(o=>Date.parse(o.created_at)>=previousStart&&Date.parse(o.created_at)<start);
  const total=rows=>rows.reduce((s,o)=>s+o.total,0);const change=(a,b)=>b===0?null:Math.round((a-b)/b*100);
  const ids=new Set(paid.map(o=>o.id)),top=new Map(),hours=new Map();
  for(const item of items)if(ids.has(item.order_id)){top.set(item.name,(top.get(item.name)||0)+item.quantity);}
  for(const o of paid){const h=o.scheduled_at.slice(11,13);hours.set(h,(hours.get(h)||0)+1);}
  const first=paid.length?Math.min(...paid.map(o=>Date.parse(o.created_at))):end;
  const span=Math.min(28,Math.max(1,Math.ceil((end-first)/86400000)));const recent=paid.filter(o=>Date.parse(o.created_at)>=end-28*86400000&&Date.parse(o.created_at)<=end);
  const recentIds=new Set(recent.map(o=>o.id)),futureProducts=new Map(),futureHours=new Map();
  for(const i of items)if(recentIds.has(i.order_id))futureProducts.set(i.name,(futureProducts.get(i.name)||0)+i.quantity);
  for(const o of recent){const hour=o.scheduled_at.slice(11,13);futureHours.set(hour,(futureHours.get(hour)||0)+1);}
  return {orders:current.length,revenue:total(current),previousOrders:previous.length,previousRevenue:total(previous),orderChange:change(current.length,previous.length),revenueChange:change(total(current),total(previous)),
    topProducts:[...top].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,quantity])=>({name,quantity})),busyHours:[...hours].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([hour,count])=>({hour,count})),
    forecast:recent.length>=3?{orders:Math.round(recent.length/span*7),revenue:Math.round(total(recent)/span*7),products:[...futureProducts].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,quantity:Math.round(count/span*7)})),hours:[...futureHours].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([hour,count])=>({hour,orders:Math.round(count/span*7)})),confidence:'low',method:'Trailing daily average; next 7 days'}:null,
    insights:[current.length>previous.length?'Demand increased compared with the previous week.':current.length<previous.length?'Demand decreased compared with the previous week.':'Demand is unchanged compared with the previous week.',recent.length<10?'Limited history: treat forecasts as rough estimates.':'Use the busiest hours to plan preparation capacity.', 'Review popular products before replenishing inventory.'],synthetic:paid.some(o=>o.synthetic===1)};
}
