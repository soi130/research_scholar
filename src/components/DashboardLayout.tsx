'use client';

import React, { useState } from 'react';
import { LayoutDashboard, Library, MessageSquareShare, Settings, Search, RefreshCw, Loader2, X, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import ReviewGrid from './ReviewGrid';
import LibraryView from './LibraryView';
import ChatPanel from './ChatPanel';
import GraphView from './GraphView';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function DashboardLayout() {
  type View = 'library' | 'review' | 'chat' | 'search' | 'graph';
  const [view, setView] = useState<View>('library');
  const [isScanning, setIsScanning] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [activeViewerId, setActiveViewerId] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleScan = async () => {
    setIsScanning(true);
    await fetch('/api/papers', { method: 'POST' });
    setIsScanning(false);
  };

  const closeViewer = () => setActiveViewerId(null);

  const navItems = [
    { id: 'library', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'review', label: 'Review Queue', icon: RefreshCw },
    { id: 'graph', label: 'Knowledge Graph', icon: Share2 },
    { id: 'search', label: 'PDF Search', icon: Search },
    { id: 'chat', label: 'AI Multi-Chat', icon: MessageSquareShare },
  ] as const satisfies ReadonlyArray<{ id: View; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;

  return (
    <div className="h-screen bg-[#fdfcff] text-slate-900 font-sans selection:bg-violet-500/20 flex overflow-hidden">
      {/* 1. Collapsible Sidebar */}
      <aside className={cn(
        "glass border-r border-slate-200/50 flex flex-col transition-all duration-300 z-50 flex-shrink-0 relative shadow-sm",
        isCollapsed ? "w-20" : "w-64"
      )}>
        {/* Toggle Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-24 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-lg hover:text-violet-600 transition-colors z-50 text-slate-400"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="h-20 flex items-center px-6 gap-3 flex-shrink-0">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-500/30 text-white flex-shrink-0">
            <Library size={18} />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-black tracking-tight text-slate-900 whitespace-nowrap animate-in fade-in duration-500">
              KKP <span className="text-violet-600">Scholar</span>
            </span>
          )}
        </div>

        <nav className="flex-1 px-3 py-6 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <button 
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative",
                view === item.id 
                  ? 'bg-violet-600/10 text-violet-600 font-bold shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
              )}
              title={isCollapsed ? item.label : ''}
            >
              <item.icon size={20} className={cn(
                view === item.id ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600',
                isScanning && item.id === 'review' ? 'animate-spin' : ''
              )} />
              {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
              {isCollapsed && (
                 <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
                  {item.label}
                 </div>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200/50 mt-auto flex justify-center">
          <button className="p-3 text-slate-400 hover:text-slate-900 transition-all rounded-xl hover:bg-slate-100">
            <Settings size={20} />
          </button>
        </div>
      </aside>

      {/* 2. Main Scrollable Area */}
      <div className={cn("flex-1 flex flex-col min-w-0 transition-all duration-300 relative bg-[#fdfcff]", activeViewerId ? "max-w-[40%]" : "max-w-full")}>
        <header className="h-20 flex items-center justify-between px-10 glass border-b border-slate-200/50 flex-shrink-0 sticky top-0 z-40">
          <div className="relative group w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search papers, authors, tags, or topics..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/50 border border-slate-200/50 rounded-2xl py-2.5 pl-12 pr-4 outline-none focus:border-violet-500/30 focus:bg-white transition-all placeholder:text-slate-400 text-sm shadow-inner"
            />
          </div>

          <div className="flex gap-4 items-center">
            <button 
              onClick={handleScan}
              disabled={isScanning}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-violet-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isScanning ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              Sync Assets
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar scroll-smooth">
          <div className="mb-12">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-4">
              {view === 'review'
                ? 'Awaiting Human Review'
                : view === 'library'
                  ? 'Research Dashboard'
                  : view === 'graph'
                    ? 'Knowledge Graph'
                    : view === 'search'
                      ? 'Document Exploration'
                      : 'Financial Insights Multi-Chat'}
            </h1>
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
              <span className="w-8 h-px bg-slate-200"></span>
              {view === 'review'
                ? 'Verify and approve AI-generated research metadata.'
                : view === 'library'
                  ? 'Explore your institutional research collection.'
                  : view === 'graph'
                    ? 'Trace relationships between papers, authors, tags, publishers, and shared themes.'
                    : view === 'search'
                      ? 'Deep-dive search through every document page.'
                      : 'Synthesize complex views across multiple houses.'}
            </div>
          </div>

          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-700">
            {(view === 'library' || view === 'review') && (
              <div className="flex flex-col gap-8">
                {view === 'review' ? (
                  <ReviewGrid onOpenViewer={(id) => setActiveViewerId(id)} searchQuery={searchQuery} />
                ) : (
                  <LibraryView 
                    onSelectForChat={(ids) => { setSelectedPaperIds(ids); if(ids.length > 0) setView('chat'); }} 
                    onOpenViewer={(id) => setActiveViewerId(id)}
                    searchQuery={searchQuery}
                  />
                )}
              </div>
            )}
            {view === 'graph' && (
              <GraphView
                onOpenViewer={(id) => setActiveViewerId(id)}
                searchQuery={searchQuery}
              />
            )}
            {view === 'chat' && (
              <ChatPanel 
                selectedPaperIds={selectedPaperIds} 
                onOpenViewer={(id) => setActiveViewerId(id)} 
                onClearSelection={() => setSelectedPaperIds([])}
                onOpenLibrary={() => setView('library')}
              />
            )}
            {view === 'search' && (
              <div className="space-y-8 h-full">
                {searchQuery.trim() ? (
                  <LibraryView onSelectForChat={setSelectedPaperIds} onOpenViewer={setActiveViewerId} searchQuery={searchQuery} />
                ) : (
                  <div className="glass p-20 rounded-3xl text-center border-dashed border-2 border-slate-200 text-slate-400">
                    <Search size={48} className="mx-auto text-slate-200 mb-6" />
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Deep Content Search</h3>
                    <p className="max-w-sm mx-auto text-sm">Use the search bar above to explore paper titles, authors, tags, and abstracts across your entire library.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Split-Pane PDF Viewer */}
      {activeViewerId && (
        <div className="w-[60%] border-l border-slate-200/50 flex flex-col bg-slate-50 relative animate-in slide-in-from-right duration-500 shadow-[-20px_0_50px_rgba(0,0,0,0.05)] z-50">
           <div className="h-20 flex items-center justify-between px-6 bg-white border-b border-slate-200/50 flex-shrink-0">
             <div className="flex items-center gap-2">
               <div className="p-2 bg-violet-100 text-violet-600 rounded-lg"><Library size={16} /></div>
               <span className="text-sm font-bold text-slate-900">Document Reader</span>
             </div>
             <button 
              onClick={closeViewer}
              className="p-2.5 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all border border-slate-200/50"
             >
               <X size={20} />
             </button>
           </div>
          <iframe
            src={`/api/papers/${activeViewerId}/serve`}
            className="w-full h-full border-0"
            title="PDF Viewer"
          />
        </div>
      )}

      <style jsx global>{`
        .glass {
          background-color: var(--glass-bg);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.1);
          border-radius: 10px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(99, 102, 241, 0.2);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
