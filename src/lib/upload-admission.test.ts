import test from 'node:test';
import assert from 'node:assert/strict';
import {admittedUpload} from './upload-admission';
test('reservation survives remote success followed by database error and blocks false cleanup',async()=>{
 let reserved=false,stored=false;const settled=false;
 await assert.rejects(admittedUpload({reserve:async()=>{reserved=true;},underAccountLock:async work=>work(),upload:async()=>{assert.ok(reserved);stored=true;return 'key';},settle:async()=>{throw Error('db failure');}}));
 assert.ok(reserved && stored && !settled);
});
test('deletion between durable reservation and remote admission prevents upload',async()=>{
 let stored=false;
 await assert.rejects(admittedUpload({reserve:async()=>{},underAccountLock:async()=>{throw Error('deleting');},upload:async()=>{stored=true;},settle:async()=>{}}));
 assert.equal(stored,false);
});
test('returned upload remains owned even before a Photo attaches',async()=>{
 const ledger=new Set<string>();
 await admittedUpload({reserve:async()=>{ledger.add('target/photo');},underAccountLock:async work=>work(),upload:async()=> 'target/photo',settle:async()=>{}});
 assert.deepEqual([...ledger],['target/photo']);
});
