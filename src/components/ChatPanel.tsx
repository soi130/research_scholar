'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Eraser } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPanel({ selectedPaperIds }: { selectedPaperIds: number[] }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm your research assistant. I have access to the selected papers. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

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
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error processing your request." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[70vh] bg-white rounded-[2.5rem] border border-slate-200/50 overflow-hidden relative shadow-2xl shadow-slate-200/50">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-violet-500/5 blur-[100px] pointer-events-none" />
      
      {/* Header */}
      <div className="h-14 border-b border-slate-100 flex items-center px-6 justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10">
         <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Research Co-Pilot</span>
         </div>
         <button onClick={() => setMessages([{ role: 'assistant', content: "Hello! History cleared. How can I help you navigate these papers?" }])} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
           <Eraser size={14} />
         </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-violet-600 border border-slate-200/50'}`}>
              {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed shadow-sm ${
              m.role === 'user' 
                ? 'bg-violet-600 text-white rounded-tr-none font-medium' 
                : 'bg-slate-50 text-slate-900 rounded-tl-none border border-slate-100'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/50">
              <Bot size={14} className="text-violet-400" />
            </div>
            <div className="bg-slate-50 p-4 rounded-3xl rounded-tl-none border border-slate-100">
              <Loader2 className="animate-spin text-violet-400" size={16} />
            </div>
          </div>
        )}
      </div>
      <div className="h-10 bg-gradient-to-t from-white to-transparent absolute bottom-[88px] left-0 right-0 pointer-events-none" />

      {/* Input Area */}
      <div className="p-5 bg-white border-t border-slate-200/50">
        <div className="relative flex items-center">
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={selectedPaperIds.length > 0 ? `Ask about these ${selectedPaperIds.length} papers...` : "Select papers from dashboard to start"}
            className="w-full bg-slate-100/50 border border-slate-200/50 rounded-2xl py-3.5 pl-5 pr-14 outline-none focus:border-violet-500/30 focus:bg-white focus:ring-4 focus:ring-violet-500/5 transition-all text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || loading || selectedPaperIds.length === 0}
            className="absolute right-2 p-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-20 disabled:grayscale rounded-xl text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
