import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { parseFacebookDeletionRequest, facebookDeletionOrigin } from './facebook-deletion';
const secret='test-secret';
const now=Date.now();
function signed(data: unknown, key=secret) {const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return createHmac('sha256',key).update(payload).digest('base64url')+'.'+payload;}
const payload={algorithm:'HMAC-SHA256',user_id:'123456789',issued_at:Math.floor(now/1000)};
test('accepts an authenticated Facebook request and derives an opaque lookup key',()=>{
 const parsed=parseFacebookDeletionRequest(signed(payload),secret,now);
 assert.equal(parsed.userId,'123456789'); assert.match(parsed.subjectHash,/^[a-f0-9]{64}$/);
 assert.equal(parsed.subjectHash,parseFacebookDeletionRequest(signed({...payload,issued_at:payload.issued_at-1}),secret,now).subjectHash);
});
test('rejects forged, malformed, unsupported, future and oversized requests',()=>{
 for(const value of [signed(payload,'wrong'),signed({...payload,algorithm:'none'}),signed({...payload,user_id:null}),signed({...payload,issued_at:payload.issued_at+3600}),'junk',signed(payload)+'.extra','x'.repeat(9000)]) assert.throws(()=>parseFacebookDeletionRequest(value,secret,now));
 assert.throws(()=>parseFacebookDeletionRequest(signed(payload),'',now));
});
test('callback links use a configured HTTPS origin rather than the request host',()=>{
 assert.equal(facebookDeletionOrigin({EMAIL_VERIFICATION_ORIGIN:'https://staging.example'}),'https://staging.example');
 for(const origin of ['http://evil.test','https://evil.test/path','https://user:pass@evil.test']) assert.throws(()=>facebookDeletionOrigin({AUTH_URL:origin}));
 assert.throws(()=>facebookDeletionOrigin({}));
});
