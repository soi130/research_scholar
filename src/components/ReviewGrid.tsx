'use client';

import React, { useState, useEffect } from 'react';
import { Check, Edit3, Save, X, Loader2, Sparkles, Plus, Tag as TagIcon, Eye, Building2, Calendar, ExternalLink, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  forecasts: Record<string, any>;
  status: string;
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

export default function ReviewGrid({ onOpenViewer }: { onOpenViewer?: (id: number) => void }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Paper>>({});
  const [masterTags, setMasterTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const fetchPending = async () => {
    setLoading(true);
    const res = await fetch('/api/papers?status=pending');
    const data = await res.json();
    setPapers(data);
    setLoading(false);
  };

  const fetchTags = async () => {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setMasterTags(data);
  };

  useEffect(() => {
    fetchPending();
    fetchTags();
  }, []);

  const handleApprove = async (id: number) => {
    await fetch(`/api/papers/${id}`, { method: 'POST' });
    fetchPending();
  };

  const handleSave = async (id: number) => {
    await fetch(`/api/papers/${id}`, { 
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues)
    });
    setEditingId(null);
    fetchPending();
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

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-violet-500 w-10 h-10" /></div>;

  if (papers.length === 0) return (
    <div className="text-slate-400 text-center p-20 glass rounded-[2.5rem] border-dashed border-2 border-slate-200">
       <Sparkles size={48} className="mx-auto text-violet-200 mb-6" />
       <h3 className="text-xl font-bold text-slate-900 mb-2">Queue is Empty</h3>
       <p className="max-w-xs mx-auto text-sm">All discovered papers have been verified. New PDFs will appear here automatically.</p>
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Global Tag Manager (Light Mode refined) */}
      <div className="glass p-6 rounded-3xl border border-slate-200/50 flex gap-4 items-center shadow-lg shadow-slate-200/20">
        <span className="text-sm text-slate-500 font-bold flex items-center gap-2 uppercase tracking-tight"><TagIcon size={16} className="text-violet-500" /> Global Tags:</span>
        <div className="flex-1 flex gap-2">
           <input 
            type="text" 
            placeholder="Create new institutional tag..." 
            className="flex-1 bg-slate-100/50 border border-slate-200/50 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500 focus:bg-white transition-all shadow-inner"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
          />
          <button 
            onClick={handleAddMasterTag}
            className="px-6 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2 text-sm font-bold"
          >
            <Plus size={18} /> Add Tag
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {papers.map((paper) => (
          <div key={paper.id} className="glass group relative p-6 rounded-[2.5rem] border border-slate-200/50 hover:border-violet-500/30 hover:bg-white transition-all duration-500 shadow-sm hover:shadow-2xl hover:shadow-violet-500/5 flex gap-8 items-center overflow-hidden">
            
            {/* 1st Page Preview (List Mode) */}
            <div className="relative w-48 aspect-[3/4] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200/50 group-hover:border-violet-500/20 transition-all cursor-pointer shadow-inner flex-shrink-0" onClick={() => onOpenViewer?.(paper.id)}>
               <PdfThumbnail paperId={paper.id} className="w-full h-full" />
               <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                  <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg text-slate-900 text-[10px] font-black shadow-xl">
                    EXPAND
                  </div>
               </div>
            </div>

            <div className="flex-1 min-w-0 space-y-4">
               <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    {editingId === paper.id ? (
                      <textarea 
                        className="bg-slate-50 border border-violet-500/30 rounded-xl p-3 w-full h-24 text-slate-900 text-lg font-black focus:bg-white outline-none transition-all"
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
                      <button onClick={() => { setEditingId(paper.id); setEditValues(paper); }} className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-violet-50 hover:text-violet-600 transition-all"><Edit3 size={18} /></button>
                    ) }
                  </div>
               </div>

               <div className="flex flex-wrap gap-4 text-[10px] items-center">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/50 rounded-xl border border-slate-200/30">
                    <span className="text-slate-400 font-black uppercase tracking-widest"><Building2 size={10} className="inline mr-1" /> HOUSE:</span>
                    <span className="font-bold text-slate-900">{paper.publisher || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/50 rounded-xl border border-slate-200/30">
                    <span className="text-slate-400 font-black uppercase tracking-widest"><Calendar size={10} className="inline mr-1" /> DATE:</span>
                    <span className="font-bold text-slate-900">{paper.published_date || 'N/A'}</span>
                  </div>
                  <div className="flex-1 overflow-x-auto no-scrollbar flex gap-2">
                    {(paper.tags || []).map(tag => (
                      <span key={tag} className="px-2 py-1 bg-violet-50 text-violet-600 rounded-lg font-black tracking-wide border border-violet-100">
                        {tag.toUpperCase()}
                      </span>
                    ))}
                  </div>
               </div>

               <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/30">
                  {Object.entries(paper.forecasts || {}).slice(0, 4).map(([k, v]) => (
                    <div key={k} className="space-y-0.5 min-w-0">
                      <span className="text-[8px] text-slate-400 font-black uppercase tracking-tighter truncate block">{k}</span>
                      <span className="text-[11px] text-slate-900 font-bold truncate block">{renderValue(v)}</span>
                    </div>
                  ))}
                  {Object.keys(paper.forecasts || {}).length === 0 && <p className="text-[9px] text-slate-300 italic col-span-4">No specific forecasts extracted.</p>}
               </div>
            </div>

            <div className="flex flex-col gap-2 w-48 pl-8 border-l border-slate-100">
               {editingId !== paper.id && (
                  <>
                    <button 
                      onClick={() => handleApprove(paper.id)} 
                      className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] hover:bg-violet-600 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                    >
                      <Check size={14} /> APPROVE
                    </button>
                    <button 
                      onClick={() => onOpenViewer?.(paper.id)}
                      className="w-full py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] hover:bg-slate-200 hover:text-slate-900 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                    >
                      <Eye size={14} /> VIEW PDF
                    </button>
                  </>
               )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
