'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function AdminNav({ role }: { role: 'admin' | 'super_admin' }) {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="md:w-52 md:shrink-0">
    <p className="mb-3 text-sm font-semibold">{role === 'super_admin' ? 'Super administrator' : 'Administrator'}</p>
    <ul className="flex flex-wrap gap-2 md:flex-col">
      {[['/admin', 'Overview'], ['/admin/accounts', 'Accounts'], ['/admin/operations', 'Operations'], ...(role === 'super_admin' ? [['/admin/features', 'Features'], ['/admin/plans', 'Plans'], ['/admin/subscriptions', 'Subscriptions'], ['/admin/demos', 'Demo accounts'], ['/admin/maintenance', 'Maintenance']] : []), ['/admin/audit', 'Audit history'], ['/admin/reauth', 'Confirm identity'], ['/settings', 'My settings'], ['/home', 'Return to app']].map(([href, label]) =>
        <li key={href}><Link href={href} aria-current={pathname === href ? 'page' : undefined}
          className={`block rounded-xl px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${pathname === href ? 'bg-[var(--plum)] text-[var(--on-accent)]' : 'bg-[var(--lavender)]/40'}`}>{label}</Link></li>)}
    </ul>
  </nav>;
}
