import { db } from "./database.js";
import { featureApi } from './features-api.js';
import { importDemo,importDemoLocations } from "./import-demo.js";
import { expandDemoFoods } from './expand-demo-foods.js';
import { validateLicense } from './license.js';
import { validateLocation } from './locations.js';
import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const demoMode=process.argv.includes("--demo")||process.env.OSRAH_DEMO==="1";
const hash = password => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); };
const matches = (password, stored) => { const [salt, digest] = stored.split(':'); return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex')); };
if (!db.prepare('SELECT id FROM products LIMIT 1').get()) {
  db.prepare('INSERT OR IGNORE INTO users(name,email,password,role,approved) VALUES(?,?,?,?,1)').run('Dar Al Bayt','seed@osrah.local',hash(randomBytes(32).toString('hex')),'family');
  const family = db.prepare('SELECT id FROM users WHERE email=?').get('seed@osrah.local');
  const insert = db.prepare('INSERT INTO products(family_id,name,description,category,region,price,stock,preparation,delivery) VALUES(?,?,?,?,?,?,?,?,?)');
  for (const p of [['Date maamoul','Handmade date pastries, baked fresh for your gathering.','Food','Riyadh',4500,24,24,'both'],['Woven basket','A carefully woven basket for a warm and welcoming home.','Crafts','Jeddah',8500,8,48,'both'],['Cardamom cake','A soft homemade cake with fragrant Saudi cardamom.','Food','Dammam',6500,12,24,'pickup'],['Embroidered pouch','A handmade pouch inspired by traditional patterns.','Crafts','Riyadh',3500,15,48,'both']]) insert.run(family.id,...p);
}
const safeUser = user => ({ id:user.id,name:user.name,email:user.email,role:user.role,approved:Boolean(user.approved) });
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
if(demoMode){importDemo();importDemoLocations();expandDemoFoods();}
export const server = http.createServer(async (req,res) => {
  const send = (status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url,'http://localhost');
    if(url.pathname==='/payment-return'&&req.method==='GET'){
      res.writeHead(302,{'Location':'osrah://payment-complete','Cache-Control':'no-store'});return res.end();
    }
    if (!url.pathname.startsWith('/api/')) {
      const files = {'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
      const asset = files[url.pathname];
      if (!asset) return send(404,{error:'Not found'});
      res.writeHead(200,{'Content-Type':asset[1]+'; charset=utf-8','X-Content-Type-Options':'nosniff'});
      return res.end(readFileSync(new URL('./public/'+asset[0],import.meta.url)));
    }
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) fail(403,'Invalid origin');
    const token = req.headers.cookie?.match(/(?:^|;\s*)session="?([a-f0-9]{64})"?(?:;|$)/)?.[1];
    const user = token ? db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(token,Date.now()) : null;
    const requireUser = role => { if (!user) fail(401,'Please sign in'); if (role && user.role !== role) fail(403,'Access denied'); };
    let body = {};
    if (req.method !== 'GET') {
      let raw=''; const limit=url.pathname==='/api/register'||url.pathname==='/api/family/application'?4300000:16000; for await (const chunk of req) { raw+=chunk; if (Buffer.byteLength(raw)>limit) fail(413,'Request too large'); }
      try { body = raw ? JSON.parse(raw) : {}; } catch { fail(400,'Invalid JSON'); }
      if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid JSON object');
    }
    if(await featureApi({url,req,res,user,body,send,requireUser,demoMode}))return;
    if (url.pathname === '/api/products' && req.method === 'GET') return send(200,db.prepare('SELECT p.*,u.name AS family FROM products p JOIN users u ON u.id=p.family_id WHERE u.approved=1 ORDER BY p.id DESC').all());
    if (url.pathname === '/api/me' && req.method === 'GET') return send(200,user ? safeUser(user) : null);
    if (url.pathname === '/api/register' && req.method === 'POST') {
      const {name,email,password,role}=body;
      if (typeof name!=='string'||name.trim().length<2||name.length>100||typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>128||!['customer','family'].includes(role)) fail(400,'Enter a name, valid email, and password of 10–128 characters');
      if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase())) fail(409,'Email is already registered');
      const application=role==='family'?validateLicense(body.application):null;
      const location=role==='family'?validateLocation(body.location):null;
      db.exec('BEGIN');try{
      const result=db.prepare('INSERT INTO users(name,email,password,role,approved) VALUES(?,?,?,?,?)').run(name.trim(),email.toLowerCase(),hash(password),role,role==='customer'?1:0);
      if(application)db.prepare('INSERT INTO family_applications(family_id,phone,city,license_number,license_expiry,filename,mime,document,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)').run(result.lastInsertRowid,application.phone,application.city.trim(),application.licenseNumber.trim(),application.licenseExpiry,application.filename,application.mime,application.document,new Date().toISOString());
      if(location)db.prepare('INSERT INTO family_locations(family_id,latitude,longitude,address,has_driver) VALUES(?,?,?,?,?)').run(result.lastInsertRowid,location.latitude,location.longitude,location.address,location.hasDriver?1:0);
      db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      return send(201,{message:role==='family'?'Account created. Family approval is required.':'Account created. Please sign in.'});
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      if (typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>128) fail(400,'Invalid credentials');
      const found=db.prepare('SELECT * FROM users WHERE email=?').get(body.email.toLowerCase());
      if (!found||!matches(body.password,found.password)) fail(401,'Incorrect email or password');
      const session=randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(session,found.id,Date.now()+86400000);
      res.setHeader('Set-Cookie',`session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
      return send(200,safeUser(found));
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
      if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(200,{ok:true});
    }
    if (url.pathname === '/api/family/products' && req.method === 'GET') { requireUser('family'); return send(200,db.prepare('SELECT * FROM products WHERE family_id=?').all(user.id)); }
    if (url.pathname === '/api/products' && req.method === 'POST') {
      requireUser('family'); if(!user.approved) fail(403,'Your family account is awaiting approval');
      const {name,description,category,region,price,stock,preparation,delivery}=body;
      if (![name,description,category,region].every(x=>typeof x==='string'&&x.trim()&&x.length<=1000)||!Number.isInteger(price)||price<=0||price>10000000||!Number.isInteger(stock)||stock<0||!Number.isInteger(preparation)||preparation<0||!['pickup','delivery','both'].includes(delivery)) fail(400,'Invalid product details');
      const result=db.prepare('INSERT INTO products(family_id,name,description,category,region,price,stock,preparation,delivery) VALUES(?,?,?,?,?,?,?,?,?)').run(user.id,name.trim(),description.trim(),category,region,price,stock,preparation,delivery);
      return send(201,{id:Number(result.lastInsertRowid)});
    }
    send(404,{error:'Not found'});
  } catch(error) { if(!error.status) console.error(error); send(error.status||500,{error:error.status?error.message:'Unexpected server error'}); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Osrah running at http://localhost:3000'));

