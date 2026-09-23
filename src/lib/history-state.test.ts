import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMoltMetrics, reconcileMoltState, maintenanceSummary } from './history-state';
const old = { id:'old', moltDate:new Date('2026-08-01'), newInstar:'i5', previousInstar:'i4' };
const latest = { id:'latest', moltDate:new Date('2026-09-01'), newInstar:'i8', previousInstar:'i7' };
test('editing old molt preserves latest instar and manual premolt',()=>{
 assert.deepEqual(reconcileMoltState({ instar:'i8', status:'Premolt' },latest,latest,false), {});
});
test('deleting latest successful molt restores preceding instar',()=>{
 assert.equal(reconcileMoltState({instar:'i8',status:'Post-molt recovery'},latest,old,false).instar,'i5');
});
test('unsuccessful molt cannot advance state',()=>{
 assert.deepEqual(reconcileMoltState({instar:'i8',status:'Premolt'},latest,latest,true),{});
});
test('maintenance summaries use max remaining kind, clearing absent history',()=>{
 assert.deepEqual(maintenanceSummary([{kind:'cleaning',date:new Date('2026-09-01')},{kind:'cleaning',date:new Date('2026-08-01')}]), {lastCleaned:new Date('2026-09-01'),lastRehoused:null});
});
test('backfilling a newer historical molt preserves later manual premolt',()=>{
 const result = reconcileMoltState({instar:'i8',status:'Premolt'},old,latest,true);
 assert.equal(result.status,undefined);
});
test('marking a recent molt successful starts recovery', () => {
 const recent = {...latest, moltDate: new Date()};
 const result = reconcileMoltState({instar:'i7',status:'Normal'},null,recent,false);
 assert.equal(result.status,'Post-molt recovery');
});
test('removing the only successful molt restores previous instar and normal status',()=>{
 assert.deepEqual(reconcileMoltState({instar:'i8',status:'Post-molt recovery'},latest,null,false),{instar:'i7',status:'Normal'});
});
test('historical molt metrics are recomputed after edits and deletes', () => {
 const metrics = deriveMoltMetrics([
  {id:'a',moltDate:new Date('2026-08-01T12:00:00Z'),successful:true},
  {id:'b',moltDate:new Date('2026-08-20T12:00:00Z'),successful:false},
  {id:'c',moltDate:new Date('2026-09-01T12:00:00Z'),successful:true},
 ], [new Date('2026-08-27T12:00:00Z')]);
 assert.deepEqual(metrics.map(({daysSincePriorMolt,fastingDaysBefore}) => ({daysSincePriorMolt,fastingDaysBefore})), [
  {daysSincePriorMolt:null,fastingDaysBefore:null},
  {daysSincePriorMolt:19,fastingDaysBefore:null},
  {daysSincePriorMolt:31,fastingDaysBefore:5},
 ]);
});
