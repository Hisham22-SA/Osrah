// Generates review files only. Never opens or modifies the application's database.
import { mkdirSync, writeFileSync } from 'node:fs';
const specs = [
 ['أم صالح','الرياض','Food',[['جريش',35],['مرقوق',40],['حنيني',25]],'16:00','21:00'],
 ['أم نورة','جدة','Food',[['معمول تمر',30],['كوكيز منزلي',28],['كيكة زعفران',65]],'15:00','20:00'],
 ['أم عبدالله','الدمام','Food',[['ورق عنب',45],['كبة منزلية',38],['فطائر مشكلة',32]],'12:00','18:00'],
 ['أم فهد','مكة','Food',[['منتو',35],['يغمش',30],['سمبوسة',25]],'16:00','22:00'],
 ['أم سارة','المدينة المنورة','Food',[['دقة مدينية',20],['تمر محشو',45],['بسكويت منزلي',25]],'10:00','16:00'],
 ['أم خالد','بريدة','Food',[['كليجا',30],['قرص عقيلي',40],['لقيمات',22]],'15:00','21:00'],
 ['أم ريم','أبها','Crafts',[['سلة خوص',70],['مفرش مطرز',120],['حقيبة قماش',55]],'10:00','17:00'],
 ['أم محمد','الطائف','Crafts',[['شمعة برائحة الورد',45],['صابون ورد',25],['صندوق هدية ورد',95]],'13:00','19:00'],
 ['أم لطيفة','الأحساء','Crafts',[['تعليقة نخلة',20],['سلة تراثية',85],['حافظة مطرزة',40]],'09:00','15:00'],
 ['أم هند','تبوك','Crafts',[['كوب مزين',35],['دفتر مزخرف',30],['طقم هدية يدوي',90]],'16:00','21:00']
];
const customers = ['عبدالله القحطاني','نورة العتيبي','خالد الدوسري','سارة الحربي','محمد الغامدي','ريم الشهري','فهد المطيري','هند الزهراني','صالح السبيعي','لطيفة الشمري'].map((name,i)=>({id:`customer-${i+1}`,name,email:`customer${i+1}@example.test`,role:'customer'}));
const families=specs.map(([name,region,category,items,start,end],i)=>({
 id:`family-${i+1}`,name,email:`family${i+1}@example.test`,region,role:'family',approved:true,
 weeklyHours:[0,1,2,3,4,6].map(day=>({day,start,end})), // Sunday=0, Friday closed
 exceptions:i===0?[{date:'2026-10-15',closed:true}]:i===7?[{date:'2026-10-16',closed:false,start:'16:00',end:'20:00'}]:[],
 delivery:['pickup','family_delivery']
}));
const products=specs.flatMap(([family,region,category,items],i)=>items.map(([name,sar],j)=>({
 id:`product-${i*3+j+1}`,familyId:families[i].id,name,region,category,
 description:category==='Food'?`${name} منزلي من ${family}. منتج تجريبي لا يمثل عرضاً حقيقياً للبيع.`:`${name} مصنوع يدوياً من ${family}. منتج تجريبي لا يمثل عرضاً حقيقياً للبيع.`,
 priceHalalas:sar*100,stock:category==='Food'?20:8,preparationHours:category==='Food'?4:24,
 giftSuitable:category==='Crafts'||['معمول تمر','كيكة زعفران','تمر محشو','كليجا'].includes(name),
 unit:category==='Food'?'علبة تجريبية':'قطعة',image:null
})));
const events=[];const orders=[];
customers.forEach((c,i)=>{
 const primary=products[i*3],secondary=products[i*3+1];
 events.push({customerId:c.id,type:'search',query:i<6?`أبي ${primary.name} في ${primary.region}`:`أبي هدية بأقل من مئة ريال في ${primary.region}`,at:'2026-10-09T10:00:00+03:00'});
 [primary,secondary,primary].forEach((p,j)=>events.push({customerId:c.id,type:'view',productId:p.id,at:`2026-10-09T10:0${j+1}:00+03:00`}));
 events.push({customerId:c.id,type:'recommendation_click',productId:secondary.id,at:'2026-10-09T10:05:00+03:00'});
 events.push({customerId:c.id,type:'add_to_cart',productId:primary.id,at:'2026-10-09T10:06:00+03:00'});
 for(let j=0;j<6;j++){
   const product=products[i*3+j%3];const date=new Date(Date.UTC(2026,8,10+j*5+i%3));if(date.getUTCDay()===5)date.setUTCDate(date.getUTCDate()-1);const day=date.toISOString().slice(0,10);
   const slot=specs[i][4];const quantity=j%2+1;
   orders.push({id:`demo-order-${i*6+j+1}`,customerId:c.id,familyId:families[i].id,items:[{productId:product.id,quantity,unitPriceHalalas:product.priceHalalas}],totalHalalas:quantity*product.priceHalalas,status:'delivered',paymentStatus:'simulated_paid',scheduledAt:`${day}T${slot}:00+03:00`,createdAt:`${day}T08:00:00+03:00`,synthetic:true});
 }
});
const data={schemaVersion:1,status:'proposed_not_imported',synthetic:true,referenceDate:'2026-10-10',timezone:'Asia/Riyadh',notes:['All people and activity records are fictional. Names are common invented examples, not actual customer records.','No passwords, real phone numbers, card data, or real payments.','Prices are illustrative, not market quotations.','Friday closed for all families unless overridden. No real reservations or capacity commitments.','Historical orders are independent sample records, not deductions from the initial stock.','Schedules, amounts, and historical activity require user review before import.'],families,customers,products,events,orders};
mkdirSync('demo',{recursive:true});writeFileSync('demo/proposed-data.json',JSON.stringify(data,null,2)+'\n','utf8');
let md='# بيانات أسرة المقترحة للمراجعة\n\nبيانات وهمية بالكامل، لم تُدخل في قاعدة البيانات. الأسماء أمثلة مختلقة وليست سجلات لأشخاص حقيقيين. الأسعار تقديرية للتجربة.\n\n## الأسر والمنتجات\n\n| الأسرة | المدينة | المنتجات والأسعار بالريال | ساعات العمل |\n|---|---|---|---|\n';
specs.forEach(([name,region,cat,items,start,end])=>{md+=`| ${name} | ${region} | ${items.map(([n,p])=>`${n}: ${p}`).join('، ')} | ${start}–${end} |\n`;});
md+='\nساعات أسبوعية من السبت إلى الخميس؛ الجمعة إجازة. استثناءات مقترحة: أم صالح مغلقة يوم 15 أكتوبر 2026؛ أم محمد تعمل يوم الجمعة 16 أكتوبر من 16:00 إلى 20:00. جميع الأوقات بتوقيت السعودية.\n\n## العملاء\n\n| العميل | سلوك تجريبي مرتبط بمنتجات |\n|---|---|\n';
customers.forEach((c,i)=>{md+=`| ${c.name} | ${specs[i][3].map(p=>p[0]).join('، ')} |\n`;});
md+='\nلكل عميل: عملية بحث واحدة، ثلاث مشاهدات منتجات، نقرة توصية، إضافة للسلة، وستة طلبات شراء وهمية مكتملة. الإجمالي: 60 حدث سلوك و60 طلباً، كل طلب من منتج واحد بكمية 1 أو 2. البيانات التاريخية من 10 سبتمبر إلى 7 أكتوبر 2026. السلوك يوم 9 أكتوبر. هذه أنشطة محاكاة، وليست ميزات منفذة حالياً.\n\nالمخزون المبدئي: 20 علبة لكل منتج مأكولات و8 قطع لكل منتج حرفي. وقت التجهيز: 4 ساعات للمأكولات و24 ساعة للحرف. جميع الأسر تدعم الاستلام أو توصيل الأسرة في هذه المقترحات. لا توجد صور منتجات حقيقية أو رسوم توصيل في الملف.\n\nسجلات الطلبات الكاملة وتفاصيل الأحداث موجودة في [ملف البيانات](proposed-data.json). حساب المسؤول غير مضاف إلى مجموعة العشرين حساباً المقترحة.\n';
writeFileSync('demo/proposed-data.md',md,'utf8');
console.log(JSON.stringify({families:families.length,customers:customers.length,products:products.length,events:events.length,orders:orders.length,status:data.status}));
