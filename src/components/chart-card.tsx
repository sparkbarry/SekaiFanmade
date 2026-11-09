import Link from 'next/link';
import { Avatar, Chip, CommentIcon, DifficultyBadge, MusicIcon, PlayIcon, UpIcon } from '@/components/ui';
import type { ChartSummary } from '@/lib/charts';
import type { Difficulty } from '@/lib/db/schema';

/** The cover, or a square tinted with the difficulty colour when the chart has none. */
export function Jacket({
  url,
  title,
  difficulty,
  className,
}: {
  url: string | null;
  title: string;
  difficulty: Difficulty;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${title} 封面`} loading="lazy" className={`aspect-square w-full object-cover ${className ?? ''}`} />
  ) : (
    <div
      aria-hidden
      className={`grid aspect-square w-full place-items-center ${className ?? ''}`}
      style={{ background: `var(--diff-${difficulty}-bg)`, color: `var(--diff-${difficulty}-fg)` }}
    >
      <MusicIcon className="size-1/4 opacity-55" />
    </div>
  );
}

export function ChartCard({ chart }: { chart: ChartSummary }) {
  const artist = chart.singer || chart.composer;
  const sub = [chart.scoreTitle !== chart.title ? chart.title : null, artist].filter(Boolean).join(' · ');
  return (
    <Link
      href={`/charts/${chart.id}`}
      className="group flex flex-col overflow-hidden rounded-[20px] bg-card shadow-elev-1 transition hover:-translate-y-0.5 hover:shadow-elev-2"
    >
      <div className="relative overflow-hidden">
        <Jacket url={chart.jacketUrl} title={chart.title} difficulty={chart.difficulty} className="transition duration-300 group-hover:scale-[1.03]" />
        <span className="absolute top-2.5 left-2.5 rounded-lg bg-black/60 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
          #{chart.numberId}
        </span>
        <span className="absolute bottom-2.5 left-2.5">
          <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} size="sm" solid />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold">{chart.scoreTitle}</h3>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Avatar src={chart.uploader.avatarUrl} name={chart.uploader.nickname} size={20} />
          <span className="truncate">{chart.uploader.nickname}</span>
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted">
          <span title="得分" className="inline-flex items-center gap-1 font-semibold text-up tabular-nums">
            <UpIcon className="size-3" />
            {chart.score}
          </span>
          <span title="评论" className="inline-flex items-center gap-1 tabular-nums">
            <CommentIcon className="size-3.5" />
            {chart.commentCount}
          </span>
          <span title="游玩" className="inline-flex items-center gap-1 tabular-nums">
            <PlayIcon className="size-3" />
            {chart.playCount}
          </span>
        </div>
        {(chart.allowDerivative || chart.parentChartId || chart.hasVideo) && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {chart.hasVideo && <Chip tone="neutral">MV</Chip>}
            {chart.allowDerivative && <Chip>二次利用OK</Chip>}
            {chart.parentChartId && <Chip tone="tertiary">親譜面あり</Chip>}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ChartGrid({ charts }: { charts: ChartSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
      {charts.map((c) => (
        <ChartCard key={c.id} chart={c} />
      ))}
    </div>
  );
}
