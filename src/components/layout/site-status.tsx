'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { usePathname } from 'next/navigation';
import { protectedSitePath, siteStatusView, SiteStatusPoller, type PublicSiteStatus, type SiteStatusSample } from '@/lib/site-status-model';
import { setMaintenanceBlocking } from '@/lib/site-status-dom';
import { PrivateContextValidator } from '@/lib/site-status-private';
import { siteStatusChannel } from '@/lib/site-status-channel';
import { stopTestSessionAction } from '@/app/actions/admin-test-session';

type Presentation = { status: Pick<PublicSiteStatus, 'mode' | 'announcementEnabled' | 'announcement'>; seconds: number | null; bypass: boolean; protectedPage: boolean; testContextChanged?: boolean; dialogRef?: Ref<HTMLDialogElement> };
export function SiteStatusPresentation({ status, seconds, bypass, protectedPage, testContextChanged, dialogRef }: Presentation) {
  const block = status.mode === 'active' && protectedPage && !bypass;
  return <>
    {status.announcementEnabled && status.announcement ? <aside role="status" aria-label="Site announcement" className="sticky top-0 z-40 border-b border-[var(--plum)]/30 bg-[var(--lavender)] px-4 py-3 text-center text-[var(--midnight)]">{status.announcement}</aside> : null}
    {status.mode === 'countdown' && protectedPage && !bypass ? <aside className="sticky top-0 z-40 border-b border-amber-700 bg-amber-100 px-4 py-3 text-center text-amber-950">
      <p role="status" aria-live="polite">Please save your work. Maintenance begins shortly.</p>
      <span aria-hidden="true">{seconds ?? 0} seconds</span>
    </aside> : null}
    {status.mode === 'active' && protectedPage && bypass ? <aside role="status" className="sticky top-0 z-40 border-b border-amber-700 bg-amber-100 px-4 py-3 text-center text-amber-950">Maintenance is active. Your super administrator account has privileged access. App changes still use the current account or demo test tier.</aside> : null}
    {block ? <dialog ref={dialogRef} tabIndex={-1} onCancel={event => event.preventDefault()} aria-labelledby="site-maintenance-title" aria-describedby="site-maintenance-description" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[var(--plum)]/30 bg-[var(--cream)] p-6 text-[var(--midnight)] shadow-xl backdrop:bg-black/60">
      <h2 id="site-maintenance-title" className="text-2xl font-semibold">Maintenance is active</h2>
      <p id="site-maintenance-description" className="mt-3">The site is temporarily unavailable. Your unsaved entries are still here. Leave this tab open and try again after the site reopens.</p>
      <p className="mt-3 text-sm">This page will update when maintenance ends.</p>
      {testContextChanged ? <div className="mt-4">
        <p role="alert">Testing session ended. Return to admin to continue in your own account. Returning will leave this page and discard unsaved values.</p>
        <form action={stopTestSessionAction}><button className="mt-3 rounded-lg border border-current px-3 py-2 font-semibold">Return to admin</button></form>
      </div> : null}
    </dialog> : null}
  </>;
}

export function SiteStatus({ bypass, canHaveBypass }: { bypass: boolean; canHaveBypass: boolean }) {
  const pathname = usePathname();
  const protectedPage = protectedSitePath(pathname);
  const [sample, setSample] = useState<SiteStatusSample | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(0);
  const [contextBypass, setContextBypass] = useState<boolean | null>(null);
  const [testContextChanged, setTestContextChanged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const initialBypass = useRef(bypass);

  const liveBypass = contextBypass ?? bypass;
  useEffect(() => {
    const context = new PrivateContextValidator({
      visible: () => document.visibilityState === 'visible',
      wallNow: () => Date.now(),
      initialBypass: initialBypass.current,
      read: async signal => {
        const response = await fetch('/api/site-status/context', { cache: 'no-store', signal });
        if (!response.ok) throw Error('Private status unavailable');
        return await response.json() as { bypass: boolean; testContextChanged: boolean };
      },
      onResult: result => { setContextBypass(result.bypass); setTestContextChanged(result.testContextChanged); },
      onUnavailable: () => setContextBypass(false),
      schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: id => window.clearTimeout(id as number),
    });
    const controller = new SiteStatusPoller({
      now: () => performance.now(), wallNow: () => Date.now(), visible: () => document.visibilityState === 'visible',
      read: async signal => {
        const response = await fetch('/api/site-status', { cache: 'no-store', signal });
        if (!response.ok) throw Error('Site status unavailable');
        return await response.json() as PublicSiteStatus;
      },
      onStatus: next => {
        siteStatusChannel.publish(next.status);
        setSample(next); setUnavailable(false); setNow(performance.now());
        if (canHaveBypass && next.status.mode !== 'open' && document.visibilityState === 'visible') context.refresh();
      },
      onError: () => { setUnavailable(true); context.invalidate(); },
      schedule: (callback, delay) => window.setTimeout(callback, delay), cancel: id => window.clearTimeout(id as number),
    });
    const focus = () => { context.focus(); controller.focus(); };
    const visibility = () => { controller.visibilityChanged(); context.visibilityChanged(); };
    const tick = window.setInterval(() => { if (document.visibilityState === 'visible') setNow(performance.now()); }, 1000);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    controller.start();
    return () => { controller.stop(); context.stop(); window.clearInterval(tick); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [canHaveBypass]);

  const view = sample ? siteStatusView(sample, now || sample.receivedAtMs) : null;
  const mode = view?.mode;
  const block = mode === 'active' && protectedPage && !liveBypass;
  useEffect(() => {
    const element = dialog.current;
    if (element) priorFocus.current = setMaintenanceBlocking(element, block, document.activeElement instanceof HTMLElement ? document.activeElement : null, priorFocus.current) as HTMLElement | null;
    return () => {
      if (element) priorFocus.current = setMaintenanceBlocking(element, false, null, priorFocus.current) as HTMLElement | null;
    };
  }, [block]);
  if (!mode && !unavailable) return null;
  return <>
    {unavailable ? <p role="alert" className="sticky top-0 z-40 bg-rose-100 px-4 py-3 text-rose-900">Site status is unavailable. Keep unsaved entries open; saves may be rejected.</p> : null}
    {testContextChanged ? <p role="alert" className="sticky top-0 z-50 bg-rose-100 px-4 py-3 text-rose-900">Testing session ended. Reload or return to admin before saving.</p> : null}
    {mode ? <SiteStatusPresentation status={{ ...sample!.status, mode }} seconds={view?.seconds ?? null} bypass={liveBypass} protectedPage={protectedPage} testContextChanged={testContextChanged} dialogRef={dialog} /> : null}
  </>;
}
