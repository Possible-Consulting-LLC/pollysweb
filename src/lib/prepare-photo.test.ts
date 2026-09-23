import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preparePhoto } from './prepare-photo';

const file = (size: number, name = 'photo.jpg', type = 'image/jpeg') => new File([new Uint8Array(size)], name, { type });
test('small supported photos are preserved without decoding', async () => {
  const original = file(100);
  assert.equal(await preparePhoto(original, async () => { throw Error('must not decode'); }), original);
});
test('oversized photos preserve aspect ratio and fit the upload limit', async () => {
  let closed = false;
  const result = await preparePhoto(file(7_533_211), async () => ({ width: 4000, height: 2000,
    encode: async (width, height, quality) => {
      assert.equal(width, 2560); assert.equal(height, 1280);
      return new Blob([new Uint8Array(quality > .8 ? 4_100_000 : 100_000)], { type: 'image/jpeg' });
    }, close: () => { closed = true; } }));
  assert.ok(result.size <= 4_000_000); assert.equal(result.type, 'image/jpeg'); assert.ok(closed);
});
test('HEIC files are converted even below the upload limit', async () => {
  const result = await preparePhoto(file(100, 'phone.HEIC', 'image/heic'), async () => ({ width: 100, height: 200,
    encode: async () => new Blob(['jpeg'], { type: 'image/jpeg' }), close() {} }));
  assert.equal(result.name, 'phone.jpg'); assert.equal(result.type, 'image/jpeg');
});
test('conversion failure cleans up decoded resources', async () => {
  let closed = false;
  await assert.rejects(preparePhoto(file(5_000_000), async () => ({width: 100, height: 100,
    encode: async () => { throw Error('conversion failed'); }, close: () => { closed = true; } })));
  assert.ok(closed);
});
test('unreasonably large inputs are rejected before decoding', async () => {
  await assert.rejects(preparePhoto(file(25_000_001), async () => { assert.fail('must not decode'); }), /25 MB/);
});
test('failed compression does not return an oversized file', async () => {
  await assert.rejects(preparePhoto(file(5_000_000), async () => ({ width: 100, height: 100,
    encode: async () => new Blob([new Uint8Array(4_000_001)]), close() {} })), /smaller|compress/i);
});
