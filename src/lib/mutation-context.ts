import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestIdentity } from './admin/test-session';
/** A single admitted action retains this identity even if another tab stops testing. */
export const mutationIdentity = new AsyncLocalStorage<{
    identity: RequestIdentity | null;
    primaryCommitted?: boolean;
    careCompletion?: boolean;
}>();
