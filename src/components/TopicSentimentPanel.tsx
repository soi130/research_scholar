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

function DirectionMetricBar({
  value,
  valueLabel,
}: {
  value: number;
  valueLabel: string;
}) {
  const clampedValue = Math.max(-2, Math.min(2, value));
  const widthPercent = (Math.abs(clampedValue) / 2) * 50;
  const fillClassName = clampedValue < 0 ? getDirectionFillClass(clampedValue) : getDirectionFillClass(clampedValue || 1);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Direction</span>
        <span className="text-[10px] font-bold text-slate-700">{valueLabel}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-red-100 via-amber-100 to-emerald-100 dark:from-red-950/45 dark:via-amber-900/35 dark:to-emerald-950/45">
        <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-slate-500/70" />
        {clampedValue !== 0 ? (
          <div
            className={`absolute inset-y-0 rounded-full ${fillClassName}`}
            style={
              clampedValue < 0
                ? { right: '50%', width: `${widthPercent}%` }
                : { left: '50%', width: `${widthPercent}%` }
            }
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

function getDirectionTextClass(direction: number) {
  if (direction < 0) return 'text-red-600';
  if (direction > 0) return 'text-emerald-600';
  return 'text-amber-600';
}

export default function TopicSentimentPanel({
  topicLabels,
  rail = false,
}: {
  topicLabels: TopicLabel[];
  topicSummary: TopicSummary;
  rail?: boolean;
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
      <div
        className={rail ? 'grid grid-cols-1 gap-3' : 'grid gap-3'}
        style={rail ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        {visibleLabels.map((label) => (
          <div key={label.topic} className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] px-3 py-2 space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-900">{TOPIC_LABELS[label.topic]}</span>
              <span className={`text-[10px] font-bold ${getDirectionTextClass(label.direction)}`}>
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
              <DirectionMetricBar
                value={label.direction}
                valueLabel={label.direction > 0 ? `+${label.direction}` : String(label.direction)}
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
