import type { PublicSiteStatus } from './site-status-model';
export function createSiteStatusChannel() {
  const listeners = new Set<(status: PublicSiteStatus) => void>();
  return {
    publish(status: PublicSiteStatus) { for (const listener of listeners) listener(status); },
    subscribe(listener: (status: PublicSiteStatus) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export const siteStatusChannel = createSiteStatusChannel();
