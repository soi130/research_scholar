'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Eraser } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PaperRef {
  id: number;
  title: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function ChatPanel({ selectedPaperIds, onOpenViewer, onClearSelection, onOpenLibrary }: { selectedPaperIds: number[], onOpenViewer?: (id: number) => void, onClearSelection?: () => void, onOpenLibrary?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your research assistant. I have access to your entire approved paper library, or you can select specific papers to focus on. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [paperIndex, setPaperIndex] = useState<PaperRef[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    let active = true;

    async function loadPaperIndex() {
      try {
        const res = await fetch('/api/papers?status=approved&limit=500');
        const data = await res.json();
        if (!active) return;
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        setPaperIndex(
          items
            .map((paper: { id?: number; title?: string }) => ({
              id: Number(paper.id),
              title: String(paper.title || '').trim(),
            }))
            .filter((paper: PaperRef) => Number.isFinite(paper.id) && paper.title.length > 0)
        );
      } catch {
        if (active) setPaperIndex([]);
      }
    }

    void loadPaperIndex();

    return () => {
      active = false;
    };
  }, []);

  const linkifyPaperTitles = (content: string) => {
    if (paperIndex.length === 0) return content;

    const preservedLinks: string[] = [];
    let nextContent = content.replace(/\[([^\]]+)\]\((?:paper:\/\/|\/paper\/)(\d+)\)/g, (match) => {
      const token = `__PAPER_LINK_${preservedLinks.length}__`;
      preservedLinks.push(match);
      return token;
    });

    const sortedPapers = [...paperIndex].sort((a, b) => b.title.length - a.title.length);

    for (const paper of sortedPapers) {
      const pattern = new RegExp(`\\b${escapeRegExp(paper.title)}\\b`, 'gi');
      nextContent = nextContent.replace(pattern, (match) => `[${match}](/paper/${paper.id})`);
    }

    preservedLinks.forEach((link, index) => {
      nextContent = nextContent.replace(`__PAPER_LINK_${index}__`, link);
    });

    return nextContent;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const newMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, newMsg],
          paperIds: selectedPaperIds
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, data]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[70vh] bg-[var(--surface-strong)] rounded-[2.5rem] border border-[color:var(--border)] overflow-hidden relative shadow-2xl shadow-slate-200/50">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-violet-500/5 blur-[100px] pointer-events-none" />
      
      {/* Header */}
      <div className="h-14 border-b border-[color:var(--border)] flex items-center px-6 justify-between bg-[var(--surface)] backdrop-blur-md sticky top-0 z-10 flex-shrink-0">
         <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scholar.AI</span>
         </div>
         <button onClick={() => setMessages([{ role: 'assistant', content: "Hello! History cleared. How can I help you navigate the library?" }])} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
           <Eraser size={14} />
         </button>
      </div>

      {/* Context Selection Bar */}
      <div className="bg-[var(--surface-soft)] border-b border-[color:var(--border)]/80 px-6 py-2 flex flex-wrap items-center justify-between gap-4 z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Context:</span>
           {selectedPaperIds.length > 0 ? (
             <span className="text-[10px] font-black text-[var(--foreground)] bg-[var(--accent-soft)] border border-[color:var(--border-strong)] px-2 py-1 rounded-md shadow-sm">
               {selectedPaperIds.length} Paper{selectedPaperIds.length > 1 ? 's' : ''} Selected
             </span>
           ) : (
             <span className="text-[10px] font-black text-[var(--foreground)] bg-[var(--surface-muted)] border border-[color:var(--border)] px-2 py-1 rounded-md shadow-sm">
               Global Library (All Approved Papers)
             </span>
           )}
        </div>
        <div className="flex gap-2">
          {selectedPaperIds.length > 0 && (
            <button 
              onClick={onClearSelection} 
              className="text-[10px] font-black uppercase tracking-wide text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-200"
            >
              Clear Selection
            </button>
          )}
          <button 
            onClick={onOpenLibrary} 
            className="text-[10px] font-black uppercase tracking-wide text-violet-600 hover:bg-violet-50 border border-violet-200 px-2.5 py-1.5 rounded-lg shadow-sm transition-colors bg-white hover:shadow-md"
          >
            Select Papers
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-violet-600 border border-slate-200/50'}`}>
              {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={`max-w-[85%] overflow-x-auto p-4 rounded-3xl text-sm leading-relaxed shadow-sm ${
              m.role === 'user' 
                ? 'bg-violet-600 text-white rounded-tr-none font-medium' 
                : 'bg-[var(--surface-soft)] text-slate-900 rounded-tl-none border border-[color:var(--border)]'
            }`}>
              {m.role === 'user' ? (
                m.content
              ) : (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    ul: (props) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
                    ol: (props) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
                    li: (props) => <li className="" {...props} />,
                    table: (props) => <div className="overflow-x-auto my-4 rounded-xl border border-slate-200"><table className="w-full text-left border-collapse text-xs" {...props} /></div>,
                    th: (props) => <th className="bg-slate-100/50 border-b-2 border-slate-200 p-3 font-bold text-slate-700 whitespace-nowrap" {...props} />,
                    td: (props) => <td className="border-b border-slate-100 p-3 bg-white" {...props} />,
                    p: (props) => <p className="mb-3 last:mb-0" {...props} />,
                    a: ({ href, children, ...props }) => {
                      const paperMatch = href?.match(/^(?:paper:\/\/|\/paper\/)(\d+)$/);
                      if (paperMatch) {
                        const id = parseInt(paperMatch[1], 10);
                        if (!Number.isFinite(id)) {
                          return <span className="text-violet-600 font-bold" {...props}>{children}</span>;
                        }
                        return (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenViewer?.(id);
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            title="Open PDF Document"
                            className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-800 font-bold bg-[var(--accent-soft)] hover:bg-[color:var(--border-strong)] px-1.5 py-0.5 rounded-md transition-colors leading-none mx-0.5 align-baseline cursor-pointer"
                          >
                            {children}
                          </button>
                        );
                      }
                      return <a href={href} className="text-violet-600 hover:text-violet-700 underline underline-offset-2 font-medium" {...props}>{children}</a>
                    },
                    strong: (props) => <strong className="font-bold text-violet-900" {...props} />,
                    h1: (props) => <h1 className="text-lg font-black text-slate-900 mt-4 mb-2" {...props} />,
                    h2: (props) => <h2 className="text-base font-bold text-slate-900 mt-3 mb-2" {...props} />,
                    h3: (props) => <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1" {...props} />,
                  }}
                >
                  {m.role === 'assistant' ? linkifyPaperTitles(m.content) : m.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/50">
              <Bot size={14} className="text-violet-400" />
            </div>
            <div className="bg-[var(--surface-soft)] p-4 rounded-3xl rounded-tl-none border border-[color:var(--border)]">
              <Loader2 className="animate-spin text-violet-400" size={16} />
            </div>
          </div>
        )}
      </div>
      <div className="h-10 bg-gradient-to-t from-[var(--surface-strong)] to-transparent absolute bottom-[88px] left-0 right-0 pointer-events-none" />

      {/* Input Area */}
      <div className="p-5 bg-[var(--surface-strong)] border-t border-[color:var(--border)]">
        <div className="relative flex items-center">
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={selectedPaperIds.length > 0 ? `Ask about these ${selectedPaperIds.length} papers...` : "Ask the AI about your entire library..."}
            className="w-full bg-[var(--surface-muted)] border border-[color:var(--border)] rounded-2xl py-3.5 pl-5 pr-14 outline-none focus:border-violet-500/30 focus:bg-[var(--surface-strong)] focus:ring-4 focus:ring-violet-500/5 transition-all text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-2 p-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-20 disabled:grayscale rounded-xl text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
