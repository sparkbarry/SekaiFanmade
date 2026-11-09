'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

const LINKS = [
  { href: '/', label: '谱面', match: (p: string) => p === '/' || p.startsWith('/charts') },
  { href: '/upload', label: '上传', match: (p: string) => p.startsWith('/upload') },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 sm:ml-4">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-sm font-bold sm:px-3',
              active ? 'border-[1.5px] border-outline bg-cream text-brand shadow-[0_2px_0_var(--outline)] dark:text-hero' : 'hover:bg-cream',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
