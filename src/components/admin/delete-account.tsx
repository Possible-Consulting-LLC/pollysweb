'use client';
import { MutationForm } from '@/components/mutation-form';
import { useMutationContext } from '@/components/mutation-context';
import { MutationContextInput } from '@/components/mutation-context';
import {useState,useTransition} from 'react';
import Link from 'next/link';
import {acknowledgeEndedUploadsAction,beginAccountDeletionAction,deletionPreviewAction,resumeAccountDeletionAction,type DeletionResult} from '@/app/actions/admin-delete-account';
type Preview=NonNullable<Awaited<ReturnType<typeof deletionPreviewAction>>['preview']>;
export function DeleteAccount({targetId,email}:{targetId:string;email:string}) {
 const mutationContext = useMutationContext();
 const [preview,setPreview]=useState<Preview>();const [result,setResult]=useState<DeletionResult>({});const [pending,start]=useTransition();
 const operationId=result.operationId??preview?.operation?.id;
 const stage=result.stage??preview?.operation?.stage;
 return <section className="space-y-3 rounded-2xl border border-rose-300 p-4"><h3 className="font-semibold">Delete account permanently</h3>
  <p>Recent super-admin identity confirmation is required. App access stops immediately. Billing must be canceled and owned photos removed before account records are erased. No automatic refunds are issued. Stripe financial records remain.</p>
  <p><Link href="/admin/reauth" className="underline">Confirm administrator identity</Link></p>
  {!preview && !operationId?<button disabled={pending} onClick={()=>start(async()=>{const r=await deletionPreviewAction(targetId, mutationContext);if(r.preview)setPreview(r.preview);else setResult({error:r.error});})} className="rounded-xl border px-4 py-2">{pending?'Loading…':'Load deletion impact'}</button>:null}
  {preview?<p>{preview.spiderCount} spoods · {preview.eventCount} care logs · {preview.photoCount} photo/storage references before deduplication · {preview.subscriptionPresent?'Billing verification required':'No recorded billing'}</p>:null}
  {preview?.pendingCheckout?<p role="alert">An unresolved checkout must be recovered in <Link href="/admin/operations" className="underline">Operations</Link> before deletion can start.</p>:null}
  {preview&&!preview.pendingCheckout&&!operationId?<MutationForm action={form=>start(async()=>setResult(await beginAccountDeletionAction(targetId,preview.version,form)))} className="grid gap-3"><MutationContextInput />
   <label>Type {email}<input type="email" name="email" required autoComplete="off" className="block w-full rounded-xl border p-2" /></label>
   <label>Reason (exclude personal information)<input name="reason" required maxLength={500} className="block w-full rounded-xl border p-2" /></label>
   <label className="flex gap-2"><input type="checkbox" name="confirmed" value="yes" required />I confirm permanent deletion and the billing consequences above.</label>
   <button disabled={pending} className="rounded-xl bg-rose-100 p-2 text-rose-900">{pending?'Starting…':'Block access and start deletion'}</button>
  </MutationForm>:null}
  {result.error?<p role="alert">{result.error}</p>:null}
  {operationId?<p role="status">{stage==='completed'?'Account deletion completed.':`Deletion pending (${stage??'status unconfirmed'}). Account access remains blocked.`}</p>:null}
  {operationId&&stage!=='completed'?<button disabled={pending} onClick={()=>start(async()=>setResult(await resumeAccountDeletionAction(operationId, mutationContext)))} className="rounded-xl border p-2">{pending?'Cleaning up…':'Continue / retry cleanup'}</button>:null}
  {operationId&&stage!=='completed'?<details><summary>Resolve an uncertain upload</summary>
   <p>Only use this after application and storage logs confirm every outstanding upload request for this account has ended. A missing object alone is insufficient. This records your review and allows strict photo cleanup on retry.</p>
   <MutationForm action={form=>start(async()=>{const next=await acknowledgeEndedUploadsAction(targetId,operationId,form);setResult(previous=>({...previous,...next}));})} className="grid gap-2"><MutationContextInput />
    <label><input type="checkbox" name="terminated" value="yes" required /> I verified all outstanding upload requests have ended.</label>
    <label>Review reason (no personal information)<input name="reason" required maxLength={500} className="block rounded-xl border p-2" /></label>
    <button disabled={pending} className="rounded-xl border p-2">Record upload termination review</button>
   </MutationForm>
  </details>:null}
  {stage==='completed'?<Link href="/admin/accounts">Return to accounts</Link>:null}
 </section>;
}
