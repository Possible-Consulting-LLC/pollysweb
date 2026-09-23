type Focusable = { isConnected: boolean; focus(): void };
/** A native modal keeps the existing form DOM in place while making the page inert. */
export function setMaintenanceBlocking(dialog: { open: boolean; showModal(): void; close(): void; focus(): void }, blocked: boolean, active: Focusable | null, previous: Focusable | null): Focusable | null {
  if (blocked) {
    if (!dialog.open) { dialog.showModal(); dialog.focus(); return active; }
    return previous;
  }
  if (dialog.open) dialog.close();
  if (previous?.isConnected) previous.focus();
  return null;
}
