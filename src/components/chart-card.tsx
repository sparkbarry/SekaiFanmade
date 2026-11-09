import Link from 'next/link';
import { Avatar, DIFFICULTY_COLOR, DifficultyBadge } from '@/components/ui';
import type { ChartSummary } from '@/lib/charts';

export function Jacket({ url, title, className }: { url: string | null; title: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={`${title} 封面`} loading="lazy" className={`aspect-square w-full object-cover ${className ?? ''}`} />
  ) : (
    <div
      aria-hidden
      className={`flex aspect-square w-full items-center justify-center bg-cream text-4xl font-black text-input ${className ?? ''}`}
    >
      ♪
    </div>
  );
}

export function ChartCard({ chart }: { chart: ChartSummary }) {
  const artist = [chart.singer, chart.composer].filter(Boolean).join(' / ');
  return (
    <Link
      href={`/charts/${chart.id}`}
      className="group flex flex-col overflow-hidden rounded-[14px] border-2 border-outline bg-card shadow-drop transition-all hover:-translate-y-0.5 hover:shadow-drop-hover"
    >
      <div className="h-1.5 shrink-0" style={{ background: DIFFICULTY_COLOR[chart.difficulty] }} />
      <div className="relative border-b-2 border-outline">
        <Jacket url={chart.jacketUrl} title={chart.title} />
        <div className="absolute bottom-2 left-2">
          <DifficultyBadge difficulty={chart.difficulty} level={chart.playLevel} size="sm" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-black leading-snug">{chart.scoreTitle}</h3>
        {chart.scoreTitle !== chart.title && <p className="truncate text-sm font-bold">{chart.title}</p>}
        {artist && <p className="truncate text-xs text-muted">{artist}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted">
          <Avatar src={chart.uploader.avatarUrl} name={chart.uploader.nickname} size={20} />
          <span className="min-w-0 flex-1 truncate">{chart.uploader.nickname}</span>
          <span title="得分" className="tabular-nums">▲ {chart.score}</span>
          <span title="评论" className="tabular-nums">💬 {chart.commentCount}</span>
          <span title="游玩" className="tabular-nums">▶ {chart.playCount}</span>
        </div>
      </div>
    </Link>
  );
}

export function ChartGrid({ charts }: { charts: ChartSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {charts.map((c) => (
        <ChartCard key={c.id} chart={c} />
      ))}
    </div>
  );
}
