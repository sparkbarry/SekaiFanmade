'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { buttonClass } from '@/components/ui';

export function LoginLink({ label = '登录' }: { label?: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const next = pathname + (search ? `?${search}` : '');
  return (
    <a href={`/auth/login?next=${encodeURIComponent(next)}`} className={buttonClass('default', 'px-3')}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="max-sm:sr-only">{label}</span>
    </a>
  );
}
