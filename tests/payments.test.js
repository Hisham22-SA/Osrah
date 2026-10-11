import test from 'node:test';
import assert from 'node:assert/strict';
import { createTapCheckout, paymentReturnUrl, retrieveTapCharge } from '../tap-payments.js';

test('Tap checkout requests all merchant-enabled methods and keeps the secret server-side', async()=>{
  const previous={key:process.env.TAP_SECRET_KEY,url:process.env.OSRAH_PUBLIC_URL,api:process.env.TAP_API_URL,fetch:globalThis.fetch};
  process.env.TAP_SECRET_KEY='sk_test_example';process.env.OSRAH_PUBLIC_URL='https://osrah.example';process.env.TAP_API_URL='https://tap.test/v2';
  let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return new Response(JSON.stringify({id:'chg_test123',status:'INITIATED',transaction:{url:'https://checkout.tap.example/pay/123'}}),{status:200,headers:{'Content-Type':'application/json'}});};
  try{
    const checkout=await createTapCheckout({sessionId:'11111111-2222-4333-8444-555555555555',amount:12345,customer:{name:'عميل تجريبي',email:'customer@example.test',language:'ar'},description:'Osrah test'});
    assert.equal(checkout.id,'chg_test123');assert.equal(checkout.checkoutUrl,'https://checkout.tap.example/pay/123');
    assert.equal(request.url,'https://tap.test/v2/charges/');assert.equal(request.options.headers.authorization,'Bearer sk_test_example');assert.equal(request.options.headers.lang_code,'ar');
    const body=JSON.parse(request.options.body);assert.equal(body.amount,123.45);assert.equal(body.currency,'SAR');assert.equal(body.source.id,'src_all');assert.equal(body.save_card,false);assert.equal(body.redirect.url,'https://osrah.example/payment-return');assert.equal(body.post.url,'https://osrah.example/api/payments/tap/callback');assert.equal(JSON.stringify(body).includes('sk_test_example'),false);
  }finally{globalThis.fetch=previous.fetch;for(const [key,value] of Object.entries({TAP_SECRET_KEY:previous.key,OSRAH_PUBLIC_URL:previous.url,TAP_API_URL:previous.api})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('real payment redirects require a public HTTPS return address',()=>{
  const previous=process.env.OSRAH_PUBLIC_URL;delete process.env.OSRAH_PUBLIC_URL;
  try{assert.throws(()=>paymentReturnUrl(),/public HTTPS/);}finally{if(previous!==undefined)process.env.OSRAH_PUBLIC_URL=previous;}
});

test('Tap charge lookup accepts charge IDs and rejects arbitrary paths',async()=>{
  const previous={key:process.env.TAP_SECRET_KEY,api:process.env.TAP_API_URL,fetch:globalThis.fetch};process.env.TAP_SECRET_KEY='sk_test_example';process.env.TAP_API_URL='https://tap.test/v2';
  let requested='';globalThis.fetch=async(url)=>{requested=url;return new Response(JSON.stringify({id:'chg_abc_123',status:'CAPTURED'}),{status:200});};
  try{assert.equal((await retrieveTapCharge('chg_abc_123')).status,'CAPTURED');assert.equal(requested,'https://tap.test/v2/charges/chg_abc_123');await assert.rejects(()=>retrieveTapCharge('https://evil.test/path'),/Invalid payment reference/);}
  finally{globalThis.fetch=previous.fetch;if(previous.key===undefined)delete process.env.TAP_SECRET_KEY;else process.env.TAP_SECRET_KEY=previous.key;if(previous.api===undefined)delete process.env.TAP_API_URL;else process.env.TAP_API_URL=previous.api;}
});
