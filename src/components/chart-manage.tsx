'use client';

import { useActionState } from 'react';
import { deleteChartAction, saveDescriptionAction } from '@/app/actions';
import { Button, inputClass, Notice } from '@/components/ui';

export function DescriptionForm({ chartId, description }: { chartId: number; description: string }) {
  const [state, action, pending] = useActionState(saveDescriptionAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="chartId" value={chartId} />
      <textarea name="description" defaultValue={description} maxLength={2000} rows={6} aria-label="简介" className={inputClass} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice>已保存</Notice>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存简介'}
        </Button>
      </div>
    </form>
  );
}

export function DeleteChartForm({ chartId }: { chartId: number }) {
  const [state, action, pending] = useActionState(deleteChartAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('删除后谱面文件会从服务器移除，不能恢复。确定删除？')) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="chartId" value={chartId} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div>
        <Button type="submit" variant="danger" disabled={pending}>
          删除谱面
        </Button>
      </div>
    </form>
  );
}
