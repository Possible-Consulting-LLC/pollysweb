import { canManage, type Actor, type Target } from './policy';
import { requireRecentAdminAuth } from './reauth';
export type DeleteStage = 'blocked_access' | 'billing_canceled' | 'photos_removed' | 'completed';
export type DeletionImpact = {spiderCount:number;eventCount:number;photoCount:number;subscriptionPresent:boolean};
export type DeletionOperation = DeletionImpact & {id:string;targetId:string;stage:DeleteStage;keys:string[];discoveryComplete?:boolean;customerId:string|null;subscriptionId:string|null};
export type DeletionUser = {pendingCheckout:boolean;email:string;accountVersion:number;deletingAt:Date|null;stripeCustomerId:string|null;stripeSubscriptionId:string|null};
export type DeletionContext = { actor:Actor;target:Target;user:DeletionUser|null;operation:DeletionOperation|null;
 snapshot():Promise<DeletionImpact & {keys:string[]}>;
 discoverPhotos():Promise<boolean>;
 begin(operation:DeletionOperation,reason:string):Promise<void>;
 checkpoint(stage:DeleteStage):Promise<void>;
 photosReady():Promise<boolean>;
 acknowledgePhotos(keys:string[]):Promise<void>;
 complete():Promise<void>;
};
export type DeletionDependencies = {
 findTarget(operationId:string):Promise<string>;
 withLocked<T>(targetId:string,operationId:string|undefined,work:(context:DeletionContext)=>Promise<T>):Promise<T>;
 cancelBilling(operation:DeletionOperation):Promise<void>;
 deletePhoto(key:string,operation:DeletionOperation):Promise<void>;
 randomId():string;now():Date;
};
export class DeletionInputError extends Error {}
/** Injected transaction and external services let recovery be verified without live services. */
export function createAccountDeletionService(deps:DeletionDependencies) {
 function authorize(actor:Actor,ctx:DeletionContext,targetId:string) {
  if(actor.id!==ctx.actor.id || ctx.target.id!==targetId || !canManage(ctx.actor,ctx.target,'delete'))throw new DeletionInputError('Account deletion is not authorized.');
  requireRecentAdminAuth(ctx.actor,deps.now().getTime());
 }
 async function beginAccountDeletion(actor:Actor,input:{targetId:string;version:number;confirmationEmail:string;reason:string}) {
  if(!input.reason.trim() || input.reason.length>500)throw new DeletionInputError('Enter a reason up to 500 characters.');
  return deps.withLocked(input.targetId,undefined,async ctx=>{
   authorize(actor,ctx,input.targetId);
   if(!ctx.user || input.confirmationEmail.trim().toLowerCase()!==ctx.user.email.toLowerCase())throw new DeletionInputError('Type the target email to confirm.');
   // Duplicate submissions return the same durable operation, never create a second one.
   if(ctx.operation)return ctx.operation.id;
   if(ctx.user.pendingCheckout)throw new DeletionInputError('Recover the unresolved checkout before deleting this account.');
   if(!Number.isSafeInteger(input.version) || input.version!==ctx.user.accountVersion)throw new DeletionInputError('This account changed. Reload the impact preview.');
   const snapshot=await ctx.snapshot();
   const operation:DeletionOperation={...snapshot,id:deps.randomId(),targetId:input.targetId,stage:'blocked_access',customerId:ctx.user.stripeCustomerId,subscriptionId:ctx.user.stripeSubscriptionId};
   await ctx.begin(operation,input.reason.trim());return operation.id;
  });
 }
 async function resumeAccountDeletion(actor:Actor,operationId:string):Promise<DeleteStage> {
  const targetId=await deps.findTarget(operationId);
  // Each checkpoint uses a fresh transaction/live authorization. External uncertainty
  // never advances a checkpoint. Repeating an external call is safe by adapter contract.
  for(let iteration=0;iteration<3;iteration++) {
   const result=await deps.withLocked(targetId,operationId,async ctx=>{
    authorize(actor,ctx,targetId);
    const op=ctx.operation;if(!op || op.id!==operationId || op.targetId!==targetId)throw new DeletionInputError('Deletion operation was not found.');
    if(op.stage==='completed')return {stage:op.stage,pending:false};
    if(!ctx.user?.deletingAt)throw new DeletionInputError('Deletion access block is missing.');
    if(ctx.user.pendingCheckout)return {stage:op.stage,pending:true};
    if(op.stage==='blocked_access') {
     if(!await ctx.discoverPhotos())return {stage:op.stage,pending:true};
     try{await deps.cancelBilling(op);}catch{return {stage:op.stage,pending:true};}
     await ctx.checkpoint('billing_canceled');return {stage:'billing_canceled' as const,pending:false};
    }
    if(op.stage==='billing_canceled') {
     if(!await ctx.photosReady())return {stage:op.stage,pending:true};
     // Bound remote work per transaction; acknowledge each successful batch even
     // when a later object is unavailable. Lost DB acknowledgment repeats safely.
     const removed:string[]=[];
     let failed=false;
     for(const key of op.keys.slice(0,5)) {
      try{await deps.deletePhoto(key,op);removed.push(key);}catch{failed=true;break;}
     }
     if(removed.length)await ctx.acknowledgePhotos(removed);
     if(failed || removed.length<op.keys.length)return {stage:op.stage,pending:true};
     await ctx.checkpoint('photos_removed');return {stage:'photos_removed' as const,pending:false};
    }
    // Verify billing again at the final boundary: a completed checkout may have
    // become visible since the first cancellation pass. Failure keeps the account.
    try{await deps.cancelBilling(op);}catch{return {stage:op.stage,pending:true};}
    await ctx.complete();return {stage:'completed' as const,pending:false};
   });
   if(result.pending || result.stage==='completed')return result.stage;
  }
  return 'photos_removed';
 }
 return {beginAccountDeletion,resumeAccountDeletion};
}
