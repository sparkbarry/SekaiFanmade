import { buttonClass, ButtonLink, EmptyState } from '@/components/ui';

export const metadata = { title: '登录失败' };

export default async function AuthError({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState>{reason === 'unavailable' ? '账号服务暂时不可用，请稍后再试' : '登录没有完成，请重新登录'}</EmptyState>
      <div className="flex gap-2">
        <a className={buttonClass()} href="/auth/login">
          重新登录
        </a>
        <ButtonLink variant="outline" href="/">
          回到首页
        </ButtonLink>
      </div>
    </div>
  );
}
