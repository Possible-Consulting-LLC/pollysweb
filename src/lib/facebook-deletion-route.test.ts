import * as maintenancePolicy from './admin/maintenance-policy';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as deletion from './facebook-deletion';
import { remainingSignInAvailable } from './social-disconnect-policy';

function fixture(providers=['facebook'], fail=false, maintenance=false) {
  let writes=0;
  const receipts=new Map<string,{confirmationCode:string;status:string}>();
  const routeModule={exports:{} as {POST:(request:Request)=>Promise<Response>}};
  const source=ts.transpileModule(readFileSync(new URL('../app/api/facebook/data-deletion/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{module:routeModule,exports:routeModule.exports,Request,Response,Buffer,URLSearchParams,URL,console:{error(){}},process:{env:{AUTH_FACEBOOK_SECRET:'test',EMAIL_VERIFICATION_ORIGIN:'https://staging.example'}},require:(id:string)=>{
      if(id==='@/lib/admin/maintenance-access') return {guardServiceMaintenance:async()=>{if(maintenance)throw new maintenancePolicy.MaintenanceError();}};
      if(id==='@/lib/admin/maintenance-policy') return maintenancePolicy;
    if(id==='node:crypto')return {randomBytes};
    if(id==='@/lib/facebook-deletion')return deletion;
    if(id==='@/lib/social-disconnect-policy')return {remainingSignInAvailable};
    if(id==='@/lib/social-auth')return {configuredSocialProviders:()=>['google','facebook']};
    if(id==='@/lib/db')return {prisma:{account:{findUnique:async()=>({userId:'keeper',user:{passwordHash:null,emailVerified:null,accounts:providers.map(provider=>({provider}))}})},facebookDeletionRequest:{upsert:async({where,create}:{where:{requestHash:string};create:{confirmationCode:string;status:string}})=>{
      if(fail)throw Error('private database details'); writes++;if(!receipts.has(where.requestHash))receipts.set(where.requestHash,create);return receipts.get(where.requestHash);
    }}}};
    throw Error(id);
  }});
  function request(forged=false) {const payload=Buffer.from(JSON.stringify({algorithm:'HMAC-SHA256',user_id:'1234',issued_at:Math.floor(Date.now()/1000)})).toString('base64url');const signature=createHmac('sha256',forged?'forged':'test').update(payload).digest('base64url');return new Request('https://untrusted-host.test/api/facebook/data-deletion',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({signed_request:signature+'.'+payload})});}
  return {post:routeModule.exports.POST,request,receipts,writes:()=>writes};
}

test('forged callbacks never write receipts',async()=>{const f=fixture();assert.equal((await f.post(f.request(true))).status,400);assert.equal(f.writes(),0);});
test('callback retries return the same receipt without claiming completion',async()=>{
 const f=fixture();const req=f.request();const a=await (await f.post(req.clone())).json();const b=await (await f.post(req.clone())).json();
 assert.deepEqual(a,b);assert.match(a.url,/^https:\/\/staging\.example\/legal\/data-deletion\?code=[a-f0-9]{48}$/);assert.deepEqual(Object.keys(a).sort(),['confirmation_code','url']);assert.equal(f.receipts.size,1);assert.equal([...f.receipts.values()][0].status,'needs_sign_in_method');
});
test('request with another method awaits provider-data review',async()=>{const f=fixture(['facebook','google']);assert.equal((await f.post(f.request())).status,200);assert.equal([...f.receipts.values()][0].status,'pending_review');});
test('database failure returns retryable error without a false confirmation',async()=>{const f=fixture(undefined,true);const response=await f.post(f.request());assert.equal(response.status,503);assert.equal((await response.text()).includes('private database'),false);});

test('maintenance authenticates signed Facebook payload before returning retryable deferral, never a receipt',async()=>{const f=fixture(undefined,false,true);assert.equal((await f.post(f.request(true))).status,400);const response=await f.post(f.request());assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');assert.equal(f.writes(),0);assert.equal('confirmation_code' in await response.json(),false);});
