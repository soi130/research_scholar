'use client';

import React, { useState, useEffect, useEffectEvent } from 'react';
import { Check, Edit3, Save, X, Loader2, Sparkles, Plus, Tag as TagIcon, Building2, Calendar, FolderKanban } from 'lucide-react';
import { MULTI_SELECT_SEARCH_FIELDS, type AdvancedSearchFilters } from '@/lib/search';
import type { TopicLabel, TopicSummary } from '@/lib/topic-sentiment';
import TopicSentimentPanel from './TopicSentimentPanel';
import { TOPIC_LABELS } from '@/lib/topic-taxonomy';
import { getForecastIndicatorOptions } from '@/lib/forecast-indicators';

interface Paper {
  id: number;
  filename: string;
  title: string;
  authors: string[];
  publisher: string;
  series_name: string;
  published_date: string;
  abstract: string;
  tags: string[];
  key_findings: string[];
  forecasts: Record<string, unknown>;
  topic_labels: TopicLabel[];
  topic_summary: TopicSummary;
  status: string;
  updated_at: string;
}

type ForecastEditEntry = {
  value: string;
  unit: string;
  forecast_period: string;
};

type ScanState = {
  status: 'idle' | 'running' | 'completed' | 'failed';
  message: string | null;
  stats: { total: number; processed: number; succeeded: number; failed: number };
};

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([subK, subV]) => `${subK}: ${subV}`)
      .join(', ');
  }
  return String(v);
};

function getForecastEditEntry(rawValue: unknown): ForecastEditEntry {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    const record = rawValue as Record<string, unknown>;
    return {
      value: String(record.value ?? '').trim(),
      unit: String(record.unit ?? '').trim(),
      forecast_period: String(record.forecast_period ?? '').trim(),
    };
  }

  return {
    value: String(rawValue ?? '').trim(),
    unit: '',
    forecast_period: '',
  };
}

const FORECAST_FIELDS = getForecastIndicatorOptions().map((indicator) => indicator.label);

