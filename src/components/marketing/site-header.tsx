"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { BRAND_LOGO_SRC } from "@/lib/brand";
import { NAV_ITEMS, activeNavKey } from "./nav";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--plum)]/10 bg-[var(--card-solid)]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Polly's Web home">
          <Image src={BRAND_LOGO_SRC} alt="Polly's Web" width={128} height={43} priority />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-semibold transition",
                active === item.key
                  ? "text-[var(--plum)] underline decoration-[var(--gold)] decoration-2 underline-offset-8"
                  : "text-[var(--midnight)]/70 hover:bg-[var(--hover)] hover:text-[var(--plum)]",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/login"
            className="rounded-full border border-[var(--plum)]/30 px-4 py-2 text-sm font-semibold text-[var(--plum)] transition hover:bg-[var(--hover)]"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-[var(--plum)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow-sm transition hover:bg-[var(--plum-deep)]"
          >
            Sign Up
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--midnight)] hover:bg-[var(--hover)] lg:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-[var(--plum)]/10 bg-[var(--card-solid)] px-4 pb-4 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active === item.key ? "page" : undefined}
                  className={cn(
                    "block rounded-xl px-3 py-3 text-sm font-semibold transition",
                    active === item.key ? "bg-[var(--hover)] text-[var(--plum)]" : "text-[var(--midnight)]/80",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2 border-t border-[var(--plum)]/10 pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-full border border-[var(--plum)]/30 px-4 py-2 text-center text-sm font-semibold text-[var(--plum)]"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-full bg-[var(--plum)] px-4 py-2 text-center text-sm font-semibold text-[var(--on-accent)]"
            >
              Sign Up
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}