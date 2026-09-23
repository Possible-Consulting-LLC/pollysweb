import assert from 'node:assert/strict';
import test from 'node:test';
import { reportingPeriod, reportingDates, explicitReportingPeriod, periodContains } from './analytics-period';

const now = new Date('2026-03-10T19:00:00Z');
test('seven local dates cross spring DST without subtracting 168 hours', () => {
  const period = reportingPeriod('America/Los_Angeles', 7, now);
  assert.equal(period.start.toISOString(), '2026-03-04T08:00:00.000Z');
  assert.equal(period.end.toISOString(), now.toISOString());
  assert.equal(period.partialToday, true);
  assert.deepEqual(reportingDates(period), ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
});
test('UTC and Tokyo use their own calendar dates, including midnight', () => {
  assert.equal(reportingPeriod('UTC', 7, now).start.toISOString(), '2026-03-04T00:00:00.000Z');
  assert.equal(reportingPeriod('Asia/Tokyo', 7, now).start.toISOString(), '2026-03-04T15:00:00.000Z');
  const midnight = reportingPeriod('Asia/Tokyo', 14, new Date('2026-03-10T15:00:00Z'));
  assert.equal(midnight.start.toISOString(), '2026-02-25T15:00:00.000Z');
  assert.equal(reportingDates(midnight).at(-1), '2026-03-11');
});
test('fall DST includes the 25-hour local date', () => {
  const period = explicitReportingPeriod('America/Los_Angeles', '2026-11-01', '2026-11-01', new Date('2026-11-04T12:00:00Z'));
  assert.equal(period.start.toISOString(), '2026-11-01T07:00:00.000Z');
  assert.equal(period.end.toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(period.partialToday, false);
  assert.equal(periodContains(period, period.end), false);
});
test('partial range includes server now and excludes future events', () => {
  const period = reportingPeriod('UTC', 7, now);
  assert.equal(periodContains(period, now), true);
  assert.equal(periodContains(period, new Date(now.getTime() + 1)), false);
  assert.equal(periodContains(period, new Date('2026-03-03T23:59:59Z')), false);
  assert.equal(explicitReportingPeriod('UTC', '2026-03-09', '2026-03-10', now).end.toISOString(), now.toISOString());
});
test('rejects invalid zones, calendar dates, reversed, future and unbounded ranges', () => {
  assert.throws(() => reportingPeriod('bad/zone', 7, now));
  assert.throws(() => reportingPeriod('+05:00', 7, now));
  for (const [start, end] of [['2026-02-30', '2026-03-01'], ['2026-03-10', '2026-03-09'], ['2026-03-09', '2026-03-11'], ['2025-01-01', '2026-03-10']]) {
    assert.throws(() => explicitReportingPeriod('UTC', start, end, now));
  }
});
