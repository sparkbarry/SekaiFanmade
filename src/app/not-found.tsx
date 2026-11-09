import { ButtonLink, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4">
      <EmptyState>页面不存在或谱面已被删除</EmptyState>
      <ButtonLink href="/">回到首页</ButtonLink>
    </div>
  );
}
