import assert from 'node:assert/strict';
import test from 'node:test';
import { setMaintenanceBlocking } from './site-status-dom';

test('active modal preserves a dirty form, traps interaction, and restores focus when reopened', () => {
  const field = { value: 'Unsaved observation', isConnected: true, focusCount: 0, focus() { this.focusCount++; } };
  const dialog = { open: false, showCount: 0, closeCount: 0, focusCount: 0, showModal() { this.open = true; this.showCount++; }, close() { this.open = false; this.closeCount++; }, focus() { this.focusCount++; } };
  let prior = setMaintenanceBlocking(dialog, true, field, null);
  prior = setMaintenanceBlocking(dialog, true, field, prior);
  assert.equal(dialog.showCount, 1);
  assert.equal(dialog.focusCount, 1);
  assert.equal(field.value, 'Unsaved observation');
  prior = setMaintenanceBlocking(dialog, false, null, prior);
  assert.equal(prior, null);
  assert.equal(dialog.closeCount, 1);
  assert.equal(field.focusCount, 1);
  assert.equal(field.value, 'Unsaved observation');
});
