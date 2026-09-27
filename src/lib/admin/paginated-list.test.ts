import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPage, parseListQuery } from './paginated-list';

test('parseListQuery applies defaults when params are missing', () => {
  assert.deepEqual(parseListQuery({}), { page: 1, pageSize: 20, search: '', offset: 0 });
  assert.deepEqual(
    parseListQuery({}, { page: 2, pageSize: 5, search: 'seed' }),
    { page: 2, pageSize: 5, search: 'seed', offset: 5 },
  );
});

test('parseListQuery reads page, pageSize and search from params', () => {
  const parsed = parseListQuery({ page: '3', pageSize: '10', search: ' Pro ' });
  assert.deepEqual(parsed, { page: 3, pageSize: 10, search: 'Pro', offset: 20 });
});

test('parseListQuery treats page 0 and negative pages as page 1', () => {
  assert.equal(parseListQuery({ page: '0' }).page, 1);
  assert.equal(parseListQuery({ page: '-3' }).page, 1);
  assert.equal(parseListQuery({ page: '-3' }).offset, 0);
});

test('parseListQuery falls back to defaults for invalid numbers', () => {
  assert.equal(parseListQuery({ page: 'abc' }).page, 1);
  assert.equal(parseListQuery({ pageSize: 'abc' }).pageSize, 20);
  assert.equal(parseListQuery({ pageSize: '0' }).pageSize, 20);
});

test('parseListQuery handles array values by taking the first entry', () => {
  const parsed = parseListQuery({ page: ['4', '9'], search: ['a', 'b'] });
  assert.equal(parsed.page, 4);
  assert.equal(parsed.search, 'a');
});

test('clampPage clamps to the last full/partial page of a total', () => {
  assert.equal(clampPage(50, 45, 20), 3);
  assert.equal(clampPage(3, 40, 20), 2);
  assert.equal(clampPage(1, 45, 20), 1);
});

test('clampPage clamps to page 1 for page 0, negatives and empty totals', () => {
  assert.equal(clampPage(0, 45, 20), 1);
  assert.equal(clampPage(-1, 45, 20), 1);
  assert.equal(clampPage(5, 0, 20), 1);
});
