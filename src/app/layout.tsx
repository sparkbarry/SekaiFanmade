import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { getViewer } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Sekai Fanmade', template: '%s · Sekai Fanmade' },
  description: 'OpenSekai 自制谱社区：分享、下载和游玩 OpenSekai 自制谱面。',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fffef9' },
    { media: '(prefers-color-scheme: dark)', color: '#1d1715' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh antialiased">
        <Header viewer={viewer} />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
          OpenSekai 与任何原作游戏、发行方或权利方没有官方关联。谱面与音频的权利归其作者和原权利方。
          账号由 <a className="text-link underline" href="https://sso.ourtaiko.org/profile/">OurTaiko 账号中心</a> 提供。
        </footer>
      </body>
    </html>
  );
}
