/** Disposable fixtures only. Never run against production. */
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assertStagingEnvironment } from '../src/lib/staging-guard';

async function main() {
  dotenv.config({ path: '.env.local', override: true, quiet: true });
  assert.equal(process.env.SPOODLY_ENV, 'staging'); assertStagingEnvironment();
  const { prisma } = await import('../src/lib/db');
  const { baselineCelebrations, finishCareCelebrations, forgetWithdrawnCelebrations } = await import('../src/lib/care-celebrations');
  const { getConstellationData } = await import('../src/lib/constellation-data');
  const id = `badge-check-${randomUUID()}`, email = `${id}@example.invalid`;
  const now = new Date();
  const midnight = Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z');
  const at = (offset: number) => offset === 0 ? new Date(now.getTime()-1000) : new Date(midnight+offset*86400000+12*3600000);
  try {
    await prisma.user.create({ data: { id, email, plan: 'pro', timezone: 'UTC', name: 'Disposable badge check' } });
    const a = await prisma.spider.create({ data: { userId: id, name: 'Test A', status: 'Molting' } });
    const b = await prisma.spider.create({ data: { userId: id, name: 'Test B', status: 'Molting' } });
    assert.equal(await baselineCelebrations(id), true);
    const snapshot = { spiderIds: [a.id,b.id], deferred: {}, manualReviewedIds: [], policy: { feedIntervalDays: 3, mistIntervalDays: 1, statuses: { [a.id]: 'Molting', [b.id]: 'Molting' } } };
    const bMists = [];
    for (const offset of [-2,-1,0]) {
      await prisma.mistingEvent.create({ data: { spiderId: a.id, date: at(offset) } });
      bMists.push(await prisma.mistingEvent.create({ data: { spiderId: b.id, date: at(offset) } }));
      if (offset < 0) await prisma.careDay.create({ data: { userId: id, dayKey: at(offset).toISOString().slice(0,10), timeZone: 'UTC', completedAt: at(offset), snapshot } });
    }
    const earned = await finishCareCelebrations(id, true, at(0));
    assert.equal(earned.some(item => item.kind === 'star'), true);
    assert.equal(earned.some(item => item.key === 'streak:3'), true);
    assert.equal((await getConstellationData(id)).streak.best, 3);
    // Moving the middle day's only hydration breaks the shared three-day streak.
    await prisma.mistingEvent.update({ where: { id: bMists[1].id }, data: { date: at(-2) } });
    await forgetWithdrawnCelebrations(id);
    let state = await getConstellationData(id);
    assert.equal(state.streak.best, 1); assert.equal(state.streak.earnedAt[3], undefined);
    assert.equal(await prisma.celebratedReward.count({ where: { userId: id, key: 'streak:3' } }), 0);
    assert.equal(await prisma.careDay.count({ where: { userId: id } }), 3); // snapshots retained
    // Correcting it restores the historical day and permits a fresh milestone celebration.
    await prisma.mistingEvent.update({ where: { id: bMists[1].id }, data: { date: at(-1) } });
    assert.equal((await finishCareCelebrations(id, true, at(-1))).some(item => item.key === 'streak:3'), true);
    await prisma.mistingEvent.delete({ where: { id: bMists[2].id } });
    await forgetWithdrawnCelebrations(id);
    state = await getConstellationData(id);
    assert.equal(state.completedToday, false); assert.equal(state.streak.best, 2);
    // Shrinking today's collection must not replace the original star requirements.
    await prisma.spider.update({ where: { id: b.id }, data: { memorializedAt: now } });
    assert.equal((await finishCareCelebrations(id, true, at(0))).some(item => item.kind === 'star'), false);
    const retained = await prisma.careDay.findUniqueOrThrow({ where: { userId_dayKey: { userId: id, dayKey: at(0).toISOString().slice(0,10) } } });
    assert.ok(retained.invalidatedAt);
    assert.deepEqual((retained.snapshot as { spiderIds: string[] }).spiderIds.sort(), [a.id,b.id].sort());
    await prisma.spider.update({ where: { id: b.id }, data: { memorializedAt: null } });
    await prisma.mistingEvent.create({ data: { spiderId: b.id, date: at(0) } });
    const restored = await finishCareCelebrations(id, true, at(0));
    assert.equal(restored.some(item => item.kind === 'star'), true);
    assert.equal(restored.some(item => item.key === 'streak:3'), true);
    assert.equal((await finishCareCelebrations(id, true, at(0))).length, 0);
    const hammockA = await prisma.observationEvent.create({ data: { spiderId: a.id, kind: 'built a new hammock', date: at(0) } });
    const hammockB = await prisma.observationEvent.create({ data: { spiderId: b.id, kind: 'built a new hammock', date: at(0) } });
    const molt = await prisma.moltEvent.create({ data: { spiderId: a.id, moltDate: at(-1), successful: true } });
    await finishCareCelebrations(id, true);
    await prisma.observationEvent.update({ where: { id: hammockA.id }, data: { kind: 'behavior note' } });
    await forgetWithdrawnCelebrations(id);
    assert.deepEqual((await getConstellationData(id)).stories.silkArchitect.map(item => item.spiderId), [b.id]);
    await prisma.observationEvent.delete({ where: { id: hammockB.id } });
    await prisma.moltEvent.update({ where: { id: molt.id }, data: { successful: false } });
    await forgetWithdrawnCelebrations(id);
    state = await getConstellationData(id);
    assert.equal(state.stories.silkArchitect.length, 0); assert.equal(state.stories.freshSuit.length, 0);
    assert.equal(state.stories.sharpEyes.length, 1);
    await prisma.observationEvent.update({ where: { id: hammockA.id }, data: { kind: 'built a new hammock' } });
    assert.equal((await finishCareCelebrations(id, true, at(0))).some(item => item.key === `story:silkArchitect:${a.id}`), true);
    console.log('PASS: historical edits and deletions withdraw/restore care stars and streak badges; another spood retains account badge; lost activity badges can be earned again without duplicate celebrations.');
  } finally {
    await prisma.user.deleteMany({ where: { id, email } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
