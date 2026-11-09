'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Avatar,
  BookmarkIcon,
  cx,
  DownloadIcon,
  ExternalIcon,
  GridIcon,
  LogoMark,
  UploadIcon,
  UpvotedIcon,
  UserIcon,
} from '@/components/ui';

export interface NavViewer {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  karma: number;
}

interface Item {
  href: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  external?: boolean;
}

const GAME_DOWNLOAD = 'https://github.com/sparkbarry/OpenSekai/releases';
const ACCOUNT_CENTER = 'https://sso.ourtaiko.org/profile/';

/**
 * The floating, frosted navigation of Moesekai: a logo pill, the menu card and the account card, in a
 * column beside the page from lg up. Below that it is a bar with a menu button that opens the same card.
 */
export function SideNav({ viewer }: { viewer: NavViewer | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const tab = search.get('tab');
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Navigating closes the phone menu.
    setLastPath(pathname);
    setOpen(false);
  }

  const mine = viewer ? `/users/${viewer.id}` : null;
  const groups: { title: string; items: Item[] }[] = [
    {
      title: '社区',
      items: [
        { href: '/', label: '谱面广场', icon: <GridIcon className="size-5" />, active: pathname === '/' || pathname.startsWith('/charts') },
        { href: '/upload', label: '上传谱面', icon: <UploadIcon className="size-5" />, active: pathname.startsWith('/upload') },
      ],
    },
  ];
  if (mine) {
    const onMine = pathname === mine;
    groups.push({
      title: '我的',
      items: [
        { href: mine, label: '我的主页', icon: <UserIcon className="size-5" />, active: onMine && !tab },
        { href: `${mine}?tab=mylist`, label: 'マイリスト', icon: <BookmarkIcon className="size-5" />, active: onMine && tab === 'mylist' },
        { href: `${mine}?tab=upvoted`, label: '赞过的谱面', icon: <UpvotedIcon className="size-5" />, active: onMine && tab === 'upvoted' },
      ],
    });
  }
  groups.push({
    title: 'OpenSekai',
    items: [
      { href: GAME_DOWNLOAD, label: '下载 OpenSekai', icon: <DownloadIcon className="size-5" />, external: true },
      { href: ACCOUNT_CENTER, label: 'OurTaiko 账号中心', icon: <UserIcon className="size-5" />, external: true },
    ],
  });

  const next = pathname + (search.toString() ? `?${search}` : '');
  const loginHref = `/auth/login?next=${encodeURIComponent(next)}`;

  const menu = (
    <nav
      id="site-menu"
      aria-label="主导航"
      className="flex flex-col gap-0.5 rounded-[28px] bg-glass p-3 shadow-elev-2 backdrop-blur-xl"
    >
      {groups.map((g, i) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          {i > 0 && <div className="mx-3 my-2 h-px bg-border" />}
          <div className="px-3 pt-2 pb-1.5 text-[13px] font-semibold text-muted">{g.title}</div>
          {g.items.map((item) => {
            const className = cx(
              'flex min-h-11 items-center gap-3 rounded-full px-3.5 text-sm transition',
              item.active ? 'bg-primary-soft font-semibold text-on-primary-soft' : 'hover:bg-surface',
            );
            return item.external ? (
              <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className={className}>
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <ExternalIcon className="size-4 text-muted" />
              </a>
            ) : (
              <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined} className={className}>
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const account = viewer ? (
    <div className="flex items-center gap-1 rounded-[28px] bg-glass p-1.5 pr-2 shadow-elev-1 backdrop-blur-xl">
      <Link href={`/users/${viewer.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-full p-1.5 pr-3 hover:bg-surface">
        <Avatar src={viewer.avatarUrl} name={viewer.nickname} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{viewer.nickname}</span>
          <span className="text-xs text-muted">karma {viewer.karma}</span>
        </span>
      </Link>
      <form action="/auth/logout" method="post">
        <button type="submit" title="退出登录" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground">
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          <span className="sr-only">退出登录</span>
        </button>
      </form>
    </div>
  ) : (
    <div className="flex flex-col gap-3 rounded-[28px] bg-glass p-4 shadow-elev-1 backdrop-blur-xl">
      <p className="text-[13px] leading-5 text-muted">登录 OurTaiko 账号后可以上传、投票和评论。</p>
      <a href={loginHref} className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary hover:brightness-110">
        登录
      </a>
    </div>
  );

  const logo = (
    <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-full bg-glass py-1.5 pr-4 pl-2.5 shadow-elev-1 backdrop-blur-xl">
      <LogoMark className="size-7" />
      <span className="text-lg font-bold tracking-tight text-primary sm:text-xl">
        Sekai<span className="text-brand">Fanmade</span>
      </span>
    </Link>
  );

  return (
    <>
      <aside className="sticky top-4 hidden w-[260px] shrink-0 flex-col gap-3 lg:flex">
        <div className="self-start">{logo}</div>
        {menu}
        {account}
      </aside>

      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-menu"
            className="grid size-11 place-items-center rounded-full bg-glass shadow-elev-1 backdrop-blur-xl"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            <span className="sr-only">{open ? '关闭菜单' : '打开菜单'}</span>
          </button>
          {logo}
          <div className="flex-1" />
          {viewer ? (
            <Link href={`/users/${viewer.id}`} aria-label={`我的主页：${viewer.nickname}`} className="rounded-full shadow-elev-1">
              <Avatar src={viewer.avatarUrl} name={viewer.nickname} size={44} />
            </Link>
          ) : (
            <a href={loginHref} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">
              登录
            </a>
          )}
        </div>
        {open && (
          <div className="flex flex-col gap-3">
            {menu}
            {viewer && account}
          </div>
        )}
      </div>
    </>
  );
}
