'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, cx, formatDateTime, inputClass, Notice } from '@/components/ui';
import { VoteControl, type Vote } from '@/components/vote-control';
import { MORE_POLICY, NARROW_POLICY, planReplies, WIDE_POLICY } from '@/lib/comment-folding';

/** Reddit-style comment section, as on OurTaiko Fanmade: threads, votes, sorts and folding. */

interface CommentNode {
  id: number;
  parentId: number | null;
  depth: number;
  author: { id: string; nickname: string; avatarUrl: string | null } | null;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  removed: boolean;
  score: number;
  myVote: Vote;
  replyCount: number;
  replies: CommentNode[];
}

interface Page {
  items: CommentNode[];
  total: number;
  commentCount: number;
  page: number;
  pageSize: number;
}

const SORTS = [
  ['best', '最佳'],
  ['top', '得分最高'],
  ['new', '最新'],
  ['old', '最早'],
  ['controversial', '争议'],
] as const;
type Sort = (typeof SORTS)[number][0];

/** A score this low folds the comment until it is opened. */
const LOW_SCORE = -5;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `请求失败（${res.status}）。`);
  return json;
}

/** Plain text with http(s) links made clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer nofollow ugc" className="text-link underline break-all">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function CommentForm({
  placeholder,
  submitLabel,
  initial = '',
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setPending(true);
        setError(null);
        try {
          await onSubmit(body);
          setBody('');
        } catch (err) {
          setError(err instanceof Error ? err.message : '发送失败。');
        } finally {
          setPending(false);
        }
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={10000}
        rows={3}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className={inputClass}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? '发送中…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}

export function Comments({
  chartId,
  viewer,
  initialCount,
}: {
  chartId: string;
  viewer: { id: string; isAdmin: boolean } | null;
  initialCount: number;
}) {
  const [sort, setSort] = useState<Sort>('best');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Map<number, number>>(new Map());
  const narrow = useRef(false);
  const loginNext = `/charts/${chartId}`;

  const fetchPage = useCallback(async () => {
    const result: Page = await call(`/api/v1/charts/${chartId}/comments?sort=${sort}&page=${page}`, 'GET');
    const plan = new Map<number, number>();
    for (const root of result.items) {
      for (const [id, n] of planReplies(root, narrow.current ? NARROW_POLICY : WIDE_POLICY)) plan.set(id, n);
    }
    return { result, plan };
  }, [chartId, sort, page]);

  const apply = useCallback((loaded: { result: Page; plan: Map<number, number> } | null, err?: unknown) => {
    if (loaded) {
      setShown(loaded.plan);
      setData(loaded.result);
      setError(null);
    } else {
      setError(err instanceof Error ? err.message : '无法加载评论。');
    }
  }, []);

  const load = useCallback(
    () => fetchPage().then(apply, (err: unknown) => apply(null, err)),
    [fetchPage, apply],
  );

  useEffect(() => {
    narrow.current = window.innerWidth < 640;
    let live = true;
    fetchPage().then(
      (loaded) => live && apply(loaded),
      (err: unknown) => live && apply(null, err),
    );
    return () => {
      live = false;
    };
  }, [fetchPage, apply]);

  const showMore = (node: CommentNode) => {
    setShown((prev) => {
      const next = new Map(prev);
      for (const [id, n] of planReplies(node, MORE_POLICY, prev.get(node.id) ?? 0)) next.set(id, Math.max(n, next.get(id) ?? 0));
      return next;
    });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const count = data?.commentCount ?? initialCount;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black">
          评论 {count > 0 && <span className="text-muted">{count}</span>}
        </h2>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap text-muted">排序</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            className={cx(inputClass, 'w-auto py-1')}
          >
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {viewer ? (
        <CommentForm
          placeholder="写下评论"
          submitLabel="发表评论"
          onSubmit={async (body) => {
            await call(`/api/v1/charts/${chartId}/comments`, 'POST', { body });
            if (page !== 1) setPage(1);
            await load();
          }}
        />
      ) : (
        <p className="text-sm">
          <a className="font-bold text-link underline" href={`/auth/login?next=${encodeURIComponent(loginNext)}`}>
            登录
          </a>
          后可以评论和投票。
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {data && data.items.length === 0 && <p className="text-sm text-muted">还没有评论</p>}
      <div className="flex flex-col gap-3">
        {data?.items.map((c) => (
          <CommentView
            key={c.id}
            comment={c}
            viewer={viewer}
            loginNext={loginNext}
            shown={shown}
            onMore={showMore}
            onChanged={load}
            chartId={chartId}
          />
        ))}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <span className="text-sm font-bold tabular-nums">
            {page} / {pages}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            下一页
          </Button>
        </div>
      )}
    </section>
  );
}

function CommentView({
  comment,
  viewer,
  loginNext,
  shown,
  onMore,
  onChanged,
  chartId,
}: {
  comment: CommentNode;
  viewer: { id: string; isAdmin: boolean } | null;
  loginNext: string;
  shown: Map<number, number>;
  onMore: (node: CommentNode) => void;
  onChanged: () => Promise<void>;
  chartId: string;
}) {
  const gone = comment.deleted || comment.removed;
  const [open, setOpen] = useState(comment.score > LOW_SCORE);
  const [mode, setMode] = useState<'view' | 'reply' | 'edit'>('view');
  const [error, setError] = useState<string | null>(null);
  const mine = !!viewer && comment.author?.id === viewer.id;
  const visible = shown.get(comment.id) ?? 0;
  const replies = useMemo(() => comment.replies.slice(0, visible), [comment.replies, visible]);
  const hidden = comment.replyCount - replies.length;

  let header: ReactNode;
  if (gone) {
    header = <span className="text-sm text-muted">{comment.removed ? '[已被管理员移除]' : '[已删除]'}</span>;
  } else {
    header = (
      <>
        <Avatar src={comment.author!.avatarUrl} name={comment.author!.nickname} size={24} />
        <a href={`/users/${comment.author!.id}`} className="text-sm font-bold hover:underline">
          {comment.author!.nickname}
        </a>
      </>
    );
  }

  return (
    <div className={cx('flex flex-col gap-1', comment.depth === 0 && 'rounded-[10px] border-[1.5px] border-border bg-card p-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? '折叠' : '展开'}
          className="w-5 text-xs text-muted hover:text-foreground"
        >
          {open ? '[−]' : '[+]'}
        </button>
        {header}
        <time className="text-xs text-muted" dateTime={comment.createdAt}>
          {formatDateTime(comment.createdAt)}
          {comment.editedAt && ' · 已编辑'}
        </time>
        {!open && <span className="text-xs text-muted">得分 {comment.score}</span>}
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-4">
          {gone ? null : mode === 'edit' ? (
            <CommentForm
              placeholder="编辑评论"
              submitLabel="保存"
              initial={comment.body ?? ''}
              autoFocus
              onCancel={() => setMode('view')}
              onSubmit={async (body) => {
                await call(`/api/v1/comments/${comment.id}`, 'PATCH', { body });
                setMode('view');
                await onChanged();
              }}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">
              <Linkified text={comment.body ?? ''} />
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <VoteControl
              kind="comment"
              id={comment.id}
              score={comment.score}
              myVote={comment.myVote}
              signedIn={!!viewer}
              loginNext={loginNext}
              size="sm"
              disabled={gone && comment.myVote === 0}
            />
            {!gone && viewer && (
              <button type="button" className="font-bold text-muted hover:text-foreground" onClick={() => setMode(mode === 'reply' ? 'view' : 'reply')}>
                回复
              </button>
            )}
            {!gone && mine && (
              <button type="button" className="font-bold text-muted hover:text-foreground" onClick={() => setMode('edit')}>
                编辑
              </button>
            )}
            {!gone && (mine || viewer?.isAdmin) && (
              <button
                type="button"
                className="font-bold text-muted hover:text-danger"
                onClick={async () => {
                  if (!confirm(mine ? '删除这条评论？' : '以管理员身份移除这条评论？')) return;
                  try {
                    await call(`/api/v1/comments/${comment.id}`, 'DELETE');
                    await onChanged();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : '删除失败。');
                  }
                }}
              >
                {mine ? '删除' : '移除'}
              </button>
            )}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {mode === 'reply' && (
            <CommentForm
              placeholder={`回复 ${comment.author?.nickname ?? ''}`}
              submitLabel="回复"
              autoFocus
              onCancel={() => setMode('view')}
              onSubmit={async (body) => {
                await call(`/api/v1/charts/${chartId}/comments`, 'POST', { body, parentId: comment.id });
                setMode('view');
                await onChanged();
              }}
            />
          )}
          {replies.map((r) => (
            <CommentView
              key={r.id}
              comment={r}
              viewer={viewer}
              loginNext={loginNext}
              shown={shown}
              onMore={onMore}
              onChanged={onChanged}
              chartId={chartId}
            />
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => onMore(comment)} className="w-fit text-xs font-bold text-link hover:underline">
              {replies.length === 0 ? `${hidden} 条回复` : `还有 ${hidden} 条回复`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