function TopicSlider({
  label,
  min,
  max,
  value,
  valueLabel,
  accentClassName = 'accent-violet-600',
  valueClassName = 'text-slate-700',
  centeredPreview = false,
  previewFillClassName = 'bg-violet-500',
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  valueLabel: string;
  accentClassName?: string;
  valueClassName?: string;
  centeredPreview?: boolean;
  previewFillClassName?: string;
  onChange: (value: number) => void;
}) {
  const clampedValue = Math.max(min, Math.min(max, value));
  const previewWidthPercent = max === 0 ? 0 : (Math.abs(clampedValue) / max) * 50;

  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
        <span className={`text-[10px] font-black ${valueClassName}`}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-3 ${accentClassName}`}
      />
      {centeredPreview ? (
        <div className="relative h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-400/70" />
          {clampedValue !== 0 ? (
            <div
              className={`absolute inset-y-0 rounded-full ${previewFillClassName}`}
              style={
                clampedValue < 0
                  ? { right: '50%', width: `${previewWidthPercent}%` }
                  : { left: '50%', width: `${previewWidthPercent}%` }
              }
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
        <span>{min > 0 ? `+${min}` : min}</span>
        <span>{max > 0 ? `+${max}` : max}</span>
      </div>
    </label>
  );
}

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

export default function ReviewGrid({
  onOpenViewer,
  searchQuery = '',
  searchFilters,
  onSyncAssets,
  isScanning = false,
  scanState = null,
  scanMessage = '',
}: {
  onOpenViewer?: (id: number, cacheKey?: string) => void;
  searchQuery?: string;
  searchFilters: AdvancedSearchFilters;
  onSyncAssets?: () => void;
  isScanning?: boolean;
  scanState?: ScanState | null;
  scanMessage?: string;
}) {
  const PAGE_SIZE = 30;
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Paper>>({});
  const [masterTags, setMasterTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [tagInputValue, setTagInputValue] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [actionMessage, setActionMessage] = useState('');

  const fetchPending = async ({ nextOffset, append, query }: { nextOffset: number; append: boolean; query: string }) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    const params = new URLSearchParams({
      status: 'pending',
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

  const fetchTags = async () => {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setMasterTags(data);
  };

  const refreshPending = useEffectEvent((query: string) => {
    void fetchPending({ nextOffset: 0, append: false, query });
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      refreshPending(searchQuery);
    }, 250);
    void (async () => {
      await fetchTags();
    })();
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchFilters]);

  const handleApprove = async (id: number) => {
    const target = papers.find((paper) => paper.id === id);
    const res = await fetch(`/api/papers/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedUpdatedAt: target?.updated_at || null })
    });
    if (res.status === 409) {
      setActionMessage('That paper changed in another session. The queue has been refreshed.');
    } else if (!res.ok) {
      setActionMessage('Approval failed. Please try again.');
    } else {
      setActionMessage('Paper approved.');
    }
    void fetchPending({ nextOffset: 0, append: false, query: searchQuery });
  };

  const handleSave = async (id: number) => {
    const target = papers.find((paper) => paper.id === id);
    const res = await fetch(`/api/papers/${id}`, { 
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editValues,
        expectedUpdatedAt: target?.updated_at || null,
      })
    });
    if (res.status === 409) {
      setActionMessage('Another reviewer updated this paper first. Your edits were not applied.');
      setEditingId(null);
      void fetchPending({ nextOffset: 0, append: false, query: searchQuery });
      return;
    }
    if (!res.ok) {
      setActionMessage('Save failed. Please try again.');
      return;
    }
    setActionMessage('Paper saved.');
    setEditingId(null);
    void fetchPending({ nextOffset: 0, append: false, query: searchQuery });
  };

  const updateForecastValue = (label: string, field: keyof ForecastEditEntry, value: string) => {
    const currentForecasts = { ...(editValues.forecasts || {}) } as Record<string, unknown>;
    const currentEntry = getForecastEditEntry(currentForecasts[label]);
    const nextEntry = {
      ...currentEntry,
      [field]: value.trim(),
    };

    if (nextEntry.value) currentForecasts[label] = nextEntry;
    else delete currentForecasts[label];

    setEditValues({
      ...editValues,
      forecasts: currentForecasts,
    });
  };

  const updateTopicLabel = (topic: string, patch: Partial<TopicLabel>) => {
    const currentLabels = editValues.topic_labels || [];
    const nextLabels = currentLabels.map((label) =>
      label.topic === topic ? { ...label, ...patch } : label
    );
    setEditValues({
      ...editValues,
      topic_labels: nextLabels,
    });
  };

  const handleAddMasterTag = async () => {
    if (!newTag) return;
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTag })
    });
    setNewTag('');
    fetchTags();
  };

  const toggleTag = (paperId: number, tag: string) => {
    const currentTags = editValues.tags || [];
    const newTags = currentTags.includes(tag) 
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    setEditValues({ ...editValues, tags: newTags });
  };

  const handleApproveAll = async () => {
    if (!window.confirm(`Are you sure you want to approve all ${papers.length} currently loaded papers in the queue?`)) return;
    setLoading(true);
    const res = await fetch('/api/papers/bulk-approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: papers.map((paper) => ({
          id: paper.id,
          expectedUpdatedAt: paper.updated_at,
        })),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setActionMessage('Bulk approval failed. Please try again.');
    } else {
      const approved = Array.isArray(data?.approvedIds) ? data.approvedIds.length : 0;
      const conflicts = Array.isArray(data?.conflicts) ? data.conflicts.length : 0;
      setActionMessage(
        conflicts > 0
          ? `Approved ${approved} papers. Skipped ${conflicts} changed or already-approved items.`
          : `Approved ${approved} papers.`
      );
    }
    void fetchPending({ nextOffset: 0, append: false, query: searchQuery });
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;

  return (
    <div className="space-y-10">
      {actionMessage ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
          {actionMessage}
        </div>
      ) : null}
      {(scanMessage || scanState?.status === 'running' || scanState?.status === 'failed') ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
          scanState?.status === 'failed'
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          {scanState?.status === 'running'
            ? `${scanState.message || 'Scan in progress'}${scanState.stats.total ? ` (${scanState.stats.processed}/${scanState.stats.total})` : ''}`
            : scanMessage || scanState?.message}
        </div>
      ) : null}
      <div className="flex justify-between items-center gap-6">
        {/* Global Tag Manager (Light Mode refined) */}
        <div className="glass p-6 rounded-3xl border border-slate-200/50 flex-1 flex gap-4 items-center shadow-lg shadow-slate-200/20">
          <span className="text-sm text-slate-500 font-bold flex items-center gap-2 uppercase tracking-tight"><TagIcon size={16} className="text-violet-500" /> Global Tags:</span>
          <div className="flex-1 flex gap-2 relative z-50">
             <input 
              type="text" 
              placeholder="Create new institutional tag..." 
              className="flex-1 bg-[var(--surface-muted)] border border-slate-200/50 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500 focus:bg-[var(--surface-strong)] transition-all shadow-inner"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if(e.key === 'Enter') handleAddMasterTag(); }}
            />
            {newTag.trim() && masterTags.some(t => t.toLowerCase().includes(newTag.toLowerCase()) && t.toLowerCase() !== newTag.toLowerCase()) && (
              <div className="absolute top-[120%] left-0 w-[calc(100%-8rem)] bg-[var(--surface-strong)] border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto overflow-hidden">
                {masterTags.filter(t => t.toLowerCase().includes(newTag.toLowerCase()) && t.toLowerCase() !== newTag.toLowerCase()).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setNewTag('')}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 font-bold border-b border-slate-100 last:border-0"
                  >
                    {tag.toUpperCase()} <span className="text-slate-400 text-xs ml-2 font-normal">(Already in pool)</span>
                  </button>
                ))}
              </div>
            )}
            <button 
              onClick={handleAddMasterTag}
              className="px-6 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2 text-sm font-bold"
            >
              <Plus size={18} /> Add Tag
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="glass p-6 rounded-3xl border border-slate-200/50 flex items-center shadow-lg shadow-slate-200/20 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={onSyncAssets}
                disabled={isScanning}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-xl transition-all shadow-lg shadow-violet-600/20 flex items-center gap-2 text-sm font-black tracking-widest uppercase disabled:opacity-50"
              >
                {isScanning ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                Sync Assets
              </button>
              {papers.length > 0 ? (
                <button 
                  onClick={handleApproveAll}
                  className="px-8 py-2.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-xl transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 text-sm font-black tracking-widest uppercase"
                >
                  <Check size={18} strokeWidth={3} /> Approve All
                </button>
              ) : null}
            </div>
          </div>
      </div>

      <div className="flex flex-col gap-8">
        {papers.length === 0 ? (
          <div className="text-slate-400 text-center p-20 glass rounded-[2.5rem] border-dashed border-2 border-slate-200">
            <Sparkles size={48} className="mx-auto text-violet-200 mb-6" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">Queue is Empty</h3>
            <p className="max-w-xs mx-auto text-sm">All discovered papers have been verified. New PDFs will appear here automatically.</p>
          </div>
        ) : papers.map((paper) => (
          <div key={paper.id} className="glass group relative p-6 rounded-[2.5rem] border border-slate-200/50 hover:border-violet-500/30 hover:bg-[var(--surface-strong)] transition-all duration-500 shadow-sm hover:shadow-2xl hover:shadow-violet-500/5 overflow-hidden space-y-6">
            <div className="flex gap-8 items-start">
              <div className="w-72 flex-shrink-0">
                {/* 1st Page Preview (List Mode) */}
                <div className="relative w-full aspect-[3/4] bg-[var(--surface-soft)] rounded-2xl overflow-hidden border border-slate-200/50 group-hover:border-violet-500/20 transition-all cursor-pointer shadow-inner" onClick={() => onOpenViewer?.(paper.id, paper.updated_at)}>
                   <PdfThumbnail paperId={paper.id} cacheKey={paper.updated_at} className="w-full h-full" />
                   <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                      <div className="bg-[#ffffff] text-black backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-black shadow-xl">
                        EXPAND
                      </div>
                   </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-4">
               <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    {editingId === paper.id ? (
                      <textarea 
                        className="bg-[var(--surface-soft)] border border-violet-500/30 rounded-xl p-3 w-full h-24 text-slate-900 text-lg font-black focus:bg-[var(--surface-strong)] outline-none transition-all"
                        value={editValues.title || paper.title} 
                        onChange={e => setEditValues({...editValues, title: e.target.value})}
                      />
                    ) : (
                      <h3 className="text-xl font-black text-slate-900 leading-tight tracking-tight group-hover:text-violet-600 transition-colors truncate">
                        {paper.title}
                      </h3>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingId === paper.id ? (
                      <>
                        <button onClick={() => handleSave(paper.id)} className="p-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 active:scale-95 transition-all"><Save size={18} /></button>
                        <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all"><X size={18} /></button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(paper.id)}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] hover:bg-violet-600 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                        >
                          <Check size={14} /> APPROVE
                        </button>
                        <button onClick={() => { setEditingId(paper.id); setEditValues(paper); setTagInputValue(''); }} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-violet-50 hover:text-violet-600 transition-all"><Edit3 size={18} /></button>
                      </>
                    ) }
                  </div>
               </div>

               <div className="flex flex-wrap gap-4 text-[10px] items-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-muted)] rounded-xl border border-slate-200/30">
                    <span className="text-slate-400 font-black uppercase tracking-widest"><Building2 size={10} className="inline mr-1" /> HOUSE:</span>
                    {editingId === paper.id ? (
                      <input 
                        className="bg-[var(--surface-strong)] border border-violet-500/30 rounded px-2 py-0.5 text-slate-900 font-bold outline-none"
                        value={editValues.publisher || ''}
                        onChange={e => setEditValues({...editValues, publisher: e.target.value})}
                      />
                    ) : (
                      <span className="font-bold text-slate-900">{paper.publisher || 'N/A'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-muted)] rounded-xl border border-slate-200/30">
                    <span className="text-slate-400 font-black uppercase tracking-widest"><Calendar size={10} className="inline mr-1" /> DATE:</span>
                    {editingId === paper.id ? (
                      <input 
                        className="bg-[var(--surface-strong)] border border-violet-500/30 rounded px-2 py-0.5 text-slate-900 font-bold outline-none w-24"
                        value={editValues.published_date || ''}
                        onChange={e => setEditValues({...editValues, published_date: e.target.value})}
                      />
                    ) : (
                      <span className="font-bold text-slate-900">{paper.published_date || 'N/A'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-muted)] rounded-xl border border-slate-200/30">
                    <span className="text-slate-400 font-black uppercase tracking-widest"><FolderKanban size={10} className="inline mr-1" /> SERIES:</span>
                    {editingId === paper.id ? (
                      <input
                        className="bg-[var(--surface-strong)] border border-violet-500/30 rounded px-2 py-0.5 text-slate-900 font-bold outline-none"
                        value={editValues.series_name || ''}
                        onChange={e => setEditValues({ ...editValues, series_name: e.target.value })}
                      />
                    ) : (
                      <span className="font-bold text-slate-900">{paper.series_name || 'N/A'}</span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {editingId === paper.id ? (
                      <div className="flex flex-wrap gap-2 items-center w-full">
                        {Array.from(new Set([...masterTags, ...(paper.tags || []), ...(editValues.tags || [])])).map(tag => (
                         <button
                           key={tag}
                           onClick={(e) => { e.stopPropagation(); toggleTag(paper.id, tag); }}
                           className={`px-2 py-1 rounded-lg font-black tracking-wide border transition-colors ${
                             (editValues.tags || []).includes(tag)
                               ? 'bg-violet-600 text-white border-violet-600'
                               : 'bg-[var(--surface-muted)] text-[var(--foreground)] border-[color:var(--border)] hover:border-violet-300'
                           }`}
                         >
                           {tag.toUpperCase()}
                         </button>
                        ))}
                        <div className="relative z-50">
                          <input
                            type="text"
                            placeholder="+ New Tag"
                            className="bg-[var(--surface-strong)] border border-dashed border-violet-300 rounded-lg px-2 py-1 text-[10px] font-black tracking-wide text-violet-600 outline-none w-32 placeholder:text-violet-300 focus:border-violet-500 focus:bg-[var(--surface-soft)]"
                            value={tagInputValue}
                            onChange={(e) => setTagInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && tagInputValue.trim()) {
                                e.preventDefault();
                                const newT = tagInputValue.trim().toLowerCase();
                                if (!(editValues.tags || []).includes(newT)) {
                                  setEditValues(prev => ({...prev, tags: [...(prev.tags || []), newT]}));
                                }
                                setTagInputValue('');
                              }
                            }}
                          />
                          {tagInputValue.trim() && masterTags.some(t => t.toLowerCase().includes(tagInputValue.toLowerCase()) && !(editValues.tags || []).includes(t.toLowerCase())) && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-[var(--surface-strong)] border border-[color:var(--border)] rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                              {masterTags
                                .filter(t => t.toLowerCase().includes(tagInputValue.toLowerCase()) && !(editValues.tags || []).includes(t.toLowerCase()))
                                .map(tag => (
                                <button
                                  key={tag}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEditValues(prev => ({...prev, tags: [...(prev.tags || []), tag]}));
                                    setTagInputValue('');
                                  }}
                                  className="w-full text-left px-3 py-2 text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-muted)] hover:text-violet-700 font-black tracking-wide border-b border-[color:var(--border)] last:border-0 uppercase"
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-x-auto no-scrollbar flex gap-2">
                        {(paper.tags || []).map(tag => (
                          <span key={tag} className="px-2 py-1 bg-[var(--surface-muted)] text-[var(--foreground)] rounded-lg font-black tracking-wide border border-[color:var(--border)]">
                            {tag.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.9fr] gap-4">
                  <div className="space-y-4">
                    <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-2">
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600">Summary</p>
                      {editingId === paper.id ? (
                        <textarea
                          className="w-full min-h-28 bg-[var(--surface-strong)] border border-violet-500/30 rounded-xl p-3 text-sm text-slate-900 outline-none"
                          value={editValues.abstract || ''}
                          onChange={(e) => setEditValues({ ...editValues, abstract: e.target.value })}
                        />
                      ) : (
                        <p className="text-sm leading-6 text-slate-700">
                          {paper.abstract || 'No summary extracted yet.'}
                        </p>
                      )}
                    </div>

                  <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-2">
                    <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600">3 KTAs</p>
                    {editingId === paper.id ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <textarea
                              key={index}
                              className="w-full min-h-16 bg-[var(--surface-strong)] border border-violet-500/30 rounded-xl p-3 text-sm text-slate-900 outline-none"
                              value={(editValues.key_findings || ['', '', ''])[index] || ''}
                              onChange={(e) => {
                                const next = [...(editValues.key_findings || ['', '', ''])];
                                next[index] = e.target.value;
                                setEditValues({ ...editValues, key_findings: next.slice(0, 3) });
                              }}
                            />
                          ))}
                        </div>
                      ) : paper.key_findings.length > 0 ? (
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
                        <p className="text-sm text-slate-400">No key takeaways extracted yet.</p>
                      )}
                    </div>

                    <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-2">
                      <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600 mb-2">Forecast Numbers</p>
                      {editingId === paper.id ? (
                        <div className="grid grid-cols-1 gap-3">
                          {FORECAST_FIELDS.map((label) => {
                            const entry = getForecastEditEntry(editValues.forecasts?.[label]);
                            return (
                              <div key={label} className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] p-3 space-y-2">
                                <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight block">{label}</span>
                                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_120px_140px] gap-2">
                                  <input
                                    className="w-full bg-[var(--surface-soft)] border border-violet-500/30 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none"
                                    value={entry.value}
                                    onChange={(e) => updateForecastValue(label, 'value', e.target.value)}
                                    placeholder="Forecast value"
                                  />
                                  <input
                                    className="w-full bg-[var(--surface-soft)] border border-violet-500/30 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none"
                                    value={entry.unit}
                                    onChange={(e) => updateForecastValue(label, 'unit', e.target.value)}
                                    placeholder="Unit"
                                  />
                                  <input
                                    className="w-full bg-[var(--surface-soft)] border border-violet-500/30 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none"
                                    value={entry.forecast_period}
                                    onChange={(e) => updateForecastValue(label, 'forecast_period', e.target.value)}
                                    placeholder="Period"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(paper.forecasts || {}).slice(0, 4).map(([k, v]) => (
                            <div key={k} className="space-y-0.5 min-w-0">
                              <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight truncate block">{k}</span>
                              <span className="text-[11px] text-slate-900 font-bold truncate block">{renderValue(v)}</span>
                            </div>
                          ))}
                          {Object.keys(paper.forecasts || {}).length === 0 && <p className="text-[9px] text-slate-300 italic col-span-2">No specific forecasts extracted.</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {editingId === paper.id ? (
                      <div className="p-4 bg-[var(--surface-soft)] rounded-2xl border border-[color:var(--border)] space-y-3">
                        <p className="text-sm font-black uppercase tracking-[0.16em] text-violet-600">Topic Sentiment</p>
                        {(editValues.topic_labels || []).length > 0 ? (
                          <div className="grid grid-cols-1 gap-3">
                            {(editValues.topic_labels || []).map((label) => (
                              <div key={label.topic} className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] p-3 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-xs font-black text-slate-900">{TOPIC_LABELS[label.topic]}</span>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.14em]">{label.topic}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <TopicSlider
                                    label="Relevance"
                                    min={0}
                                    max={3}
                                    value={label.relevance}
                                    valueLabel={`${label.relevance}/3`}
                                    onChange={(value) => updateTopicLabel(label.topic, { relevance: value })}
                                  />
                                  <TopicSlider
                                    label="Direction"
                                    min={-2}
                                    max={2}
                                    value={label.direction}
                                    valueLabel={label.direction > 0 ? `+${label.direction}` : String(label.direction)}
                                    accentClassName="accent-slate-500"
                                    valueClassName={
                                      label.direction < 0
                                        ? 'text-red-600'
                                        : label.direction > 0
                                          ? 'text-emerald-600'
                                          : 'text-amber-600'
                                    }
                                    centeredPreview
                                    previewFillClassName={
                                      label.direction < 0
                                        ? 'bg-red-500'
                                        : label.direction > 0
                                          ? 'bg-emerald-500'
                                          : 'bg-amber-400'
                                    }
                                    onChange={(value) => updateTopicLabel(label.topic, { direction: value })}
                                  />
                                  <TopicSlider
                                    label="Confidence"
                                    min={0}
                                    max={3}
                                    value={label.confidence}
                                    valueLabel={`${label.confidence}/3`}
                                    onChange={(value) => updateTopicLabel(label.topic, { confidence: value })}
                                  />
                                </div>
                                <label className="block space-y-1">
                                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Evidence</span>
                                  <textarea
                                    className="w-full min-h-20 rounded-xl border border-violet-500/30 bg-[var(--surface-soft)] p-3 text-xs leading-5 text-slate-900 outline-none"
                                    value={label.evidence}
                                    onChange={(e) => updateTopicLabel(label.topic, { evidence: e.target.value })}
                                  />
                                </label>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400">No structured topic sentiment extracted yet.</p>
                        )}
                      </div>
                    ) : (paper.topic_labels || []).some((label) => label.relevance > 0) ? (
                      <TopicSentimentPanel topicLabels={paper.topic_labels || []} topicSummary={paper.topic_summary} />
                    ) : null}
                  </div>
               </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-semibold">
          Showing {papers.length} of {total} pending papers
        </p>
        {hasMore && (
          <button
            onClick={() => void fetchPending({ nextOffset: offset + PAGE_SIZE, append: true, query: searchQuery })}
            disabled={loadingMore}
            className="px-4 py-2 rounded-xl border border-[color:var(--border)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:text-violet-600 hover:border-violet-300 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
            Load More
          </button>
        )}
      </div>
    </div>
  );
}
