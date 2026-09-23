import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutReturnNotice } from './upgrade-notice';

test('checkout return only welcomes a keeper after effective Pro access is visible', () => {
  assert.equal(checkoutReturnNotice(true, false, 'pro'), 'Welcome to Pro — you can add as many spoods as you like.');
  assert.equal(checkoutReturnNotice(true, false, 'free'), 'Payment received. We’re confirming your Pro access; refresh this page shortly.');
  assert.equal(checkoutReturnNotice(false, false, 'free'), null);
  assert.equal(checkoutReturnNotice(true, true, 'pro'), null);
});
