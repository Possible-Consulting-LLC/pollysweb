"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bug, PlusCircle, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/spoods", label: "My Spoods", icon: Bug },
  { href: "/spoods/new", label: "Add", icon: PlusCircle },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/today") return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--plum)]/10 bg-[var(--cream)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/spoods" ? pathname === "/spoods" || (pathname.startsWith("/spoods/") && !pathname.startsWith("/spoods/new")) : pathname === href || pathname.startsWith(`${href}/`);
          const isAdd = href === "/spoods/new";
          return (
            <li key={href} className="flex-1">
              <Link href={href} prefetch className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold transition", active ? "text-[var(--plum)]" : "text-[var(--midnight)]/45 hover:text-[var(--plum)]", isAdd && "relative")}>
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", isAdd && "bg-[var(--plum)] text-[var(--on-accent)] shadow-md shadow-[var(--plum)]/25", active && !isAdd && "bg-[var(--lavender)]/70")}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-[var(--midnight)]">{title ?? "Your little corner of the web."}</h1>
      {subtitle ? <p className="mt-1 text-sm text-[var(--midnight)]/60">{subtitle}</p> : null}
    </header>
  );
}
