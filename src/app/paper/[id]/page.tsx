'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Building2, Layers, PanelLeftOpen, PanelRightClose, PanelRightOpen, Users, Layers3 } from 'lucide-react';
import Link from 'next/link';
import PaperNeighborhoodGraph from '@/components/PaperNeighborhoodGraph';
import PdfPageThumbnails from '@/components/PdfPageThumbnails';
import GeneratedLocallyBadge from '@/components/GeneratedLocallyBadge';

interface Paper {
  id: number;
  title: string;
  authors: string[];
  publisher: string;
  series_name: string;
  published_date: string;
  abstract: string;
  tags: string[];
  generated_locally?: boolean;
}

export default function PaperViewerPage() {
  const params = useParams();
  const id = params?.id as string;
  const [paper, setPaper] = useState<Paper | null>(null);
  const [sidebarSide, setSidebarSide] = useState<'left' | 'right'>(() => {
    if (typeof window === 'undefined') return 'right';
    const storedSide = window.localStorage.getItem('paper-sidebar-side');
    return storedSide === 'left' || storedSide === 'right' ? storedSide : 'right';
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const storedOpen = window.localStorage.getItem('paper-sidebar-open');
    return storedOpen === 'false' ? false : true;
  });
  const [thumbnailsOpen, setThumbnailsOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const storedOpen = window.localStorage.getItem('paper-thumbnails-open');
    return storedOpen === 'false' ? false : true;
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    window.localStorage.setItem('paper-sidebar-side', sidebarSide);
  }, [sidebarSide]);

  useEffect(() => {
    window.localStorage.setItem('paper-sidebar-open', String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    window.localStorage.setItem('paper-thumbnails-open', String(thumbnailsOpen));
  }, [thumbnailsOpen]);

  useEffect(() => {
    if (id) {
      fetch(`/api/papers/${id}`)
        .then(r => r.json())
        .then(setPaper);
      const resetPage = window.setTimeout(() => setCurrentPage(1), 0);
      return () => window.clearTimeout(resetPage);
    }
    return undefined;
  }, [id]);

  const sidebar = (
    <aside className={`w-80 flex-shrink-0 ${sidebarSide === 'left' ? 'border-r' : 'border-l'} border-slate-200/50 flex flex-col p-8 gap-8 overflow-y-auto bg-white/50 backdrop-blur-xl relative`}>
      <div className="absolute top-0 left-0 w-full h-32 bg-violet-600/5 blur-[100px] pointer-events-none" />

      <div className="flex items-start justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-violet-600 transition-all text-xs font-black uppercase tracking-widest group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarSide((current) => (current === 'left' ? 'right' : 'left'))}
            className="p-2 rounded-xl border border-slate-200/60 bg-white/80 text-slate-400 hover:text-violet-600 hover:border-violet-300 transition-colors"
            title={`Dock sidebar on the ${sidebarSide === 'left' ? 'right' : 'left'}`}
          >
            {sidebarSide === 'left' ? <PanelRightOpen size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl border border-slate-200/60 bg-white/80 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
            title="Hide sidebar"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {paper ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="space-y-4">
             <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/10">
                <Building2 size={20} />
             </div>
             <h1 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">{paper.title}</h1>
             {paper.generated_locally ? <GeneratedLocallyBadge /> : null}
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
              <Layers size={16} className="text-violet-400 flex-shrink-0" />
              <span>{paper.series_name || 'No series'}</span>
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

          <PaperNeighborhoodGraph paperId={Number(id)} />
        </div>
      ) : (
        <div className="text-slate-300 text-sm animate-pulse flex flex-col gap-4 mt-20 items-center">
           <div className="w-12 h-12 bg-slate-100 rounded-2xl" />
           <span className="font-black tracking-widest uppercase text-[10px]">Retrieving Metadata...</span>
        </div>
      )}
    </aside>
  );

  return (
    <div className="flex h-screen bg-[#fdfcff] text-slate-900 overflow-hidden font-sans selection:bg-violet-500/20">
      {sidebarOpen && sidebarSide === 'left' && sidebar}

      {/* PDF Viewer */}
      <div className="flex-1 flex min-w-0 overflow-hidden relative bg-slate-50">
        <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setThumbnailsOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 shadow-lg backdrop-blur hover:text-violet-600 hover:border-violet-300 transition-colors"
            title={thumbnailsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
          >
            <Layers3 size={14} />
            Thumbnails
          </button>
        </div>

        <div className="flex-1 min-w-0 relative">
          <iframe
            src={`/api/papers/${id}/serve#page=${currentPage}&zoom=page-width&toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full h-full border-0 relative z-10"
            title="PDF Viewer"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-violet-500 animate-spin" />
          </div>
        </div>

        {thumbnailsOpen && (
          <aside className="w-72 flex-shrink-0 border-l border-slate-200 bg-white/80 backdrop-blur-xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-white/80">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">Page Thumbnails</p>
                <p className="text-xs font-semibold text-slate-600">Jump around the PDF</p>
              </div>
              <button
                type="button"
                onClick={() => setThumbnailsOpen(false)}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors"
                title="Hide thumbnails"
              >
                <PanelRightClose size={16} />
              </button>
            </div>
            <PdfPageThumbnails paperId={Number(id)} activePage={currentPage} onSelectPage={setCurrentPage} />
          </aside>
        )}
      </div>

      {sidebarOpen && sidebarSide === 'right' && sidebar}

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute right-4 top-4 z-50 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 shadow-lg backdrop-blur"
        >
          <PanelLeftOpen size={14} />
          Show sidebar
        </button>
      )}
    </div>
  );
}
