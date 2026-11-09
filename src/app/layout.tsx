import type { Metadata, Viewport } from 'next';
import { Roboto_Flex } from 'next/font/google';
import { Suspense, type ReactNode } from 'react';
import { Shards } from '@/components/shards';
import { SideNav } from '@/components/side-nav';
import { karmaOf } from '@/lib/comments';
import { getViewer } from '@/lib/session';
import './globals.css';

// Self-hosted at build time, so visitors' browsers never call Google.
const roboto = Roboto_Flex({ subsets: ['latin'], variable: '--font-roboto-flex', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Sekai Fanmade', template: '%s · Sekai Fanmade' },
  description: 'OpenSekai 自制谱社区：分享、下载和游玩 OpenSekai 自制谱面。',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f6' },
    { media: '(prefers-color-scheme: dark)', color: '#121314' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  const karma = viewer ? (await karmaOf(viewer.id)).karma : 0;
  const nav = viewer ? { id: viewer.id, nickname: viewer.nickname, avatarUrl: viewer.avatarUrl, karma } : null;
  return (
    <html lang="zh-CN" className={roboto.variable}>
      <body className="relative isolate min-h-dvh antialiased">
        <Shards />
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-3 sm:p-4 lg:flex-row lg:items-start lg:gap-6">
          <Suspense>
            <SideNav viewer={nav} />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {children}
            <footer className="px-1 pt-4 pb-8 text-xs leading-5 text-muted">
              OpenSekai 与任何原作游戏、发行方或权利方没有官方关联。谱面与音频的权利归其作者和原权利方。账号由{' '}
              <a className="text-link underline" href="https://sso.ourtaiko.org/profile/">
                OurTaiko 账号中心
              </a>{' '}
              提供。
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
