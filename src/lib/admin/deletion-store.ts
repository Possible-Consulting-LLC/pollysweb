import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AccountDeletionOperation, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { withAccountDeletionMutation, requireAdminActor } from './actor';
import { appendAudit } from './audit';
import { discoverDeletionPhotoPage, initialDeletionPhotoManifest, parseDeletionPhotoManifest } from './deletion-photos';
import { createAccountDeletionService, type DeletionOperation, type DeleteStage } from './account-deletion';
import { createDeletionBilling, createStrictPhotoDeletion } from './deletion-external';
import { getStripe } from '../stripe';
import { getSupabaseAdmin, isSupabaseConfigured } from '../supabase';
import { SPOODS_BUCKET } from '../photo-media';
const fromRow=(row:AccountDeletionOperation):DeletionOperation=>{const manifest=parseDeletionPhotoManifest(row.manifest);return {...row,keys:manifest.keys,discoveryComplete:manifest.complete,stage:row.stage as DeleteStage};};
const origin=()=>process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
async function deletionImpact(tx: Prisma.TransactionClient, targetId: string) {
 const where={spider:{userId:targetId}};
 const [spiderCount,...counts]=await Promise.all([
  tx.spider.count({where:{userId:targetId}}),
  tx.feedingEvent.count({where}),tx.mistingEvent.count({where}),tx.moltEvent.count({where}),tx.observationEvent.count({where}),tx.bodyConditionEvent.count({where}),
  tx.enclosureMaintenanceEvent.count({where:{enclosure:{spider:{userId:targetId}}}}),
 ]);
 const user=await tx.user.findUnique({where:{id:targetId},select:{image:true}});
 const [profiles,photos,enclosures,feedingPhotos,moltPhotos,postMoltPhotos,observationPhotos,uploads]=await Promise.all([
  tx.spider.count({where:{userId:targetId,profilePhoto:{not:null}}}),tx.photo.count({where}),
  tx.enclosure.count({where:{spider:{userId:targetId},photo:{not:null}}}),tx.feedingEvent.count({where:{...where,photoUrl:{not:null}}}),
  tx.moltEvent.count({where:{...where,moltPhoto:{not:null}}}),tx.moltEvent.count({where:{...where,postMoltPhoto:{not:null}}}),
  tx.observationEvent.count({where:{...where,photoUrl:{not:null}}}),tx.ownedUpload.count({where:{userId:targetId}}),
 ]);
 return {spiderCount,eventCount:counts.reduce((a,b)=>a+b,0),photoCount:(user?.image?1:0)+profiles+photos+enclosures+feedingPhotos+moltPhotos+postMoltPhotos+observationPhotos+uploads};
}
const service=createAccountDeletionService({
 now:()=>new Date(),randomId:randomUUID,
 findTarget:async id=>{await requireAdminActor('super_admin');const op=await prisma.accountDeletionOperation.findUniqueOrThrow({where:{id},select:{targetId:true}});return op.targetId;},
 withLocked:(targetId,operationId,work)=>withAccountDeletionMutation(targetId,operationId,async(tx,actor,target)=>{
  const row=await tx.accountDeletionOperation.findUnique({where:{targetId}});
  const user=await tx.user.findUnique({where:{id:targetId},select:{email:true,accountVersion:true,deletingAt:true,stripeCustomerId:true,stripeSubscriptionId:true,billingCheckoutIntent:{select:{id:true}}}});
  return work({actor,target,user:user?{...user,pendingCheckout:Boolean(user.billingCheckoutIntent)}:null,operation:row?fromRow(row):null,
   snapshot:async()=>{
    const impact=await deletionImpact(tx,targetId);
    return {...impact,keys:[],subscriptionPresent:Boolean(user?.stripeSubscriptionId || user?.stripeCustomerId || user?.billingCheckoutIntent)};
   },
   begin:async(op,reason)=>{
    await tx.accountDeletionOperation.create({data:{
     id:op.id,targetId:op.targetId,stage:op.stage,customerId:op.customerId,subscriptionId:op.subscriptionId,
     spiderCount:op.spiderCount,eventCount:op.eventCount,photoCount:op.photoCount,subscriptionPresent:op.subscriptionPresent,
     manifest:initialDeletionPhotoManifest(),targetRole:target.role,
    }});
    await tx.adminReauth.deleteMany({where:{actorId:targetId}});
    for(const test of await tx.adminTestSession.findMany({where:{OR:[{actorId:targetId},{targetId}],endedAt:null}})) {
      const ended = await tx.adminTestSession.updateMany({where:{id:test.id,endedAt:null},data:{endedAt:new Date()}});
      if(ended.count) await appendAudit(tx,{actorId:test.actorId,targetId:test.targetId,action:'test.revoked',reason:'Account deletion',changes:{testSessionId:test.id}});
    }
    await tx.adminTestSession.deleteMany({where:{OR:[{actorId:targetId},{targetId}]}});
    await tx.pendingEmailVerification.deleteMany({where:{userId:targetId}});
    await tx.user.update({where:{id:targetId},data:{deletingAt:new Date(),authVersion:randomUUID(),emailChangeVersion:randomUUID(),accountVersion:{increment:1}}});
    await appendAudit(tx,{actorId:actor.id,targetId,action:'account.deletion.started',reason,changes:{operationId:op.id,spiderCount:op.spiderCount,eventCount:op.eventCount,photoCount:op.photoCount,subscriptionPresent:op.subscriptionPresent}});
   },
   discoverPhotos:async()=>{
    const manifest=parseDeletionPhotoManifest(row!.manifest);
    const next=await discoverDeletionPhotoPage(tx,targetId,origin(),manifest);
    await tx.accountDeletionOperation.update({where:{targetId},data:{manifest:next,photoCount:next.keys.length}});
    return next.complete;
   },
   checkpoint:async stage=>{await tx.accountDeletionOperation.update({where:{targetId},data:{stage}});},
   photosReady:async()=>!await tx.ownedUpload.count({where:{userId:targetId,settled:false}}),
   acknowledgePhotos:async keys=>{const manifest=parseDeletionPhotoManifest(row!.manifest);await tx.accountDeletionOperation.update({where:{targetId},data:{manifest:{...manifest,keys:manifest.keys.filter(key=>!keys.includes(key))}}});},
   complete:async()=>{
    await tx.$queryRaw`SELECT set_config('app.account_deletion_target', ${targetId}, true)`;
    // Exact userId only: no email-domain, prefix, requester, or other-account deletion.
    await tx.pendingEmailVerification.deleteMany({where:{userId:targetId}});
    await tx.adminReauth.deleteMany({where:{actorId:targetId}});
    await tx.adminTestSession.deleteMany({where:{OR:[{actorId:targetId},{targetId}]}});
    await tx.ownedUpload.deleteMany({where:{userId:targetId}});
    await tx.user.delete({where:{id:targetId}});
    await tx.accountDeletionOperation.update({where:{targetId},data:{stage:'completed',manifest:{...initialDeletionPhotoManifest(),source:8,complete:true},customerId:null,subscriptionId:null,completedAt:new Date()}});
    await appendAudit(tx,{actorId:actor.id,targetId,action:'account.deletion.completed',reason:'Account deletion cleanup verified',changes:{operationId:row!.id,status:'completed'}});
   },
  });
 }),
 cancelBilling:createDeletionBilling(getStripe),
 deletePhoto:createStrictPhotoDeletion(async keys=>{
  if(!isSupabaseConfigured())throw Error('Storage is not configured');
  return getSupabaseAdmin().storage.from(SPOODS_BUCKET).remove(keys);
 }),
});
export const {beginAccountDeletion,resumeAccountDeletion}=service;
/** Preview is guarded by the same live policy/proof; counts are not cleanup authority. */
export async function getDeletionPreview(targetId:string) {
 return withAccountDeletionMutation(targetId,undefined,async(tx)=>{
  const [user,op,impact]=await Promise.all([
   tx.user.findUniqueOrThrow({where:{id:targetId},select:{accountVersion:true,stripeCustomerId:true,stripeSubscriptionId:true,billingCheckoutIntent:{select:{id:true}}}}),
   tx.accountDeletionOperation.findUnique({where:{targetId},select:{id:true,stage:true}}),
   deletionImpact(tx,targetId),
  ]);
  return {version:user.accountVersion,...impact,pendingCheckout:Boolean(user.billingCheckoutIntent),subscriptionPresent:Boolean(user.stripeCustomerId||user.stripeSubscriptionId||user.billingCheckoutIntent),operation:op?{id:op.id,stage:op.stage as DeleteStage}:null};
 });
}

/** Explicit support recovery for ambiguous upload outcomes. Absence in storage is
 * never evidence that an in-flight request cannot still finish. Operator must
 * verify termination from application/storage logs before this acknowledgment. */
export async function acknowledgeEndedUploads(targetId:string,operationId:string,attested:boolean,reason:string) {
 if(!attested || !reason.trim())throw Error('Upload termination review is required');
 return withAccountDeletionMutation(targetId,operationId,async(tx,actor)=>{
  const op=await tx.accountDeletionOperation.findUniqueOrThrow({where:{id:operationId}});
  if(op.targetId!==targetId || !['blocked_access','billing_canceled'].includes(op.stage))throw Error('Invalid deletion recovery stage');
  const keys=parseDeletionPhotoManifest(op.manifest).keys;
  await tx.$queryRaw`SELECT set_config('app.account_deletion_target', ${targetId}, true)`;
  const result=await tx.ownedUpload.updateMany({where:{userId:targetId,key:{in:keys},settled:false},data:{settled:true}});
  await appendAudit(tx,{actorId:actor.id,targetId,action:'account.deletion.upload_reviewed',reason,changes:{operationId,status:'upload_termination_attested',deletedCount:result.count}});
 });
}
