/** Disposable integration fixtures, restricted to the explicitly verified staging database. */
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertStagingEnvironment } from '../src/lib/staging-guard';

async function main() {
  dotenv.config({ path: '.env.local', override: true, quiet: true });
  assert.equal(process.env.SPOODLY_ENV, 'staging');
  assertStagingEnvironment();
  const { prisma } = await import('../src/lib/db');
  const { baselineCelebrations, finishCareCelebrations } = await import('../src/lib/care-celebrations');
  const { getCareReviewState } = await import('../src/lib/constellation-data');
  const id = `care-check-${randomUUID()}`;
  try {
    await prisma.user.create({data:{id,email:`${id}@example.invalid`,name:'Disposable care test',plan:'pro',timezone:'America/Los_Angeles'}});
    const a=await prisma.spider.create({data:{userId:id,name:'Test A',status:'Molting'}});
    const b=await prisma.spider.create({data:{userId:id,name:'Test B',status:'Molting'}});
    const yesterday=new Date(Date.now()-86400000);
    let baseline=await baselineCelebrations(id);assert.equal(baseline,true);
    await prisma.observationEvent.create({data:{spiderId:a.id,kind:'behavior note',date:yesterday}});
    const old=await finishCareCelebrations(id,baseline,yesterday);
    assert.equal(old.some(x=>x.kind==='star'),false);
    assert.equal((await getCareReviewState(id)).reviewItems.some(x=>x.reviewed),false);
    baseline=await baselineCelebrations(id);
    const body = await prisma.bodyConditionEvent.create({data:{spiderId:b.id,condition:'Normal'}});
    const bodyRewards = await finishCareCelebrations(id,baseline,body.date);
    assert.equal(bodyRewards.some(x=>x.key === 'story:sharpEyes:' + b.id),true);
    const bodyProgress = (await getCareReviewState(id)).reviewItems.find(x=>x.id === b.id)!;
    assert.equal(bodyProgress.reviewed,true);assert.equal(bodyProgress.caredFor,false);
    baseline=await baselineCelebrations(id);
    const first=await prisma.mistingEvent.create({data:{spiderId:a.id}});
    assert.equal((await finishCareCelebrations(id,baseline,first.date)).some(x=>x.kind==='star'),false);
    const progress=await getCareReviewState(id);
    assert.equal(progress.reviewItems.filter(x=>x.caredFor).length,1);
    baseline=await baselineCelebrations(id);
    const second=await prisma.mistingEvent.create({data:{spiderId:b.id}});
    const concurrent=await Promise.all([finishCareCelebrations(id,baseline,second.date),finishCareCelebrations(id,baseline,second.date)]);
    assert.equal(concurrent.flat().filter(x=>x.kind==='star').length,1);
    assert.equal(concurrent.flat().filter(x=>x.key==='streak:1').length,1);
    assert.equal((await getCareReviewState(id)).completedToday,true);
    assert.deepEqual(await finishCareCelebrations(id,true,second.date),[]);
    console.log('PASS: staging backdates, all-spood progress, concurrent star/badge deduplication, repeat-save behavior');
  } finally {
    // Exact fixture ID only; cascades remove only this test account’s records.
    await prisma.user.deleteMany({where:{id,email:`${id}@example.invalid`}});
    await prisma.$disconnect();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
