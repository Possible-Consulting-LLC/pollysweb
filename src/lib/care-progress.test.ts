import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCareProgress, earnedCelebrations } from './care-progress';
const items = [{id:'a',due:{feeding:true,misting:true}},{id:'b',due:{feeding:false,misting:false}}];
test('one cared-for spood does not complete a collection',()=>{
 const result=applyCareProgress(items,[{spiderId:'a',feeding:true,misting:true,observation:false}],[]);
 assert.equal(result.filter(x=>x.caredFor).length,1);
 assert.equal(result.every(x=>x.caredFor),false);
});
test('observation checks off a spood but does not waive due care',()=>{
 const [item]=applyCareProgress(items,[{spiderId:'a',feeding:false,misting:false,observation:true}],[]);
 assert.equal(item.reviewed,true);assert.equal(item.caredFor,false);assert.equal(item.due.feeding,true);
});
test('a feeding attempt addresses today feeding without encouraging another meal',()=>{
 const [item]=applyCareProgress(items,[{spiderId:'a',feeding:true,misting:false,observation:false}],[]);
 assert.equal(item.due.feeding,false);assert.equal(item.caredFor,false);
});
test('manual check-ins and reasoned deferrals combine with automatic logs',()=>{
 const result=applyCareProgress(items,[{spiderId:'a',feeding:true,misting:false,observation:false}],
 [{spiderId:'a',deferred:{misting:'Fresh droplets remain'}},{spiderId:'b',deferred:{}}]);
 assert.equal(result.every(x=>x.caredFor),true);
});
test('foreign and ineligible spoods do not contribute to progress',()=>{
 const result=applyCareProgress(items,[{spiderId:'other',feeding:true,misting:true,observation:true}],[]);
 assert.equal(result.filter(x=>x.reviewed).length,0);
});
test('badge keys distinguish individual spoods and streak thresholds',()=>{
 const rewards=earnedCelebrations({current:3,best:3,earnedAt:{1:'2026-09-19',3:'2026-09-20'}},
 {firstPortrait:[],sharpEyes:[{spiderId:'a',spiderName:'Star',earnedAt:'2026-09-20'},{spiderId:'b',spiderName:'Moon',earnedAt:'2026-09-20'}],silkArchitect:[],freshSuit:[],spoodiversary:[],newChapter:[]});
 assert.equal(new Set(rewards.map(x=>x.key)).size,4);
});
