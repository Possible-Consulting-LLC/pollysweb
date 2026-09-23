"use client";

import { useEffect, useState } from 'react';
import type { Celebration } from '@/lib/care-progress';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { Art } from './reward-art';
import { Button } from '@/components/ui/button';

const EVENT = 'spoodly:care-saved';
export function celebrateCare(message: string, celebrations: Celebration[] = []) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, celebrations } }));
}

function Confetti() {
  return <div aria-hidden="true" className="care-confetti pointer-events-none fixed inset-0 z-[150] overflow-hidden">
    {Array.from({length: 32}, (_, index) => <i key={index} style={{
      left: `${(index * 37) % 100}%`, background: ['#ecc768', '#cbb2e4', '#9ad8cd', '#edacc8'][index % 4],
      animationDelay: `${(index % 6) * 55}ms`, transform: `rotate(${index * 31}deg)`,
    }} />)}
  </div>;
}

export function CareCelebrations() {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [save, setSave] = useState<{message:string; id:number} | null>(null);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let serial = 0;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{message:string;celebrations:Celebration[]}>).detail;
      setSave({message: detail.message, id: ++serial});
      const timer = setTimeout(() => {
        setSave(null);
        setQueue(current => [...current, ...detail.celebrations.filter(item => !current.some(existing => existing.key === item.key))]);
        timers.delete(timer);
      }, 1500);
      timers.add(timer);
    };
    window.addEventListener(EVENT, listener);
    return () => { window.removeEventListener(EVENT, listener); timers.forEach(clearTimeout); };
  }, []);
  const current = queue[0];
  const close = () => setQueue(items => items.slice(1));
  return <>
    {save && <div key={save.id}><Confetti /><p role="status" className="fixed bottom-24 left-1/2 z-[140] w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-4 text-center text-sm text-[var(--midnight)] shadow-xl">{save.message}</p></div>}
    {current && <ModalDialog labelledBy="care-celebration-title" onClose={close}>
      <div className="pointer-events-none flex min-h-dvh items-center justify-center p-5">
        <section key={current.key} className="care-celebration pointer-events-auto relative w-full max-w-sm rounded-3xl border border-[var(--gold)]/50 bg-[var(--card)] p-7 text-center text-[var(--midnight)] shadow-2xl">
          <Confetti />
          <p className="text-sm font-semibold tracking-wide text-[var(--plum)]">Congratulations!</p>
          <div className="care-award-art my-5 flex justify-center">
            <Art symbol={current.kind === 'star' ? 'stars' : current.symbol as Parameters<typeof Art>[0]['symbol']} earned />
          </div>
          <h2 id="care-celebration-title" className="font-[family-name:var(--font-display)] text-3xl">{current.kind === 'star' ? current.title : `You earned ${current.title}!`}</h2>
          <p className="mt-3 text-base">{current.message}</p>
          <Button autoFocus className="mt-6 w-full" onClick={close}>{queue.length > 1 ? 'See next reward' : 'Lovely!'}</Button>
        </section>
      </div>
    </ModalDialog>}
  </>;
}
