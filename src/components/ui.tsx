import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { Difficulty } from '@/lib/db/schema';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx('rounded-[14px] border-2 border-outline bg-card shadow-drop', className)}
      {...props}
    />
  );
}

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  default:
    'border-2 border-outline bg-brand text-white shadow-press hover:-translate-y-0.5 hover:shadow-press-hover active:translate-y-0.5 active:shadow-none',
  outline:
    'border-2 border-outline bg-card shadow-press hover:-translate-y-0.5 hover:shadow-press-hover active:translate-y-0.5 active:shadow-none',
  secondary: 'border-[1.5px] border-outline bg-cream',
  ghost: 'border-2 border-transparent hover:bg-cream',
  danger:
    'border-2 border-outline bg-card text-danger shadow-press hover:-translate-y-0.5 hover:shadow-press-hover active:translate-y-0.5 active:shadow-none',
};

export function buttonClass(variant: Variant = 'default', className?: string) {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-4 py-2 text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    className,
  );
}

export function Button({ variant, className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export const inputClass =
  'w-full rounded-[10px] border-2 border-input bg-card px-3 py-2 text-sm outline-none focus:border-outline focus:ring-2 focus:ring-link/40';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
  expert: 'EXPERT',
  master: 'MASTER',
  append: 'APPEND',
};

/** Lightened from the game's difficulty colours so ink text passes AA in both themes. */
export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#8fe34d',
  normal: '#6fd0f5',
  hard: '#ffc04d',
  expert: '#ff8fa3',
  master: '#d58ff5',
  append: '#f5a3e6',
};

export function DifficultyBadge({ difficulty, level, size = 'md' }: { difficulty: Difficulty; level: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[#382d2a] font-bold text-[#382d2a]',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
      )}
      style={{ background: DIFFICULTY_COLOR[difficulty] }}
    >
      <span>{DIFFICULTY_LABEL[difficulty]}</span>
      <span className="tabular-nums">{level}</span>
    </span>
  );
}

export function Avatar({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border-[1.5px] border-outline object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-outline bg-cream text-xs font-bold"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border-2 border-dashed border-input bg-cream px-6 py-12 text-center font-bold text-muted">
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-[10px] border-[1.5px] px-3 py-2 text-sm',
        tone === 'error' ? 'border-danger text-danger' : 'border-input bg-cream',
      )}
    >
      {children}
    </div>
  );
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(
    new Date(iso),
  );
}
