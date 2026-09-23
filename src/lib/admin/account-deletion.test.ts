import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountDeletionService, type DeletionOperation, type DeletionContext } from './account-deletion';
import type { Actor, Target } from './policy';
const actor: Actor = { id:'admin', role:'super_admin', owner:false, suspended:false, credentialVersion:'v', reauthenticatedAt:Date.now() };
function fixture() {
  let operation: DeletionOperation | null = null;
  let removed = false, billingFailure = false, photoFailure = false, ackFailure = false, discoveryReady = true, discoveries = 0;
  let cancellations = 0;
  const objects = new Set(['target/a.jpg','spider/b.jpg']);
  const live = {...actor};
  const target: Target = {id:'target',role:'user',owner:false,demo:false};
  const user = {pendingCheckout:false,email:'target@example.com',accountVersion:3,deletingAt:null as Date|null,stripeCustomerId:'cus_target',stripeSubscriptionId:'sub_target'};
  const service = createAccountDeletionService({
    findTarget:async () => 'target', now:() => new Date(), randomId:() => 'op',
    withLocked:async (_target, _operation, work) => {
      const ctx: DeletionContext = {actor:live,target,user:removed?null:user,operation,
        discoverPhotos:async () => { discoveries++; return discoveryReady; },
        photosReady:async () => true,
        acknowledgePhotos:async keys=>{operation={...operation!,keys:operation!.keys.filter(key=>!keys.includes(key))};},
        snapshot:async () => ({keys:[...objects],spiderCount:1,eventCount:2,photoCount:2,subscriptionPresent:true}),
        begin:async op => {operation=op;user.deletingAt=new Date();},
        checkpoint:async stage => {if(ackFailure){ackFailure=false;throw Error('db acknowledgment');} operation={...operation!,stage};},
        complete:async () => {removed=true;operation={...operation!,stage:'completed',keys:[]};},
      };
      return work(ctx);
    },
    cancelBilling:async () => {if(billingFailure)throw Error('Stripe unavailable'); cancellations++;},
    deletePhoto:async key => {if(photoFailure && key==='spider/b.jpg')throw Error('Storage unavailable');objects.delete(key);},
  });
  const begin = () => service.beginAccountDeletion(actor,{targetId:'target',version:3,confirmationEmail:'target@example.com',reason:'Requested deletion'});
  return {service,begin,live,target,user,objects,get operation(){return operation;},get removed(){return removed;},get cancellations(){return cancellations;},get discoveries(){return discoveries;},pauseDiscovery:()=>{discoveryReady=false;},resumeDiscovery:()=>{discoveryReady=true;},failBilling:()=>{billingFailure=true;},recoverBilling:()=>{billingFailure=false;},failPhoto:()=>{photoFailure=true;},recoverPhoto:()=>{photoFailure=false;},failAck:()=>{ackFailure=true;}};
}
test('rejects owner, ordinary/admin actors, self and stale/email confirmations before blocking access',async()=>{
  for(const variant of ['owner','admin','ordinary','self','version','email']) {
    const f=fixture(); if(variant==='owner')f.target.owner=true;
    if(variant==='admin')f.live.role='admin';if(variant==='ordinary')f.live.role='user';if(variant==='self')f.target.id=actor.id;
    await assert.rejects(f.service.beginAccountDeletion(actor,{targetId:'target',version:variant==='version'?2:3,confirmationEmail:variant==='email'?'other@example.com':'target@example.com',reason:'Requested deletion'}));
    assert.equal(f.operation,null);
  }
});
test('double submission resumes one operation and revokes access before external work',async()=>{
 const f=fixture(); assert.equal(await f.begin(),'op'); assert.equal(await f.begin(),'op'); assert.ok(f.user.deletingAt);assert.equal(f.cancellations,0);
});
test('photo discovery is resumable only after the durable receipt blocks access',async()=>{
 const f=fixture();f.pauseDiscovery();assert.equal(await f.begin(),'op');assert.ok(f.operation);assert.ok(f.user.deletingAt);
 assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'blocked_access');assert.equal(f.cancellations,0);assert.equal(f.removed,false);assert.equal(f.discoveries,1);
 f.resumeDiscovery();assert.notEqual(await f.service.resumeAccountDeletion(actor,'op'),'blocked_access');assert.ok(f.cancellations>0);
});
test('Stripe failure leaves access blocked, photos and account intact',async()=>{
 const f=fixture();await f.begin();f.failBilling();assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'blocked_access');assert.equal(f.objects.size,2);assert.equal(f.removed,false);
});
test('partial photo removal remains pending and retry deletes exactly recorded objects',async()=>{
 const f=fixture();await f.begin();f.objects.add('foreign/keep.jpg');f.failPhoto();assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'billing_canceled');assert.equal(f.removed,false);assert.ok(f.objects.has('foreign/keep.jpg'));
 f.recoverPhoto();assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'completed');assert.deepEqual([...f.objects],['foreign/keep.jpg']);assert.deepEqual(f.operation?.keys,[]);
});
test('successful external work with failed database acknowledgment is safely repeated',async()=>{
 const f=fixture();await f.begin();f.failAck();await assert.rejects(f.service.resumeAccountDeletion(actor,'op'),/acknowledgment/);assert.equal(f.operation?.stage,'blocked_access');assert.equal(f.removed,false);
 assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'completed');assert.equal(f.cancellations,3);
});
test('every retry reauthorizes current actor and rejects forged actor identity',async()=>{
 const f=fixture();await f.begin();f.live.role='user';await assert.rejects(f.service.resumeAccountDeletion(actor,'op'));assert.equal(f.cancellations,0);
 f.live.role='super_admin';await assert.rejects(f.service.resumeAccountDeletion({...actor,id:'forged'},'op'));assert.equal(f.cancellations,0);
});

test('large photo manifests make durable bounded progress across retries',async()=>{
 const f=fixture();for(let i=0;i<11;i++)f.objects.add('target/batch-'+i);await f.begin();
 assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'billing_canceled');assert.equal(f.operation?.keys.length,8);assert.equal(f.removed,false);
 assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'billing_canceled');assert.equal(f.operation?.keys.length,3);
 assert.equal(await f.service.resumeAccountDeletion(actor,'op'),'completed');assert.equal(f.objects.size,0);
});

test('unresolved checkout blocks deletion before access is disabled, even without acknowledged billing IDs', async () => {
 const f=fixture();f.user.pendingCheckout=true;f.user.stripeCustomerId=null!;f.user.stripeSubscriptionId=null!;
 await assert.rejects(f.begin(),/checkout/i);assert.equal(f.user.deletingAt,null);assert.equal(f.operation,null);
});
