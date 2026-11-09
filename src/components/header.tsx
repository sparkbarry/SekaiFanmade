import Link from 'next/link';
import { Suspense } from 'react';
import { LoginLink } from '@/components/login-link';
import { NavLinks } from '@/components/nav-links';
import { Avatar, Button } from '@/components/ui';
import type { Viewer } from '@/lib/session';

export function Header({ viewer }: { viewer: Viewer | null }) {
  return (
    <header className="border-b-2 border-outline bg-card">
      <div className="sekai-stripe" />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2 font-black tracking-tight">
          <span className="text-lg sm:text-xl">
            Sekai<span className="text-brand dark:text-hero">Fanmade</span>
          </span>
          <span className="hidden text-xs font-bold text-muted md:inline">OpenSekai 自制谱社区</span>
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">
          {viewer ? (
            <>
              <Link
                href={`/users/${viewer.id}`}
                className="flex items-center gap-2 rounded-[10px] px-2 py-1 font-bold hover:bg-cream"
              >
                <Avatar src={viewer.avatarUrl} name={viewer.nickname} />
                <span className="max-w-32 truncate text-sm max-sm:sr-only">{viewer.nickname}</span>
              </Link>
              <form action="/auth/logout" method="post">
                <Button variant="ghost" className="px-2" type="submit" title="退出登录">
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="sr-only">退出登录</span>
                </Button>
              </form>
            </>
          ) : (
            <Suspense>
              <LoginLink />
            </Suspense>
          )}
        </div>
      </div>
    </header>
  );
}
