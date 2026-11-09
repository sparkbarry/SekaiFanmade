'use client';

import { useActionState, useRef, useTransition } from 'react';
import { deleteCommentAction, postCommentAction, type ActionState } from '@/app/actions';
import { Avatar, Button, formatDateTime, inputClass, Notice } from '@/components/ui';
import type { CommentView } from '@/lib/charts';

export function Comments({
  chartId,
  comments,
  viewerId,
  canModerate,
}: {
  chartId: string;
  comments: CommentView[];
  viewerId: string | null;
  canModerate: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const res = await postCommentAction(prev, form);
    if (res.ok) formRef.current?.reset();
    return res;
  }, {});
  const [deleting, startDelete] = useTransition();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-black">评论 {comments.length > 0 && <span className="text-muted">{comments.length}</span>}</h2>
      {comments.length === 0 && <p className="text-sm text-muted">还没有评论</p>}
      <ul className="flex flex-col gap-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3 rounded-[10px] border-[1.5px] border-border bg-card p-3">
            <Avatar src={c.user.avatarUrl} name={c.user.nickname} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <a href={`/users/${c.user.id}`} className="font-bold hover:underline">
                  {c.user.nickname}
                </a>
                <time className="text-xs text-muted" dateTime={c.createdAt}>
                  {formatDateTime(c.createdAt)}
                </time>
                {(c.user.id === viewerId || canModerate) && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      if (confirm('删除这条评论？')) startDelete(async () => void (await deleteCommentAction(c.id)));
                    }}
                    className="ml-auto text-xs text-muted hover:text-danger"
                  >
                    删除
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {viewerId ? (
        <form ref={formRef} action={action} className="flex flex-col gap-2">
          <input type="hidden" name="chartId" value={chartId} />
          <textarea name="body" required maxLength={1000} rows={3} placeholder="写下评论" aria-label="评论内容" className={inputClass} />
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? '发送中…' : '发表评论'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm">
          <a className="font-bold text-link underline" href={`/auth/login?next=${encodeURIComponent(`/charts/${chartId}`)}`}>
            登录
          </a>
          后可以评论。
        </p>
      )}
    </section>
  );
}
