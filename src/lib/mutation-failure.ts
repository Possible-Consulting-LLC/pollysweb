/** Public, serializable failure contract. Never include exception text or identities. */
export type MutationFailure = {
  ok: false;
  code: 'context_changed' | 'maintenance';
  error: string;
};
export function contextChangedFailure(): MutationFailure {
  return {
    ok: false,
    code: 'context_changed',
    error: 'Your sign-in or testing context changed. Your unsaved entries are still here. Copy them, then reload this page or use Return to admin before trying again.',
  };
}
