'use client';

import React, { useState, useEffect, useEffectEvent } from 'react';
import { MessageSquare, ExternalLink, Loader2, Check, FolderKanban } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MULTI_SELECT_SEARCH_FIELDS, type AdvancedSearchFilters } from '@/lib/search';
import type { TopicLabel, TopicSummary } from '@/lib/topic-sentiment';
import TopicSentimentPanel from './TopicSentimentPanel';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
interface Paper {
  id: number;
  title: string;
  authors: string[];
  publisher: string;
  series_name: string;
  published_date: string;
  abstract: string;
  key_findings: string[];
  tags: string[];
  forecasts: Record<string, string>;
  topic_labels: TopicLabel[];
  topic_summary: TopicSummary;
  filename: string;
}

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([subK, subV]) => `${subK}: ${subV}`)
      .join(', ');
  }
  return String(v);
};

import PdfThumbnail from './PdfThumbnail';

function appendAdvancedSearchParams(params: URLSearchParams, filters: AdvancedSearchFilters) {
  for (const field of MULTI_SELECT_SEARCH_FIELDS) {
    if (filters[field].length > 0) {
      params.set(field, JSON.stringify(filters[field]));
    }
  }
  if (filters.published_from) params.set('published_from', filters.published_from);
  if (filters.published_to) params.set('published_to', filters.published_to);
}

