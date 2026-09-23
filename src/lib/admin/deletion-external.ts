import type Stripe from 'stripe';
import type { DeletionOperation } from './account-deletion';
import { verifyCustomerOwner } from '../billing-policy';
/** No refunds/proration; enumerate every page and verify final state on every retry.
 * Stripe DELETE cancellation is itself idempotent after retrieving canceled state. */
export function createDeletionBilling(getStripe:()=>Stripe) {
 return async (op:DeletionOperation) => {
  if(!op.customerId){if(op.subscriptionId)throw Error('Subscription lacks verified customer');return;}
  const stripe=getStripe();
  verifyCustomerOwner(op.targetId,op.customerId,await stripe.customers.retrieve(op.customerId));
  const subscriptionIds=new Set<string>(op.subscriptionId?[op.subscriptionId]:[]);
  // All checkout sessions, including complete ones, must be accounted for. Complete
  // subscription-mode checkouts without a subscription ID remain uncertain.
  for await(const session of stripe.checkout.sessions.list({customer:op.customerId,limit:100})) {
   if(session.metadata?.userId && session.metadata.userId!==op.targetId)throw Error('Checkout ownership mismatch');
   if(session.status==='open') {
    const expired=await stripe.checkout.sessions.expire(session.id,{}, {idempotencyKey:`delete-${op.id}-expire-${session.id}`});
    if(expired.status!=='expired')throw Error('Checkout remains open');
   } else if(session.status==='complete' && session.mode==='subscription') {
    const id=typeof session.subscription==='string'?session.subscription:session.subscription?.id;
    if(!id)throw Error('Checkout subscription is still processing');subscriptionIds.add(id);
   }
  }
  for await(const sub of stripe.subscriptions.list({customer:op.customerId,status:'all',limit:100}))subscriptionIds.add(sub.id);
  for(const id of subscriptionIds) {
   const sub=await stripe.subscriptions.retrieve(id);
   const customer=typeof sub.customer==='string'?sub.customer:sub.customer.id;
   if(customer!==op.customerId || sub.metadata.userId && sub.metadata.userId!==op.targetId)throw Error('Subscription ownership mismatch');
   if(!['canceled','incomplete_expired'].includes(sub.status)) {
    const canceled=await stripe.subscriptions.cancel(id,{invoice_now:false,prorate:false},{idempotencyKey:`delete-${op.id}-cancel-${id}`});
    if(canceled.status!=='canceled')throw Error('Subscription cancellation unresolved');
   }
  }
  // Re-list open sessions so a racing completion/expiration never receives a false acknowledgment.
  for await(const session of stripe.checkout.sessions.list({customer:op.customerId,status:'open',limit:100})) {
   if(session.status==='open')throw Error('Pending checkout remains');
  }
 };
}
export function createStrictPhotoDeletion(remove:(keys:string[])=>Promise<{error:unknown}>) {
 return async(key:string)=>{const result=await remove([key]);if(result.error)throw Error('Photo cleanup unavailable');};
}
