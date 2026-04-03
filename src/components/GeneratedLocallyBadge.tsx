'use client';

export default function GeneratedLocallyBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-1 font-black uppercase tracking-[0.16em] text-amber-700 ${
        compact ? 'text-[9px]' : 'text-[10px]'
      }`}
    >
      Generated Locally
    </span>
  );
}
