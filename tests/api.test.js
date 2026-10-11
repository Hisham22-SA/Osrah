import test from 'node:test';
import assert from 'node:assert/strict';
process.env.OSRAH_DB=':memory:';
const {server}=await import('../server.js');
test('family registration requires a license and protects pending access',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 const req=(path,body,cookie)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{const account={name:'Test Family',email:'test@example.test',password:'strong-test-password',role:'family',location:{latitude:24.72,longitude:46.67,address:'Test address',hasDriver:false}};
 assert.equal((await req('register',account)).status,400);
 const application={phone:'0501234567',city:'Riyadh',licenseNumber:'TEST-123',licenseExpiry:'2030-12-31',filename:'test.pdf',mime:'application/pdf',document:Buffer.from('%PDF-1.4 test').toString('base64')};
 assert.equal((await req('register',{...account,application:{...application,document:Buffer.from('wrong').toString('base64')}})).status,400);
 assert.equal((await req('register',{...account,application:{...application,licenseExpiry:'2020-01-01'}})).status,400);
 assert.equal((await req('register',{...account,application,location:undefined})).status,400);
 assert.equal((await req('register',{...account,application,location:{...account.location,hasDriver:undefined}})).status,400);
 assert.equal((await req('register',{...account,application})).status,201);
 const login=await req('login',account);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await(await req('me',undefined,cookie)).json()).role,'family');
 assert.equal((await(await req('me',undefined,'$Version="1"; '+cookie.replace('session=','session="')+'"; $Path="/"')).json()).role,'family');
 assert.equal((await req('products',{name:'Pending product'},cookie)).status,403);
 assert.equal((await req('admin/applications/1',undefined,cookie)).status,403);
 assert.equal((await(await req('family/application',undefined,cookie)).json()).status,'pending');
 await req('logout',{},cookie);assert.equal(await(await req('me',undefined,cookie)).json(),null);
 }finally{await new Promise(r=>server.close(r));}
});
