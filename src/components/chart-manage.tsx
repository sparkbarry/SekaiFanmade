'use client';

import { useActionState } from 'react';
import { deleteChartAction, saveChartInfoAction } from '@/app/actions';
import { Button, inputClass, Notice } from '@/components/ui';

export function ChartInfoForm({
  chartId,
  noteDesigner,
  description,
  tags,
  allowDerivative,
  parentChart,
}: {
  chartId: string;
  noteDesigner: string;
  description: string;
  tags: string[];
  allowDerivative: boolean;
  /** The parent's number, or empty. */
  parentChart: string;
}) {
  const [state, action, pending] = useActionState(saveChartInfoAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="chartId" value={chartId} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        谱师署名
        <input name="noteDesigner" defaultValue={noteDesigner} maxLength={200} className={inputClass} />
        <span className="text-xs font-normal text-muted">之后下载的谱面也用这个署名。上传新版本时会改为新 manifest.json 里的署名。</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        简介
        <textarea name="description" defaultValue={description} maxLength={2000} rows={5} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        标签
        <input name="tags" defaultValue={tags.join(', ')} placeholder="スタンダード, ネタ譜面" className={inputClass} />
        <span className="text-xs font-normal text-muted">用逗号分隔，最多 8 个，每个最多 20 字。</span>
      </label>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="allowDerivative" defaultChecked={allowDerivative} className="size-5 accent-[var(--primary)]" />
        二次利用OK（允许别人以这份谱面为基础改编）
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        親譜面
        <input
          name="parentChart"
          inputMode="numeric"
          defaultValue={parentChart}
          placeholder="改编自哪份谱面，填它的编号"
          className={inputClass}
        />
      </label>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice>已保存</Notice>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  );
}

export function DeleteChartForm({ chartId }: { chartId: string }) {
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
