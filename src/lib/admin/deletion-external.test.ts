import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {createDeletionBilling,createStrictPhotoDeletion} from './deletion-external';
import type {DeletionOperation} from './account-deletion';
const op:DeletionOperation={id:'op',targetId:'target',stage:'blocked_access',keys:[],customerId:'cus_target',subscriptionId:'sub_old',spiderCount:0,eventCount:0,photoCount:0,subscriptionPresent:true};
function fixture() {
 const sessions=[{id:'checkout',status:'open',mode:'subscription',metadata:{userId:'target'},subscription:null as string|null}];
 const subscriptions=[{id:'sub_old',customer:'cus_target',metadata:{userId:'target'},status:'canceled'},{id:'sub_later_page',customer:'cus_target',metadata:{userId:'target'},status:'active'}];
 const keys:string[]=[];let cancelFails=false;
 const stripe={customers:{retrieve:async()=>({id:'cus_target',metadata:{userId:'target'}})},checkout:{sessions:{
  list:({status}:{status?:string})=>(async function*(){for(const session of sessions)if(!status||session.status===status)yield session;})(),
  expire:async(id:string,_:unknown,options:{idempotencyKey:string})=>{keys.push(options.idempotencyKey);const session=sessions.find(s=>s.id===id)!;session.status='expired';return session;},
 }},subscriptions:{
  list:()=>(async function*(){for(const sub of subscriptions)yield sub;})(),
  retrieve:async(id:string)=>subscriptions.find(s=>s.id===id),
  cancel:async(id:string,params:{invoice_now:boolean;prorate:boolean},options:{idempotencyKey:string})=>{assert.equal(params.invoice_now,false);assert.equal(params.prorate,false);if(cancelFails)throw Error('unavailable');keys.push(options.idempotencyKey);const sub=subscriptions.find(s=>s.id===id)!;sub.status='canceled';return sub;},
 }};
 return {sessions,subscriptions,keys,run:()=>createDeletionBilling(()=>stripe as unknown as Stripe)(op),fail:()=>{cancelFails=true;}};
}
test('expires active checkout and cancels all pages with stable keys, safe repeat after lost acknowledgment',async()=>{
 const f=fixture();await f.run();await f.run();assert.equal(f.sessions[0].status,'expired');assert.ok(f.subscriptions.every(s=>s.status==='canceled'));assert.deepEqual(f.keys,['delete-op-expire-checkout','delete-op-cancel-sub_later_page']);
});
test('Stripe cancellation failure and completed checkout without subscription remain unresolved',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.run());assert.equal(f.subscriptions[1].status,'active');
 const g=fixture();g.sessions[0].status='complete';await assert.rejects(g.run(),/processing/);
});
test('foreign subscription ownership blocks cancellation',async()=>{
 const f=fixture();f.subscriptions[1].customer='cus_foreign';await assert.rejects(f.run(),/ownership/);assert.equal(f.subscriptions[1].status,'active');
});
test('storage adapter propagates returned errors and thrown transport failures',async()=>{
 await assert.rejects(createStrictPhotoDeletion(async()=>({error:{message:'failed'}}))('target/key'));
 await assert.rejects(createStrictPhotoDeletion(async()=>{throw Error('transport');})('target/key'));
 await createStrictPhotoDeletion(async()=>({error:null}))('target/already-absent');
});
