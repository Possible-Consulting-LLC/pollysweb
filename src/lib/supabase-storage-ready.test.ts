import assert from 'node:assert/strict';
import test from 'node:test';
import { privatePhotoStorageReady } from './supabase';

test('private photo storage readiness requires an accessible private spoods bucket', async () => {
  const storage = (data: { name?: string; public?: boolean } | null, error: unknown = null) => ({ getBucket: async (name: string) => {
    assert.equal(name, 'spoods');
    return { data, error };
  } });
  assert.equal(await privatePhotoStorageReady(storage({ name: 'spoods', public: false })), true);
  assert.equal(await privatePhotoStorageReady(storage({ name: 'spoods', public: true })), false);
  assert.equal(await privatePhotoStorageReady(storage(null, new Error('missing'))), false);
});
