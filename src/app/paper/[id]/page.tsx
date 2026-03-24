'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Building2, Layers, Users } from 'lucide-react';
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
}

export default function PaperViewerPage() {
  const params = useParams();
  const id = params?.id as string;
  const [paper, setPaper] = useState<Paper | null>(null);

  useEffect(() => {
    if (id) {
      fetch(`/api/papers/${id}`)
        .then(r => r.json())
        .then(setPaper);
    }
  }, [id]);

  return (
    <div className="flex h-screen bg-[#fdfcff] text-slate-900 overflow-hidden font-sans selection:bg-violet-500/20">
      {/* Sidebar (Light Mode refined) */}
      <aside className="w-80 flex-shrink-0 border-r border-slate-200/50 flex flex-col p-8 gap-8 overflow-y-auto bg-white/50 backdrop-blur-xl relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-violet-600/5 blur-[100px] pointer-events-none" />
        
        <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-violet-600 transition-all text-xs font-black uppercase tracking-widest group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </Link>

        {paper ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
            <div className="space-y-4">
               <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/10">
                  <Building2 size={20} />
               </div>
               <h1 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">{paper.title}</h1>
            </div>
            
            <div className="space-y-4 text-xs font-bold text-slate-500">
              <div className="flex items-start gap-3">
                <Users size={16} className="text-violet-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-600">{(paper.authors || []).join(', ') || 'Unknown Authors'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building2 size={16} className="text-violet-400 flex-shrink-0" />
                <span className="bg-violet-50 px-2 py-0.5 rounded border border-violet-100 text-violet-700">{paper.publisher || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Calendar size={16} className="text-violet-400 flex-shrink-0" />
                <span>Published: {paper.published_date || 'N/A'}</span>
              </div>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Summary Overview</p>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-6">{paper.abstract}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(paper.tags || []).map(tag => (
                <span key={tag} className="text-[10px] font-black uppercase tracking-wide text-violet-600 bg-violet-100/50 border border-violet-200/50 px-3 py-1 rounded-lg">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-slate-300 text-sm animate-pulse flex flex-col gap-4 mt-20 items-center">
             <div className="w-12 h-12 bg-slate-100 rounded-2xl" />
             <span className="font-black tracking-widest uppercase text-[10px]">Retrieving Metadata...</span>
          </div>
        )}
      </aside>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden relative bg-slate-50">
        <iframe
          src={`/api/papers/${id}/serve`}
          className="w-full h-full border-0 relative z-10"
          title="PDF Viewer"
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-violet-500 animate-spin" />
        </div>
      </div>
    </div>
  );
}
