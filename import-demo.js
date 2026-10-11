import { readFileSync } from 'node:fs';
import { randomBytes,scryptSync } from 'node:crypto';
import { db } from './database.js';
import { validateSchedule } from './domain.js';
export function importDemoLocations(){
 // Fictional pins for the ten demo families; these are not real pickup addresses.
 const pins=[[24.72,46.67],[21.55,39.17],[26.43,50.10],[21.41,39.83],[24.47,39.61],[26.36,43.97],[18.22,42.51],[21.28,40.42],[25.38,49.58],[28.39,36.57]];
 const demoAddress='موقع تجريبي للأسرة — ليس عنوان استلام فعلي';
 db.exec('BEGIN');try{pins.forEach(([lat,lon],i)=>{const family=db.prepare('SELECT id FROM users WHERE demo_key=?').get('family-'+(i+1));if(family){db.prepare('INSERT OR IGNORE INTO family_locations VALUES(?,?,?,?,?,1)').run(family.id,lat,lon,demoAddress,i%2===0?1:0);if(i===2||i===3)db.prepare("UPDATE family_locations SET latitude=?,longitude=?,synthetic=1 WHERE family_id=? AND synthetic=0 AND address=?").run(lat,lon,family.id,demoAddress);}});db.prepare('INSERT OR IGNORE INTO migrations VALUES(?)').run('demo-locations-v1');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function importDemo(){
  if(db.prepare('SELECT name FROM migrations WHERE name=?').get('approved-demo-v1'))return {alreadyImported:true};
  const data=JSON.parse(readFileSync(new URL('./demo/proposed-data.json',import.meta.url),'utf8'));
  const users=new Map(),products=new Map();
  const password=()=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(randomBytes(32).toString('hex'),salt,64).toString('hex');};
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const u of [...data.families,...data.customers,{id:'admin-demo',name:'مشرف التجربة',email:'admin@example.test',role:'admin',approved:true}]){
      const row=db.prepare('INSERT INTO users(name,email,password,role,approved,demo_key) VALUES(?,?,?,?,?,?)').run(u.name,u.email,password(),u.role,u.approved||u.role!=='family'?1:0,u.id);users.set(u.id,Number(row.lastInsertRowid));
      if(u.role==='family'){const s=validateSchedule(u.weeklyHours,u.exceptions);db.prepare('INSERT INTO schedules VALUES(?,?,?)').run(users.get(u.id),JSON.stringify(s.weekly),JSON.stringify(s.exceptions));}
    }
    for(const p of data.products){const row=db.prepare('INSERT INTO products(family_id,name,description,category,region,price,stock,preparation,delivery,gift,demo_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(users.get(p.familyId),p.name,p.description,p.category,p.region,p.priceHalalas,p.stock,p.preparationHours,'both',p.giftSuitable?1:0,p.id);products.set(p.id,Number(row.lastInsertRowid));}
    data.events.forEach((e,i)=>db.prepare('INSERT INTO events(actor,type,product_id,query,created_at,demo_key) VALUES(?,?,?,?,?,?)').run('user:'+users.get(e.customerId),e.type,e.productId?products.get(e.productId):null,e.query||null,e.at,'event-'+i));
    for(const o of data.orders){const row=db.prepare('INSERT INTO orders(customer_id,family_id,total,status,payment_status,scheduled_at,created_at,synthetic,demo_key) VALUES(?,?,?,?,?,?,?,?,?)').run(users.get(o.customerId),users.get(o.familyId),o.totalHalalas,o.status,o.paymentStatus,o.scheduledAt,o.createdAt,1,o.id);for(const item of o.items)db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(Number(row.lastInsertRowid),products.get(item.productId),item.quantity,item.unitPriceHalalas);}
    db.prepare("UPDATE users SET approved=0 WHERE email='seed@osrah.local'").run();
    db.prepare('INSERT INTO migrations VALUES(?)').run('approved-demo-v1');db.exec('COMMIT');return {families:10,customers:10,products:data.products.length,events:60,orders:60};
  }catch(e){db.exec('ROLLBACK');throw e;}
}
