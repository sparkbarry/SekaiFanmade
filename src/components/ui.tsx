import Link from 'next/link';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import type { Difficulty } from '@/lib/db/schema';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** A white surface that lifts off the page: hairline edge plus a soft drop (Moesekai's elevation 1). */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('rounded-[28px] bg-card shadow-elev-1', className)} {...props} />;
}

export function Section({ title, icon, actions, className, children }: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('flex flex-col gap-4 rounded-[28px] bg-card p-5 shadow-elev-1 sm:p-6', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          {icon}
          {title}
        </h2>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

type Variant = 'default' | 'tonal' | 'outline' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  default: 'bg-primary text-on-primary hover:brightness-110',
  tonal: 'bg-secondary text-on-secondary hover:brightness-95 dark:hover:brightness-125',
  outline: 'border-[1.5px] border-border bg-card hover:bg-surface',
  ghost: 'hover:bg-surface',
  danger: 'border-[1.5px] border-border bg-card text-danger hover:bg-danger-soft',
};

export function buttonClass(variant: Variant = 'default', className?: string) {
  return cx(
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50',
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
  'w-full rounded-2xl border-[1.5px] border-border bg-surface-low px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-primary focus:bg-card';

/** Segmented control (the sort rows): a grey track with the chosen option raised in white. */
export function segmentClass(active: boolean) {
  return cx(
    'inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition',
    active ? 'bg-card text-primary shadow-[0_1px_3px_rgb(0_0_0/0.14)]' : 'text-muted hover:text-foreground',
  );
}

export const segmentTrackClass = 'inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 no-scrollbar';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
  expert: 'EXPERT',
  master: 'MASTER',
  append: 'APPEND',
};

/** The game's difficulty colours, for dots and accents. Text uses the --diff-*-fg tokens, which pass AA. */
export const DIFFICULTY_DOT: Record<Difficulty, string> = {
  easy: '#66cc22',
  normal: '#33bbee',
  hard: '#ffaa00',
  expert: '#ee4466',
  master: '#bb33ee',
  append: '#ee77cc',
};

export function difficultyTint(d: Difficulty): CSSProperties {
  return { background: `var(--diff-${d}-bg)`, color: `var(--diff-${d}-fg)` };
}

export function DifficultyBadge({
  difficulty,
  level,
  size = 'md',
  solid = false,
}: {
  difficulty: Difficulty;
  level: number;
  size?: 'sm' | 'md';
  /** On a cover: white pill instead of the tinted one. */
  solid?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-bold tabular-nums',
        size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        solid && 'bg-card shadow-[0_1px_3px_rgb(0_0_0/0.15)]',
      )}
      style={solid ? { color: `var(--diff-${difficulty}-fg)` } : difficultyTint(difficulty)}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ background: DIFFICULTY_DOT[difficulty] }} />
      {DIFFICULTY_LABEL[difficulty]} {level}
    </span>
  );
}

export function Chip({ tone = 'secondary', className, children }: {
  tone?: 'secondary' | 'tertiary' | 'neutral';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold',
        tone === 'secondary' && 'bg-secondary text-on-secondary',
        tone === 'tertiary' && 'bg-tertiary text-on-tertiary',
        tone === 'neutral' && 'bg-surface-high text-muted',
        className,
      )}
    >
      {children}
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
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-on-secondary"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[28px] border-2 border-dashed border-border bg-card/60 px-6 py-14 text-center text-sm font-semibold text-muted">
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex gap-3 rounded-2xl px-4 py-3 text-[13px] leading-5',
        tone === 'error' && 'bg-danger-soft text-on-danger-soft',
        tone === 'info' && 'bg-tertiary text-on-tertiary',
        tone === 'success' && 'bg-secondary text-on-secondary',
      )}
    >
      <InfoIcon className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Page heading: an overline, the title with one highlighted word, and a line of description. */
export function PageHeader({ overline, title, mark, children }: {
  overline?: ReactNode;
  title: ReactNode;
  mark?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5 px-1 pt-1">
      {overline && <span className="text-[13px] font-semibold text-primary">{overline}</span>}
      <h1 className="text-[26px] leading-9 font-semibold sm:text-[32px] sm:leading-10">
        {title}
        {mark && <span className="title-mark">{mark}</span>}
      </h1>
      {children && <p className="max-w-3xl text-sm leading-6 text-muted">{children}</p>}
    </header>
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

/* ---------- icons (stroke, 24-unit) ---------- */

type IconProps = { className?: string };
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function InfoIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}
export function GridIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
export function UploadIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
export function DownloadIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  );
}
export function BookmarkIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </svg>
  );
}
export function UserIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
export function UpvotedIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M12 5l7 11H5z" />
    </svg>
  );
}
export function SearchIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
export function ExternalIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}
export function CommentIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}
export function MusicIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} {...stroke} strokeWidth={1.6}>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}
export function PlayIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={className}>
      <path d="M3 1.5l7 4.5-7 4.5z" fill="currentColor" />
    </svg>
  );
}
export function StopIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={className}>
      <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}
export function UpIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={className}>
      <path d="M6 1.5l5 8H1z" fill="currentColor" />
    </svg>
  );
}
export function DownIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={className}>
      <path d="M6 10.5l5-8H1z" fill="currentColor" />
    </svg>
  );
}
export function LogoMark({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 28 28" className={className}>
      <polygon points="4,22 14,4 24,22" fill="#33ccbb" />
      <polygon points="10,22 14,15 18,22" fill="var(--surface-card)" />
    </svg>
  );
}
