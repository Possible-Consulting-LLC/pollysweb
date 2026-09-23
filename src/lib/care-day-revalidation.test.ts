import assert from 'node:assert/strict';
import test from 'node:test';
import { careDayStillQualifies } from './care-day-revalidation';
const day='2026-09-20';
const now=new Date('2026-09-20T23:00:00Z');
const snapshot={spiderIds:['a','b'],deferred:{},policy:{feedIntervalDays:3,mistIntervalDays:1,statuses:{a:'Molting',b:'Molting'}},manualReviewedIds:[]};
const event=(spiderId:string,type:string,date='2026-09-20T12:00:00Z',qualifies=true)=>({spiderId,type,date:new Date(date),qualifies});
test('removing the only hydration from one spood withdraws the shared care day',()=>{
 assert.equal(careDayStillQualifies(day,'UTC',snapshot,[event('a','misting'),event('b','misting')],[],now),true);
 assert.equal(careDayStillQualifies(day,'UTC',snapshot,[event('a','misting')],[],now),false);
});
test('another qualifying entry preserves completion, and dates use the saved timezone',()=>{
 assert.equal(careDayStillQualifies(day,'UTC',snapshot,[event('a','misting'),event('b','misting'),event('b','observation')],[],now),true);
 assert.equal(careDayStillQualifies(day,'America/Los_Angeles',snapshot,[event('a','misting'),event('b','misting','2026-09-20T00:30:00Z')],[],now),false);
});
test('explicit manual reviews and deferrals remain valid evidence',()=>{
 const manual=[{spiderId:'a',deferred:{misting:'Droplets remain'}},{spiderId:'b',deferred:{misting:'Droplets remain'}}];
 assert.equal(careDayStillQualifies(day,'UTC',snapshot,[],manual,now),true);
});
test('observations and optional play cannot waive due care',()=>{
 assert.equal(careDayStillQualifies(day,'UTC',snapshot,[event('a','observation'),event('b','observation')],[],now),false);
 const noDue={...snapshot,policy:{...snapshot.policy,mistIntervalDays:3}};
 assert.equal(careDayStillQualifies(day,'UTC',noDue,[event('a','misting','2026-09-19T12:00:00Z'),event('b','misting','2026-09-19T12:00:00Z'),event('a','play'),event('b','play')],[],now),false);
});
test('a refused feeding still counts today but editing an older successful meal can make later care incomplete',()=>{
 const one={...snapshot,spiderIds:['a'],policy:{feedIntervalDays:3,mistIntervalDays:3,statuses:{a:'Normal'}}};
 const reviewed=[{spiderId:'a',deferred:{}}];
 const mist=event('a','misting','2026-09-19T12:00:00Z');
 assert.equal(careDayStillQualifies(day,'UTC',one,[mist,event('a','feeding','2026-09-19T12:00:00Z')],reviewed,now),true);
 assert.equal(careDayStillQualifies(day,'UTC',one,[mist,event('a','feeding','2026-09-19T12:00:00Z',false)],reviewed,now),false);
 assert.equal(careDayStillQualifies(day,'UTC',one,[mist,event('a','feeding','2026-09-20T12:00:00Z',false)],reviewed,now),true);
});