export default function LibraryView({ onSelectForChat, onOpenViewer, searchQuery = '', searchFilters }: { 
  onSelectForChat: (ids: number[]) => void,
  onOpenViewer?: (id: number) => void,
  searchQuery?: string,
  searchFilters: AdvancedSearchFilters
}) {
  const PAGE_SIZE = 40;
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchPapers = async ({ nextOffset, append, query }: { nextOffset: number; append: boolean; query: string }) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    const params = new URLSearchParams({
      status: 'approved',
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
    });
    if (query.trim()) params.set('q', query.trim());
    appendAdvancedSearchParams(params, searchFilters);
    const res = await fetch(`/api/papers?${params.toString()}`);
    const data = await res.json();
    const incoming = Array.isArray(data?.items) ? data.items : [];
    setPapers((prev) => (append ? [...prev, ...incoming] : incoming));
    setOffset(nextOffset);
    setHasMore(Boolean(data?.hasMore));
    setTotal(Number(data?.total || incoming.length));
    setLoading(false);
    setLoadingMore(false);
  };

  const refreshPapers = useEffectEvent((query: string) => {
    void fetchPapers({ nextOffset: 0, append: false, query });
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      refreshPapers(searchQuery);
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchFilters]);

  const toggleSelect = (id: number) => {
    const newSelected = selected.includes(id) 
      ? selected.filter(s => s !== id) 
      : [...selected, id];
    setSelected(newSelected);
    // Only inform parent if we are multi-selecting. If the user clears, we pass empty.
    onSelectForChat(newSelected);
  };

  const handleCardClick = (id: number) => {
    setSelected([id]);
    onSelectForChat([id]);
    if (onOpenViewer) onOpenViewer(id);
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;

  return (
    <div className="space-y-6">
      {selected.length > 0 && (
        <div className="flex items-center justify-between p-4 glass rounded-2xl border border-violet-500/20 mb-6 sticky top-2 z-30 shadow-xl shadow-violet-500/5 transition-all animate-in fade-in slide-in-from-top-4">
          <span className="text-violet-600 font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            {selected.length} research papers selected
          </span>
          <button className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-violet-600/20">
            <MessageSquare size={16} /> Synthesize Chat
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {papers.map((paper) => (
          <div 
            key={paper.id} 
            onClick={() => handleCardClick(paper.id)}
            className={`glass group relative p-5 rounded-3xl border transition-all cursor-pointer flex gap-6 items-start overflow-hidden ${
              selected.includes(paper.id) 
                ? 'border-violet-500/30 bg-violet-500/5 ring-1 ring-violet-500/10' 
                : 'border-slate-200/50 hover:border-violet-500/20 hover:bg-[var(--surface-strong)] active:scale-[0.99]'
            }`}
          >
            {/* 1st Page Preview (List Mode) */}
            <div className="relative w-32 aspect-[3/4] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200/50 group-hover:border-violet-500/20 transition-all flex-shrink-0 shadow-inner">
               <PdfThumbnail paperId={paper.id} className="w-full h-full" />
               {/* Click to open badge */}
               <button
                  onClick={(e) => { e.stopPropagation(); onOpenViewer?.(paper.id); }}
                  className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity"
               >
                  <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl text-violet-600 shadow-xl">
                    <ExternalLink size={16} />
                  </div>
               </button>
            </div>
            
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight group-hover:text-violet-600 transition-colors truncate">
                    {paper.title}
                  </h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">
                    { (paper.authors || []).slice(0, 3).join(', ') } { (paper.authors || []).length > 3 ? '...' : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/50">{paper.publisher || 'N/A'}</span>
                  <span className="text-[9px] text-slate-400 font-bold">{paper.published_date || 'N/A'}</span>
                </div>
              </div>

              {paper.series_name ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-muted)] rounded-xl border border-[color:var(--border)] w-fit">
                  <FolderKanban size={12} className="text-violet-600" />
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Series</span>
                  <span className="text-[11px] font-bold text-slate-800">{paper.series_name}</span>
                </div>
              ) : null}

              {paper.forecasts && Object.keys(paper.forecasts).length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {Object.entries(paper.forecasts).slice(0, 5).map(([k, v]) => (
                    <div key={k} className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface-muted)] rounded-xl border border-[color:var(--border)]">
                      <span className="text-[8px] text-[var(--foreground)] uppercase font-black tracking-tight">{k}</span>
                      <span className="text-[10px] text-[color:var(--accent)] font-bold">{renderValue(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.9fr] gap-4">
                <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Summary</p>
                  <p className="text-sm leading-6 text-slate-700">
                    {paper.abstract || 'No summary available.'}
                  </p>
                </div>

                <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">3 KTAs</p>
                  {paper.key_findings && paper.key_findings.length > 0 ? (
                    <ol className="space-y-2">
                      {paper.key_findings.slice(0, 3).map((finding, index) => (
                        <li key={`${paper.id}-${index}`} className="flex gap-3 text-sm text-slate-700">
                          <span className="mt-0.5 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black flex items-center justify-center flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="leading-6">{finding}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-slate-400">No key takeaways available.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)]">
                {Object.entries(paper.forecasts || {}).slice(0, 4).map(([k, v]) => (
                  <div key={k} className="space-y-0.5 min-w-0">
                    <span className="text-[8px] text-slate-400 font-black uppercase tracking-tighter truncate block">{k}</span>
                    <span className="text-[11px] text-slate-900 font-bold truncate block">{renderValue(v)}</span>
                  </div>
                ))}
                {Object.keys(paper.forecasts || {}).length === 0 && <p className="text-[9px] text-slate-300 italic col-span-4">No specific forecasts extracted.</p>}
              </div>

              <TopicSentimentPanel topicLabels={paper.topic_labels || []} topicSummary={paper.topic_summary} />

              {paper.tags && paper.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {paper.tags.map((tag) => (
                    <span key={tag} className="text-[9px] font-bold text-[var(--foreground)] bg-[var(--surface-muted)] px-2 py-0.5 rounded-full border border-[color:var(--border)]">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Selection indicator */}
            <div 
               onClick={(e) => { e.stopPropagation(); toggleSelect(paper.id); }}
               className={cn(
               "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all hover:scale-125 z-10",
               selected.includes(paper.id) 
                ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/30" 
               : "bg-[var(--surface-muted)]/80 border-[color:var(--border)] text-transparent"
            )}>
               <Check size={12} strokeWidth={4} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-slate-400 font-semibold">
          Showing {papers.length} of {total} papers
        </p>
        {hasMore && (
          <button
            onClick={() => void fetchPapers({ nextOffset: offset + PAGE_SIZE, append: true, query: searchQuery })}
            disabled={loadingMore}
            className="px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] text-slate-600 hover:text-violet-600 hover:border-violet-300 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
            Load More
          </button>
        )}
      </div>
    </div>
  );
}
