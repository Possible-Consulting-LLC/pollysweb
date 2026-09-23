import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as engine from './account-deletion';
import * as photos from './deletion-photos';
import * as external from './deletion-external';
import * as media from '../photo-media';
import type {Actor,Target} from './policy';
import type * as storeModule from './deletion-store';

type Ledger={key:string;userId:string;settled:boolean};
function fixture(settled:boolean) {
 const actor:Actor={id:'admin',role:'super_admin',owner:false,suspended:false,credentialVersion:'v',reauthenticatedAt:Date.now()};
 const target:Target={id:'target',role:'user',owner:false,demo:false};
 let user:{email:string;accountVersion:number;deletingAt:Date|null;stripeCustomerId:null;stripeSubscriptionId:null}|null={email:'target@example.com',accountVersion:1,deletingAt:null,stripeCustomerId:null,stripeSubscriptionId:null};
 let operation:Record<string,unknown>|null=null;
 let ledger:Ledger[]=[{key:'former-spider/owned.jpg',userId:'target',settled},{key:'foreign-spider/keep.jpg',userId:'foreign',settled:false}];
 const objects=new Set(ledger.map(row=>row.key));
 const audits:Array<Record<string,unknown>>=[];
 const empty={findMany:async()=>[],findFirst:async()=>null,count:async()=>0};
 const db={
  user:{findMany:async()=>[],findFirst:async()=>null,findUnique:async()=>user,update:async({data}:{data:Partial<NonNullable<typeof user>>})=>{Object.assign(user!,data);},delete:async()=>{assert.equal(objects.has('former-spider/owned.jpg'),false,'Account cannot disappear while its object remains');user=null;}},
  accountDeletionOperation:{findUnique:async()=>operation,findUniqueOrThrow:async()=>{assert.ok(operation);return operation;},
   create:async({data}:{data:Record<string,unknown>})=>{operation={...data};},update:async({data}:{data:Record<string,unknown>})=>{operation={...operation,...data};}},
  ownedUpload:{findMany:async({where,take}:{where:{userId:string|{not:string};key?:{gt?:string;in?:string[]}};take?:number})=>ledger.filter(row=>
    typeof where.userId==='string'?row.userId===where.userId:row.userId!==where.userId.not
  ).filter(row=>!where.key?.gt||row.key>where.key.gt).filter(row=>!where.key?.in||where.key.in.includes(row.key)).slice(0,take),count:async({where}:{where:{userId:string;settled?:boolean}})=>ledger.filter(row=>row.userId===where.userId&&(where.settled===undefined||row.settled===where.settled)).length,
   findFirst:async({where}:{where:{userId:{not:string};key:string}})=>ledger.find(row=>row.userId!==where.userId.not&&row.key===where.key)??null,
   updateMany:async({where,data}:{where:{userId:string;key:{in:string[]};settled:boolean};data:{settled:boolean}})=>{let count=0;for(const row of ledger)if(row.userId===where.userId&&where.key.in.includes(row.key)&&row.settled===where.settled){row.settled=data.settled;count++;}return {count};},
   deleteMany:async({where}:{where:{userId:string}})=>{ledger=ledger.filter(row=>row.userId!==where.userId);}},
  spider:empty,photo:empty,enclosure:empty,feedingEvent:empty,mistingEvent:empty,moltEvent:empty,observationEvent:empty,bodyConditionEvent:empty,enclosureMaintenanceEvent:empty,
  adminTestSession:{findMany:async()=>[],deleteMany:async()=>{}},
  adminReauth:{deleteMany:async()=>{}},pendingEmailVerification:{deleteMany:async()=>{}},$queryRaw:async()=>[],
 };
 const dependencies:Record<string,unknown>={
  'server-only':{},'node:crypto':{randomUUID:()=> 'operation'},'../db':{prisma:db},
  './actor':{requireAdminActor:async()=>actor,withAccountDeletionMutation:async(targetId:string,operationId:string|undefined,work:(...args:unknown[])=>Promise<unknown>)=>{assert.equal(targetId,'target');if(operationId)assert.equal(operationId,operation?.id);return work(db,actor,target);}},
  './audit':{appendAudit:async(_tx:unknown,input:Record<string,unknown>)=>{audits.push(input);}},
  './deletion-photos':photos,'./account-deletion':engine,'./deletion-external':external,
  '../stripe':{getStripe:()=>{throw Error('Unexpected billing access');}},
  '../supabase':{
   isSupabaseConfigured:()=>true,
   getSupabaseAdmin:()=>({storage:{from:(bucket:string)=>{
    assert.equal(bucket,'spoods');
    return {remove:async(keys:string[])=>{for(const key of keys)objects.delete(key);return {error:null};}};
   }}}),
  },
  '../photo-media':media,
 };
 const exports:Record<string,unknown>={};
 const code=ts.transpileModule(readFileSync(new URL('./deletion-store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,process:{env:{}},require:(name:string)=>{assert.ok(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];}});
 return {api:exports as typeof storeModule,actor,objects,audits,get user(){return user;},get operation(){return operation;},get ledger(){return ledger;}};
}
for(const initiallySettled of [true,false])test(`former-spider ${initiallySettled?'settled':'unsettled'} upload survives manifest, recovery, and final cleanup`,async()=>{
 const f=fixture(initiallySettled);
 const id=await f.api.beginAccountDeletion(f.actor,{targetId:'target',version:1,confirmationEmail:'target@example.com',reason:'Requested deletion'});
 assert.deepEqual(photos.parseDeletionPhotoManifest(f.operation!.manifest).keys,[],'receipt exists before discovery');
 assert.equal(await f.api.resumeAccountDeletion(f.actor,id),'blocked_access');
 assert.deepEqual(photos.parseDeletionPhotoManifest(f.operation!.manifest).keys,['former-spider/owned.jpg']);
 if(!initiallySettled) {
  assert.equal(await f.api.resumeAccountDeletion(f.actor,id),'billing_canceled');assert.ok(f.user);assert.ok(f.objects.has('former-spider/owned.jpg'));
  await assert.rejects(f.api.acknowledgeEndedUploads('target',id,false,'Reviewed upload logs'));
  await f.api.acknowledgeEndedUploads('target',id,true,'Reviewed upload termination logs');
  assert.equal(f.ledger.find(row=>row.userId==='target')?.settled,true);
  assert.deepEqual(photos.parseDeletionPhotoManifest(f.operation!.manifest).keys,['former-spider/owned.jpg'],'Support review retains the key for strict removal');
 }
 assert.equal(await f.api.resumeAccountDeletion(f.actor,id),'completed');assert.equal(f.user,null);assert.equal(f.objects.has('former-spider/owned.jpg'),false);
 assert.deepEqual([...f.objects],['foreign-spider/keep.jpg']);assert.deepEqual(f.ledger,[{key:'foreign-spider/keep.jpg',userId:'foreign',settled:false}]);
 assert.deepEqual(photos.parseDeletionPhotoManifest(f.operation!.manifest).keys,[]);assert.ok(f.audits.some(row=>row.action==='account.deletion.completed'));
});
