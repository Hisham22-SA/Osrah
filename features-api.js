import { db } from './database.js';
import { searchProducts,rankProducts,validateSchedule,isAvailable,analytics } from './domain.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { validateLicense } from './family-license.js';
import { validateLocation } from './locations.js';
import { createTapCheckout, retrieveTapCharge, tapConfigured } from './tap-payments.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const catalog=()=>db.prepare('SELECT p.*,u.name AS family FROM products p JOIN users u ON u.id=p.family_id WHERE u.approved=1 ORDER BY p.id DESC').all();
const scheduleFor=id=>{const s=db.prepare('SELECT * FROM schedules WHERE family_id=?').get(id);return {weekly:s?JSON.parse(s.weekly):[],exceptions:s?JSON.parse(s.exceptions):[]};};
function settleTapPayment(session,charge){
  const amount=Math.round(Number(charge.amount)*100);
  if(charge.reference?.order!==session.id||charge.currency!=='SAR'||amount!==session.amount)fail(409,'Payment details did not match this order');
  const status=String(charge.status||'').toUpperCase();
  if(status==='CAPTURED'){
    db.exec('BEGIN IMMEDIATE');try{db.prepare("UPDATE orders SET payment_status='paid' WHERE id IN (SELECT value FROM json_each(?)) AND payment_status='pending'").run(session.order_ids);db.prepare("UPDATE payment_sessions SET status='paid',gateway_id=?,updated_at=? WHERE id=?").run(charge.id,new Date().toISOString(),session.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }else if(['DECLINED','CANCELLED','ABANDONED','FAILED','TIMED_OUT','RESTRICTED','VOIDED'].includes(status)){
    db.exec('BEGIN IMMEDIATE');try{for(const id of JSON.parse(session.order_ids)){const order=db.prepare("SELECT id FROM orders WHERE id=? AND payment_status='pending'").get(id);if(!order)continue;for(const item of db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(id))db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity,item.product_id);db.prepare("UPDATE orders SET status='cancelled',payment_status='failed' WHERE id=?").run(id);}db.prepare("UPDATE payment_sessions SET status='failed',gateway_id=?,updated_at=? WHERE id=?").run(charge.id,new Date().toISOString(),session.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
  const updated=db.prepare('SELECT * FROM payment_sessions WHERE id=?').get(session.id);return {status:updated.status,providerStatus:status};
}
function failPendingPayment(session,gatewayId=null){
  db.exec('BEGIN IMMEDIATE');try{for(const id of JSON.parse(session.order_ids)){const order=db.prepare("SELECT id FROM orders WHERE id=? AND payment_status='pending'").get(id);if(!order)continue;for(const item of db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(id))db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity,item.product_id);db.prepare("UPDATE orders SET status='cancelled',payment_status='failed' WHERE id=?").run(id);}db.prepare("UPDATE payment_sessions SET status='failed',gateway_id=COALESCE(?,gateway_id),updated_at=? WHERE id=?").run(gatewayId,new Date().toISOString(),session.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
async function refreshTapPayment(session){
  if(!session.gateway_id||!tapConfigured())return {status:session.status};
  const charge=await retrieveTapCharge(session.gateway_id);return settleTapPayment(session,charge);
}
export async function featureApi({url,req,res,user,body,send,requireUser,demoMode}){
    const reply=(status,data)=>{send(status,data);return true;};
    const visitor=req.headers['x-visitor-id'];
    const actor=user?'user:'+user.id:typeof visitor==='string'&&/^[a-f0-9-]{36}$/.test(visitor)?'visitor:'+visitor:null;
    const history=()=>actor?db.prepare('SELECT * FROM events WHERE actor=? ORDER BY id DESC LIMIT 200').all(actor):[];
    const purchases=()=>user?db.prepare("SELECT i.product_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.customer_id=? AND o.status!='cancelled'").all(user.id):[];
    const record=(type,productId=null,query=null)=>{if(actor)db.prepare('INSERT INTO events(actor,type,product_id,query,created_at) VALUES(?,?,?,?,?)').run(actor,type,productId,query,new Date().toISOString());};
    if(url.pathname==='/api/search'&&req.method==='POST'){
      if(typeof body.query!=='string'||body.query.length>300||typeof (body.region??'')!=='string'||typeof (body.category??'')!=='string')fail(400,'Invalid search');
      const all=catalog(),ranked=rankProducts(all,history(),purchases());const ids=new Set(searchProducts(all,body.query,{region:body.region||'',category:body.category||''}).map(p=>p.id));
      if(body.query.trim())record('search',null,body.query.trim());return reply(200,ranked.filter(p=>ids.has(p.id)));
    }
    if(url.pathname==='/api/recommendations'&&req.method==='GET')return reply(200,rankProducts(catalog().filter(p=>p.stock>0),history(),purchases()).slice(0,6));
    if(url.pathname==='/api/events'&&req.method==='POST'){
      if(!actor||!['view','recommendation_click','add_to_cart'].includes(body.type)||!Number.isSafeInteger(body.productId)||!catalog().some(p=>p.id===body.productId))fail(400,'Invalid activity');record(body.type,body.productId);return reply(201,{ok:true});
    }
    if(url.pathname==='/api/demo/accounts'&&req.method==='GET'){
      if(!demoMode)fail(404,'Not found');return reply(200,db.prepare('SELECT id,name,role FROM users WHERE demo_key IS NOT NULL ORDER BY role,id').all());
    }
    if(url.pathname==='/api/demo/login'&&req.method==='POST'){
      if(!demoMode||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail(403,'Demo access is local only');
      if(!Number.isSafeInteger(body.id))fail(400,'Invalid account');const u=db.prepare('SELECT * FROM users WHERE id=? AND demo_key IS NOT NULL').get(body.id);if(!u)fail(404,'Account not found');
      const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,u.id,Date.now()+86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
      return reply(200,{id:u.id,name:u.name,email:u.email,role:u.role,approved:Boolean(u.approved)});
    }
    if(url.pathname==='/api/families'&&req.method==='GET'){
      const all=catalog(), ranked=rankProducts(all,history(),purchases());
      const families=db.prepare("SELECT id,name,demo_key FROM users WHERE role='family' AND approved=1 ORDER BY id").all().map(f=>{
        const items=all.filter(p=>p.family_id===f.id),schedule=scheduleFor(f.id);
        return {...f,location:db.prepare('SELECT latitude,longitude,address,has_driver,synthetic FROM family_locations WHERE family_id=?').get(f.id)||null,region:items[0]?.region||'',categories:[...new Set(items.map(p=>p.category))],productCount:items.length,available:items.some(p=>p.stock>0),recommended:ranked.slice(0,6).some(p=>p.family_id===f.id),...schedule};
      });return reply(200,families);
    }
    const familyPath=url.pathname.match(/^\/api\/families\/(\d+)$/);
    if(familyPath&&req.method==='GET'){const f=db.prepare("SELECT id,name FROM users WHERE id=? AND role='family' AND approved=1").get(Number(familyPath[1]));if(!f)fail(404,'Family not found');return reply(200,{...f,location:db.prepare('SELECT latitude,longitude,address,has_driver,synthetic FROM family_locations WHERE family_id=?').get(f.id)||null,...scheduleFor(f.id)});}
    if(url.pathname==='/api/family/location'){
      requireUser('family');if(req.method==='GET')return reply(200,db.prepare('SELECT latitude,longitude,address,has_driver,synthetic FROM family_locations WHERE family_id=?').get(user.id)||null);
      if(req.method==='POST'){const a=validateLocation(body);db.prepare('INSERT INTO family_locations(family_id,latitude,longitude,address,has_driver) VALUES(?,?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,address=excluded.address,has_driver=excluded.has_driver,synthetic=0').run(user.id,a.latitude,a.longitude,a.address,a.hasDriver?1:0);return reply(200,{ok:true});}
    }
    if(url.pathname==='/api/family/schedule'){
      requireUser('family');if(req.method==='GET')return reply(200,scheduleFor(user.id));
      if(req.method==='POST'){let s;try{s=validateSchedule(body.weekly,body.exceptions);}catch(e){fail(400,e.message);}db.prepare('INSERT INTO schedules VALUES(?,?,?) ON CONFLICT(family_id) DO UPDATE SET weekly=excluded.weekly,exceptions=excluded.exceptions').run(user.id,JSON.stringify(s.weekly),JSON.stringify(s.exceptions));return reply(200,s);}
    }
    if(url.pathname==='/api/dashboard'&&req.method==='GET'){
      requireUser();if(!['family','admin'].includes(user.role))fail(403,'Dashboard is for families and administrators');
      const orders=user.role==='admin'?db.prepare('SELECT * FROM orders').all():db.prepare('SELECT * FROM orders WHERE family_id=?').all(user.id);
      const items=user.role==='admin'?db.prepare('SELECT i.*,p.name FROM order_items i JOIN products p ON p.id=i.product_id').all():db.prepare('SELECT i.*,p.name FROM order_items i JOIN products p ON p.id=i.product_id JOIN orders o ON o.id=i.order_id WHERE o.family_id=?').all(user.id);
      const now=demoMode&&!orders.some(o=>o.demo_key===null)?new Date('2026-10-10T00:00:00+03:00'):new Date();
      return reply(200,{...analytics(orders,items,now),asOf:now.toISOString(),asOfDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(now),scope:user.role,users:user.role==='admin'?db.prepare('SELECT COUNT(*) AS n FROM users WHERE demo_key IS NOT NULL').get().n:null});
    }
    if(url.pathname==='/api/admin/users'&&req.method==='GET'){
      requireUser('admin');return reply(200,db.prepare("SELECT u.id,u.name,u.role,u.approved,a.status FROM users u LEFT JOIN family_applications a ON a.family_id=u.id WHERE email!=? ORDER BY u.id DESC").all('seed@osrah.local'));
    }
    const applicationPath=url.pathname.match(/^\/api\/admin\/applications\/(\d+)$/);
    if(applicationPath&&req.method==='GET'){requireUser('admin');const row=db.prepare("SELECT u.id,u.name,u.email,u.approved,a.* FROM users u LEFT JOIN family_applications a ON a.family_id=u.id WHERE u.id=? AND u.role='family'").get(Number(applicationPath[1]));if(!row)fail(404,'Family not found');return reply(200,{...row,location:db.prepare('SELECT latitude,longitude,address,has_driver,synthetic FROM family_locations WHERE family_id=?').get(Number(applicationPath[1]))||null});}
    if(url.pathname==='/api/family/application'){
      requireUser('family');if(req.method==='GET')return reply(200,db.prepare('SELECT phone,city,license_number,license_expiry,status,reason FROM family_applications WHERE family_id=?').get(user.id)||null);
      if(req.method==='POST'){if(user.approved)fail(400,'Approved application cannot be replaced');const a=validateLicense(body);
      db.prepare("INSERT INTO family_applications(family_id,phone,city,license_number,license_expiry,filename,mime,document,submitted_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET phone=excluded.phone,city=excluded.city,license_number=excluded.license_number,license_expiry=excluded.license_expiry,filename=excluded.filename,mime=excluded.mime,document=excluded.document,status='pending',reason='',submitted_at=excluded.submitted_at").run(user.id,a.phone,a.city.trim(),a.licenseNumber.trim(),a.licenseExpiry,a.filename,a.mime,a.document,new Date().toISOString());return reply(200,{ok:true});}
    }
    if(url.pathname==='/api/admin/approve'&&req.method==='POST'){
      requireUser('admin');if(!Number.isSafeInteger(body.id)||typeof body.approved!=='boolean')fail(400,'Invalid account');
      const application=db.prepare('SELECT * FROM family_applications WHERE family_id=?').get(body.id);
      if(body.approved){if(!application)fail(400,'A license application is required before approval');validateLicense({phone:application.phone,city:application.city,licenseNumber:application.license_number,licenseExpiry:application.license_expiry,filename:application.filename,mime:application.mime,document:application.document});}
      if(!body.approved&&(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000))fail(400,'Enter a rejection reason');
      db.exec('BEGIN');try{const result=db.prepare("UPDATE users SET approved=? WHERE id=? AND role='family'").run(body.approved?1:0,body.id);if(!result.changes)fail(404,'Family not found');db.prepare('UPDATE family_applications SET status=?,reason=? WHERE family_id=?').run(body.approved?'approved':'rejected',body.approved?'':body.reason.trim(),body.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return reply(200,{ok:true});
    }
    if(url.pathname==='/api/orders'&&req.method==='GET'){
      requireUser();const field=user.role==='family'?'family_id':'customer_id';if(user.role==='admin')return reply(200,db.prepare('SELECT o.*,u.name AS family FROM orders o JOIN users u ON u.id=o.family_id ORDER BY o.id DESC LIMIT 100').all());
      return reply(200,db.prepare(`SELECT o.*,u.name AS family FROM orders o JOIN users u ON u.id=o.family_id WHERE o.${field}=? ORDER BY o.id DESC LIMIT 100`).all(user.id));
    }
    if(url.pathname==='/api/orders'&&req.method==='POST'){
      requireUser('customer');if(!demoMode)fail(403,'Ordering currently requires local demo mode; payments are simulated');
      if(!Number.isSafeInteger(body.productId)||!Number.isSafeInteger(body.quantity)||body.quantity<1||body.quantity>50)fail(400,'Invalid order');
      const p=catalog().find(p=>p.id===body.productId);if(!p)fail(404,'Product not found');
      const fulfillment=body.fulfillment??'pickup',location=db.prepare('SELECT * FROM family_locations WHERE family_id=?').get(p.family_id);
      if(!['pickup','family_delivery'].includes(fulfillment))fail(400,'Invalid fulfillment option');
      if(fulfillment==='family_delivery'&&(!location?.has_driver||typeof body.deliveryAddress!=='string'||!body.deliveryAddress.trim()||body.deliveryAddress.length>500))fail(400,'Family delivery requires a family driver and delivery address');
      if(p.stock<body.quantity)fail(409,'Not enough stock');if(!isAvailable(scheduleFor(p.family_id),body.scheduledAt)||Date.parse(body.scheduledAt)<Date.now()+p.preparation*3600000)fail(400,'Choose an available future time after preparation');
      db.exec('BEGIN IMMEDIATE');try{
        const updated=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(body.quantity,p.id,body.quantity);if(!updated.changes)fail(409,'Not enough stock');
        const row=db.prepare('INSERT INTO orders(customer_id,family_id,total,status,payment_status,scheduled_at,created_at,synthetic,fulfillment,delivery_address) VALUES(?,?,?,?,?,?,?,1,?,?)').run(user.id,p.family_id,p.price*body.quantity,'pending','simulated_paid',body.scheduledAt,new Date().toISOString(),fulfillment,fulfillment==='family_delivery'?body.deliveryAddress.trim():'');
        db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(Number(row.lastInsertRowid),p.id,body.quantity,p.price);db.exec('COMMIT');return reply(201,{id:Number(row.lastInsertRowid),simulated:true});
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    if(url.pathname==='/api/payments/tap/callback'&&req.method==='POST'){
      const chargeId=typeof body.id==='string'?body.id:body.charge?.id;if(typeof chargeId!=='string')return reply(400,{error:'Invalid payment notification'});
      const session=db.prepare('SELECT * FROM payment_sessions WHERE gateway_id=?').get(chargeId);if(!session)return reply(202,{received:true});
      try{await refreshTapPayment(session);return reply(200,{received:true});}catch(error){console.error('Tap callback verification failed:',error.message);return reply(202,{received:true});}
    }
    const paymentStatusPath=url.pathname.match(/^\/api\/payments\/([0-9a-f-]{36})$/i);
    if(paymentStatusPath&&req.method==='GET'){
      requireUser('customer');const session=db.prepare('SELECT * FROM payment_sessions WHERE id=? AND customer_id=?').get(paymentStatusPath[1],user.id);if(!session)fail(404,'Payment not found');
      try{return reply(200,await refreshTapPayment(session));}catch(error){console.error('Tap status verification failed:',error.message);fail(502,'Could not verify payment yet. Try again shortly');}
    }
    if(url.pathname==='/api/checkout'&&req.method==='POST'){
      requireUser('customer');const paymentMethod=body.paymentMethod??'online';if(!['online','cash'].includes(paymentMethod))fail(400,'Choose an available payment method');if(!demoMode&&paymentMethod==='online'&&!tapConfigured())fail(503,'Online payments are not configured');
      if(!Array.isArray(body.groups)||body.groups.length<1||body.groups.length>20)fail(400,'Invalid cart');
      const all=catalog(),seenFamilies=new Set(),prepared=[];
      for(const group of body.groups){
        if(!Number.isSafeInteger(group.familyId)||seenFamilies.has(group.familyId)||!Array.isArray(group.items)||group.items.length<1||group.items.length>50)fail(400,'Invalid cart');
        seenFamilies.add(group.familyId);const fulfillment=group.fulfillment??'pickup',location=db.prepare('SELECT * FROM family_locations WHERE family_id=?').get(group.familyId);
        if(!['pickup','family_delivery'].includes(fulfillment))fail(400,'Invalid fulfillment option');
        if(fulfillment==='family_delivery'&&(!location?.has_driver||typeof group.deliveryAddress!=='string'||!group.deliveryAddress.trim()||group.deliveryAddress.length>500))fail(400,'Family delivery requires a family driver and delivery address');
        const seenProducts=new Set(),items=[];let total=0;
        for(const item of group.items){
          if(!Number.isSafeInteger(item.productId)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>50||seenProducts.has(item.productId))fail(400,'Invalid order');
          seenProducts.add(item.productId);const p=all.find(row=>row.id===item.productId&&row.family_id===group.familyId);if(!p)fail(404,'Product not found');
          if(p.stock<item.quantity)fail(409,'Not enough stock');if(!isAvailable(scheduleFor(p.family_id),group.scheduledAt)||Date.parse(group.scheduledAt)<Date.now()+p.preparation*3600000)fail(400,'Choose an available future time after preparation');
          items.push({product:p,quantity:item.quantity});total+=p.price*item.quantity;
        }
        prepared.push({familyId:group.familyId,scheduledAt:group.scheduledAt,fulfillment,deliveryAddress:fulfillment==='family_delivery'?group.deliveryAddress.trim():'',items,total});
      }
      const paymentId=paymentMethod==='online'&&tapConfigured()?randomUUID():null;
      db.exec('BEGIN IMMEDIATE');try{
        const orders=[];
        for(const group of prepared){
          for(const item of group.items){const updated=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(item.quantity,item.product.id,item.quantity);if(!updated.changes)fail(409,'Not enough stock');}
          const paymentStatus=paymentMethod==='cash'?'cash_on_pickup':paymentId?'pending':'simulated_paid';
          const row=db.prepare('INSERT INTO orders(customer_id,family_id,total,status,payment_status,scheduled_at,created_at,synthetic,fulfillment,delivery_address) VALUES(?,?,?,?,?,?,?,?,?,?)').run(user.id,group.familyId,group.total,'pending',paymentStatus,group.scheduledAt,new Date().toISOString(),demoMode?1:0,group.fulfillment,group.deliveryAddress);
          for(const item of group.items)db.prepare('INSERT INTO order_items VALUES(?,?,?,?)').run(Number(row.lastInsertRowid),item.product.id,item.quantity,item.product.price);
          orders.push({id:Number(row.lastInsertRowid),familyId:group.familyId,total:group.total});
        }
        if(paymentId){const amount=orders.reduce((sum,order)=>sum+order.total,0),ids=JSON.stringify(orders.map(order=>order.id)),now=new Date().toISOString();if(amount<10)fail(400,'Online payment minimum is 0.10 SAR');db.prepare('INSERT INTO payment_sessions(id,customer_id,amount,method,status,order_ids,created_at,updated_at) VALUES(?,?,?,\'all_methods\',\'creating\',?,?,?)').run(paymentId,user.id,amount,ids,now,now);}
        db.exec('COMMIT');
        if(paymentId){try{const amount=orders.reduce((sum,order)=>sum+order.total,0);const checkout=await createTapCheckout({sessionId:paymentId,amount,customer:{name:user.name,email:user.email,language:body.language},description:`Osrah order ${paymentId}`});db.prepare("UPDATE payment_sessions SET gateway_id=?,checkout_url=?,status=?,updated_at=? WHERE id=?").run(checkout.id,checkout.checkoutUrl,checkout.status==='CAPTURED'?'paid':'pending',new Date().toISOString(),paymentId);if(checkout.status==='CAPTURED')db.prepare("UPDATE orders SET payment_status='paid' WHERE id IN (SELECT value FROM json_each(?)) AND payment_status='pending'").run(JSON.stringify(orders.map(order=>order.id)));return reply(201,{orders,paymentRequired:checkout.status!=='CAPTURED',paymentId,checkoutUrl:checkout.checkoutUrl});}catch(error){const session=db.prepare('SELECT * FROM payment_sessions WHERE id=?').get(paymentId);if(session)failPendingPayment(session);console.error('Tap checkout initialization failed:',error.message);return reply(502,{error:'Could not start secure payment. Your cart is unchanged; please try again.'});}}
        return reply(201,{orders,paymentMethod,simulated:paymentMethod==='online'});
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    if(url.pathname==='/api/order/status'&&req.method==='POST'){
      requireUser('family');const o=db.prepare('SELECT * FROM orders WHERE id=? AND family_id=?').get(Number(body.id),user.id);if(!o)fail(404,'Order not found');if(o.payment_status==='pending')fail(409,'Wait for payment confirmation before preparing this order');const next={pending:'preparing',preparing:'ready',ready:'delivered'}[o.status];if(body.status!==next)fail(400,'Invalid status transition');db.prepare('UPDATE orders SET status=? WHERE id=?').run(next,o.id);return reply(200,{ok:true});
    }
    return false;
}
