import test from 'node:test';
import assert from 'node:assert/strict';
import { searchProducts,parseQuery,rankProducts,validateSchedule,isAvailable,analytics } from '../domain.js';
const products=[
 {id:1,family_id:1,name:'هدية ورد',description:'صندوق ورد',category:'Crafts',family:'أم محمد',region:'الطائف',price:9500,stock:8,gift:1},
 {id:2,family_id:2,name:'مفرش مطرز',description:'يدوي',category:'Crafts',family:'أم ريم',region:'أبها',price:12000,stock:8,gift:1},
 {id:3,family_id:3,name:'جريش',description:'جريش منزلي',category:'Food',family:'أم صالح',region:'الرياض',price:3500,stock:20,gift:0},
 {id:4,family_id:1,name:'شمعة',description:'شمعة ورد',category:'Crafts',family:'أم محمد',region:'الطائف',price:10000,stock:0,gift:1}
];
test('natural search enforces Arabic/English intent and budget without alternatives',()=>{
 assert.deepEqual(searchProducts(products,'أبي هدية بأقل من مئة ريال').map(p=>p.id),[1]);
 assert.deepEqual(searchProducts(products,'I want a gift under 100 SAR in Taif').map(p=>p.id),[1]);
 assert.deepEqual(searchProducts(products,'أبي جريش في الرياض').map(p=>p.id),[3]);
 assert.equal(searchProducts(products,'أبي هدية بأقل من ٥٠ ريال').length,0);
 assert.equal(searchProducts(products,'أبي هدية بأقل من 100 ريال في الرياض').length,0);
 assert.equal(searchProducts(products,'أبي حاسوب').length,0);
 assert.equal(searchProducts(products,'هدية 100').length,0);
 assert.equal(searchProducts(products,'هدية في جدة والطائف').length,0);
 assert.equal(parseQuery('بين 30 و 50').min,3000);
});
test('ranking responds to behavior without broadening matching results',()=>{
 assert.equal(rankProducts(products,[{type:'view',product_id:3}])[0].id,3);
 const ranked=rankProducts(products,[{type:'search',query:'جريش'}]);assert.equal(ranked[0].id,3);
 assert.equal(rankProducts(products,[],[{product_id:2}])[0].id,2);
});
test('weekly hours, exceptions, and time boundaries',()=>{
 const s=validateSchedule([{day:6,start:'16:00',end:'21:00'}],[{date:'2026-10-17',closed:true}]);
 assert.ok(isAvailable(s,'2026-10-10T16:00:00+03:00'));
 assert.equal(isAvailable(s,'2026-10-10T21:00:00+03:00'),false);
 assert.equal(isAvailable(s,'2026-10-17T17:00:00+03:00'),false);
 assert.equal(isAvailable(s,'2026-10-10T17:00:00Z'),false);
 assert.throws(()=>validateSchedule([{day:6,start:'22:00',end:'09:00'}],[]));
 assert.throws(()=>validateSchedule([],[{date:'2026-02-30',closed:true}]));
});
test('dashboard handles sparse data and comparisons without inventing forecasts',()=>{
 const d=analytics([],[],new Date('2026-10-10T00:00:00+03:00'));
 assert.equal(d.forecast,null);assert.equal(d.orderChange,null);assert.equal(d.revenue,0);
 const rows=[1,2,3].map(id=>({id,total:1000,created_at:'2026-10-08T10:00:00+03:00',scheduled_at:'2026-10-08T16:00:00+03:00',payment_status:'simulated_paid',status:'delivered',synthetic:1}));
 const full=analytics(rows,[{order_id:1,name:'جريش',quantity:2}],new Date('2026-10-10T00:00:00+03:00'));
 assert.equal(full.revenue,3000);assert.equal(full.topProducts[0].quantity,2);assert.equal(full.busyHours[0].hour,'16');assert.equal(full.forecast.confidence,'low');
 assert.equal(full.forecast.hours[0].hour,'16');assert.equal(full.forecast.products[0].name,'جريش');
});
