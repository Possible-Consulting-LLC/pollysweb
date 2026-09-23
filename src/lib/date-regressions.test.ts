import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, parseLocalDateInput, toDateInputValue, requireFormDateTime } from './utils';
test('calendar days use keeper zone across host zones and DST', () => {
 assert.equal(daysBetween(new Date('2026-09-08T16:00Z'), new Date('2026-09-09T01:00Z'), 'America/Los_Angeles'), 0);
 assert.equal(daysBetween(new Date('2026-03-08T08:00Z'), new Date('2026-03-09T07:00Z'), 'America/Los_Angeles'), 1);
});
test('calendar dates round trip as UTC midnight and reject impossible dates', () => {
 assert.equal(parseLocalDateInput('2026-09-08')?.toISOString(), '2026-09-08T00:00:00.000Z');
 assert.equal(toDateInputValue('2026-09-08T00:00:00Z'), '2026-09-08');
 assert.equal(parseLocalDateInput('2026-02-30'), null);
});
test('edit value zone overrides device zone', () => {
 const form = new FormData(); form.set('date','2026-09-08T12:00'); form.set('timeZone','America/New_York'); form.set('clientTimeZone','America/Los_Angeles');
 assert.equal(requireFormDateTime(form).toISOString(), '2026-09-08T16:00:00.000Z');
});
test('invalid wall date and nonexistent DST time are rejected', () => {
 const form = new FormData(); form.set('date','2026-02-30T12:00');form.set('timeZone','UTC');
 assert.throws(()=>requireFormDateTime(form),/valid date/);
 form.set('date','2026-03-08T02:30');form.set('timeZone','America/Los_Angeles');
 assert.throws(()=>requireFormDateTime(form),/valid date/);
});
