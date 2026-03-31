'use client';

import { TOPIC_LABELS } from '@/lib/topic-taxonomy';
import { formatTopicDirection, type TopicLabel, type TopicSummary } from '@/lib/topic-sentiment';

function MetricBar({
  label,
  valueLabel,
  percent,
  fillClassName,
  trackClassName = 'bg-[var(--surface-muted)]',
  markerPercent,
  markerClassName = 'bg-slate-500/80',
}: {
  label: string;
  valueLabel: string;
  percent: number;
  fillClassName: string;
  trackClassName?: string;
  markerPercent?: number;
  markerClassName?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <span className="text-[10px] font-bold text-slate-700">{valueLabel}</span>
      </div>
      <div className={`relative h-2.5 overflow-hidden rounded-full ${trackClassName}`}>
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${fillClassName}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
        {typeof markerPercent === 'number' ? (
          <div
            className={`absolute top-1/2 h-4 w-[2px] -translate-y-1/2 ${markerClassName}`}
            style={{ left: `${Math.max(0, Math.min(100, markerPercent))}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

function getDirectionFillClass(direction: number) {
  if (direction <= -2) return 'bg-red-500';
  if (direction === -1) return 'bg-red-400';
  if (direction === 0) return 'bg-amber-300';
  if (direction === 1) return 'bg-emerald-400';
  return 'bg-emerald-500';
}

export default function TopicSentimentPanel({
  topicLabels,
}: {
  topicLabels: TopicLabel[];
  topicSummary: TopicSummary;
}) {
  const visibleLabels = topicLabels
    .filter((label) => label.relevance >= 2 && label.confidence >= 2)
    .slice(0, 8);

  if (visibleLabels.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface-soft)] p-4">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600">Topic Sentiment</p>
        <p className="mt-2 text-sm text-slate-500">No structured topic sentiment extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface-soft)] p-4 space-y-3">
      <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600">Topic Sentiment</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {visibleLabels.map((label) => (
          <div key={label.topic} className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] px-3 py-2 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-900">{TOPIC_LABELS[label.topic]}</span>
              <span className="text-[10px] font-bold text-violet-700">
                {formatTopicDirection(label)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <MetricBar
                label="Relevance"
                valueLabel={`${label.relevance}/3`}
                percent={(label.relevance / 3) * 100}
                fillClassName="bg-violet-500"
              />
              <MetricBar
                label="Direction"
                valueLabel={label.direction > 0 ? `+${label.direction}` : String(label.direction)}
                percent={((label.direction + 2) / 4) * 100}
                fillClassName={getDirectionFillClass(label.direction)}
                trackClassName="bg-gradient-to-r from-red-950/45 via-amber-900/35 to-emerald-950/45 md:from-red-100 md:via-amber-100 md:to-emerald-100 dark:from-red-950/45 dark:via-amber-900/35 dark:to-emerald-950/45"
                markerPercent={50}
                markerClassName="bg-slate-500/70"
              />
              <MetricBar
                label="Confidence"
                valueLabel={`${label.confidence}/3`}
                percent={(label.confidence / 3) * 100}
                fillClassName="bg-sky-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 font-semibold">
              {label.regime ? <span>Regime {label.regime}</span> : null}
            </div>
            <p className="text-xs leading-5 text-slate-700">{label.evidence}</p>
            {label.drivers && label.drivers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {label.drivers.map((driver) => (
                  <span key={`${label.topic}-${driver}`} className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[9px] font-bold text-slate-600 border border-[color:var(--border)]">
                    {driver}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
