'use client';

import React, { useState, useEffect } from 'react';
import { FileText, MessageSquare, ExternalLink, Loader2, Calendar, Building2, Layers, Users, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
import Link from 'next/link';

interface Paper {
  id: number;
  title: string;
  authors: string[];
  publisher: string;
  series_name: string;
  published_date: string;
  abstract: string;
  tags: string[];
  forecasts: Record<string, string>;
  filename: string;
}

const renderValue = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    return Object.entries(v)
      .map(([subK, subV]) => `${subK}: ${subV}`)
      .join(', ');
  }
  return String(v);
};

import PdfThumbnail from './PdfThumbnail';

export default function LibraryView({ onSelectForChat, onOpenViewer }: { 
  onSelectForChat: (ids: number[]) => void,
  onOpenViewer?: (id: number) => void 
}) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);

  const fetchPapers = async () => {
    setLoading(true);
    const res = await fetch('/api/papers?status=approved');
    const data = await res.json();
    setPapers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  const toggleSelect = (id: number) => {
    const newSelected = selected.includes(id) 
      ? selected.filter(s => s !== id) 
      : [...selected, id];
    setSelected(newSelected);
    onSelectForChat(newSelected);
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
            onClick={() => toggleSelect(paper.id)}
            className={`glass group relative p-5 rounded-3xl border transition-all cursor-pointer flex gap-6 items-center overflow-hidden ${
              selected.includes(paper.id) 
                ? 'border-violet-500/30 bg-violet-500/5 ring-1 ring-violet-500/10' 
                : 'border-slate-200/50 hover:border-violet-500/20 hover:bg-white active:scale-[0.99]'
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

              {paper.forecasts && Object.keys(paper.forecasts).length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {Object.entries(paper.forecasts).slice(0, 5).map(([k, v]) => (
                    <div key={k} className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50/50 rounded-xl border border-violet-100/50">
                      <span className="text-[8px] text-violet-400 uppercase font-black tracking-tight">{k}</span>
                      <span className="text-[10px] text-violet-900 font-bold">{renderValue(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selection indicator */}
            <div className={cn(
               "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
               selected.includes(paper.id) 
                ? "bg-violet-600 border-violet-500 text-white scale-110 shadow-lg shadow-violet-500/30" 
                : "bg-white/50 border-white/80 text-transparent border-slate-200"
            )}>
               <Check size={12} strokeWidth={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
