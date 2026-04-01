'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Library,
  MessageSquareShare,
  Settings,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Share2,
  Moon,
  SunMedium,
  LogOut,
  SlidersHorizontal,
  X,
  TriangleAlert,
  Loader2,
} from 'lucide-react';
import ReviewGrid from './ReviewGrid';
import LibraryView from './LibraryView';
import ChatPanel from './ChatPanel';
import GraphView from './GraphView';
import MultiSelectDropdown from './MultiSelectDropdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  createDefaultAdvancedSearchDraft,
  createEmptyAdvancedSearchFilters,
  DEFAULT_PUBLISHED_FROM,
  DEFAULT_PUBLISHED_TO,
  type AdvancedSearchFilters,
  type MultiSelectSearchField,
  type SearchOptions,
} from '@/lib/search';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function dateToSliderValue(date: string) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86400000);
}

function sliderValueToDate(value: number) {
  return new Date(value * 86400000).toISOString().slice(0, 10);
}

function getPreferredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = window.localStorage.getItem('scholar-theme');
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function DashboardLayout() {
  type View = 'library' | 'review' | 'chat' | 'graph';
  type Theme = 'light' | 'dark';
  type ScanState = {
    status: 'idle' | 'running' | 'completed' | 'failed';
    message: string | null;
    stats: { total: number; processed: number; succeeded: number; failed: number };
  };

  const [view, setView] = useState<View>('library');
  const [isScanning, setIsScanning] = useState(false);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [selectedPaperIds, setSelectedPaperIds] = useState<number[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    authors: [],
    publisher: [],
    series_name: [],
    tags: [],
    dateBounds: {
      min: DEFAULT_PUBLISHED_FROM,
      max: DEFAULT_PUBLISHED_TO,
    },
  });
  const [draftSearchFilters, setDraftSearchFilters] = useState<AdvancedSearchFilters>(createDefaultAdvancedSearchDraft());
  const [searchFilters, setSearchFilters] = useState<AdvancedSearchFilters>(createEmptyAdvancedSearchFilters());
  const [theme, setTheme] = useState<Theme>('light');
  const [devMode, setDevMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isResettingDevData, setIsResettingDevData] = useState(false);

  useEffect(() => {
    setTheme(getPreferredTheme());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDevMode(window.localStorage.getItem('scholar-dev-mode') === 'true');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem('scholar-theme', theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    const loadScanState = async () => {
      try {
        const res = await fetch('/api/scan');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setScanState(data);
        setIsScanning(data?.status === 'running');
      } catch {
        if (active) setIsScanning(false);
      }
    };

    void loadScanState();
    const intervalId = window.setInterval(() => {
      void loadScanState();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadSearchOptions = async () => {
      try {
        const res = await fetch('/api/search-options');
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;

        const nextOptions: SearchOptions = {
          authors: Array.isArray(data?.authors) ? data.authors : [],
          publisher: Array.isArray(data?.publisher) ? data.publisher : [],
          series_name: Array.isArray(data?.series_name) ? data.series_name : [],
          tags: Array.isArray(data?.tags) ? data.tags : [],
          dateBounds: {
            min: data?.dateBounds?.min || DEFAULT_PUBLISHED_FROM,
            max: data?.dateBounds?.max || DEFAULT_PUBLISHED_TO,
          },
        };
        setSearchOptions(nextOptions);
        setDraftSearchFilters((current) => ({
          ...current,
          published_from: current.published_from || DEFAULT_PUBLISHED_FROM,
          published_to: current.published_to || DEFAULT_PUBLISHED_TO,
        }));
      } catch {
        // Keep defaults if options fail to load.
      }
    };

    void loadSearchOptions();

    return () => {
      active = false;
    };
  }, []);

  const handleScan = async () => {
    setScanMessage('');
    setIsScanning(true);
    const res = await fetch('/api/papers', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setScanMessage(data?.message || 'A scan is already running.');
      setScanState(data?.state || null);
      setIsScanning(true);
      return;
    }
    if (!res.ok) {
      setScanMessage(data?.message || 'Unable to start scan.');
      setIsScanning(false);
      return;
    }
    setScanMessage(data?.message || 'Scan started.');
    const stateRes = await fetch('/api/scan');
    const stateData = await stateRes.json().catch(() => null);
    if (stateData) setScanState(stateData);
  };

  const applyTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
  };

  const toggleTheme = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  const toggleDevMode = () => {
    const nextValue = !devMode;
    setDevMode(nextValue);
    window.localStorage.setItem('scholar-dev-mode', String(nextValue));
  };

  const handleResetAndReingest = async () => {
    const confirmed = window.confirm(
      'This will wipe the local database and reingest all papers from the configured paper storage. Continue?'
    );

    if (!confirmed) return;

    setIsResettingDevData(true);
    setScanMessage('');

    try {
      const response = await fetch('/api/dev/reset-and-rescan', { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setScanMessage(data?.error || data?.message || 'Unable to reset the local database.');
      } else {
        setScanMessage(data?.message || 'Database wiped and reingest started.');
      }

      const stateRes = await fetch('/api/scan');
      const stateData = await stateRes.json().catch(() => null);
      if (stateData) {
        setScanState(stateData);
        setIsScanning(stateData?.status === 'running');
      } else {
        setIsScanning(false);
      }
    } catch {
      setScanMessage('Unable to reset the local database.');
      setIsScanning(false);
    } finally {
      setIsResettingDevData(false);
    }
  };

  const updateDraftMultiSelect = (field: MultiSelectSearchField, values: string[]) => {
    setDraftSearchFilters((current) => ({
      ...current,
      [field]: values,
    }));
  };

  const resetAdvancedSearch = () => {
    setDraftSearchFilters(createDefaultAdvancedSearchDraft());
    setSearchFilters(createEmptyAdvancedSearchFilters());
  };

  const applyAdvancedSearch = () => {
    setSearchFilters({
      authors: [...draftSearchFilters.authors],
      publisher: [...draftSearchFilters.publisher],
      series_name: [...draftSearchFilters.series_name],
      tags: [...draftSearchFilters.tags],
      published_from: draftSearchFilters.published_from,
      published_to: draftSearchFilters.published_to,
    });
  };

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    count += searchFilters.authors.length;
    count += searchFilters.publisher.length;
    count += searchFilters.series_name.length;
    count += searchFilters.tags.length;
    if (searchFilters.published_from || searchFilters.published_to) count += 1;
    return count;
  }, [searchFilters]);

  const sliderBounds = useMemo(() => {
    const min = dateToSliderValue(searchOptions.dateBounds.min);
    const max = dateToSliderValue(searchOptions.dateBounds.max);
    return { min, max };
  }, [searchOptions.dateBounds.max, searchOptions.dateBounds.min]);

  const draftFromValue = Math.max(sliderBounds.min, Math.min(sliderBounds.max, dateToSliderValue(draftSearchFilters.published_from || DEFAULT_PUBLISHED_FROM)));
  const draftToValue = Math.max(sliderBounds.min, Math.min(sliderBounds.max, dateToSliderValue(draftSearchFilters.published_to || DEFAULT_PUBLISHED_TO)));
  const showDashboardSearch = view === 'library';

  const handleDateSliderChange = (field: 'published_from' | 'published_to', sliderValue: number) => {
    const nextDate = sliderValueToDate(sliderValue);
    setDraftSearchFilters((current) => {
      const currentFrom = dateToSliderValue(current.published_from || DEFAULT_PUBLISHED_FROM);
      const currentTo = dateToSliderValue(current.published_to || DEFAULT_PUBLISHED_TO);
      if (field === 'published_from') {
        const clamped = Math.min(sliderValue, currentTo);
        return { ...current, published_from: sliderValueToDate(clamped) };
      }
      const clamped = Math.max(sliderValue, currentFrom);
      return { ...current, published_to: sliderValueToDate(clamped) };
    });
    return nextDate;
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const openPdfInNewWindow = (id: number) => {
    const pdfUrl = `/api/papers/${id}/serve`;
    const width = Math.max(960, Math.min(window.screen.availWidth - 80, 1320));
    const height = Math.max(700, Math.min(window.screen.availHeight - 80, 980));
    const left = Math.max(20, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(20, Math.round((window.screen.availHeight - height) / 2));
    const features = [
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes',
      'toolbar=no',
      'menubar=no',
      'status=no',
      'location=yes',
    ].join(',');
    const popup = window.open(pdfUrl, `scholar-pdf-${id}`, features);
    if (!popup) {
      console.warn('Popup blocked by browser. Please allow popups for this site.');
    }
  };

  const navItems = [
    { id: 'library', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'review', label: 'Review Queue', icon: RefreshCw },
    { id: 'graph', label: 'Knowledge Graph', icon: Share2 },
    { id: 'chat', label: 'AI Multi-Chat', icon: MessageSquareShare },
  ] as const satisfies ReadonlyArray<{ id: View; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-violet-500/20 flex overflow-hidden">
      <aside
        className={cn(
          'glass border-r border-[color:var(--border)] flex flex-col transition-all duration-300 z-50 flex-shrink-0 relative shadow-sm',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-24 w-6 h-6 bg-[var(--surface-strong)] border border-[color:var(--border)] rounded-full flex items-center justify-center shadow-lg hover:text-violet-600 transition-colors z-50 text-slate-400"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="h-20 flex items-center px-6 gap-3 flex-shrink-0">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-violet-500/30 text-white flex-shrink-0">
            <Library size={18} />
          </div>
          {!isCollapsed && (
            <span className="text-xl font-black tracking-tight text-slate-900 whitespace-nowrap animate-in fade-in duration-500">
              <span>Scholar.</span><span className="text-violet-600">AI</span>
            </span>
          )}
        </div>

        <nav className="flex-1 px-3 py-6 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative',
                view === item.id
                  ? 'bg-violet-600/10 text-violet-600 font-bold shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-[var(--surface-muted)]'
              )}
              title={isCollapsed ? item.label : ''}
            >
              <item.icon
                size={20}
                className={cn(
                  view === item.id ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600',
                  isScanning && item.id === 'review' ? 'animate-spin' : ''
                )}
              />
              {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
              {isCollapsed ? (
                <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
                  {item.label}
                </div>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[color:var(--border)] mt-auto flex items-center justify-center gap-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-3 text-slate-400 hover:text-red-500 transition-all rounded-xl hover:bg-[var(--surface-muted)]"
            title="Sign out"
          >
            <LogOut size={20} />
            {!isCollapsed ? <span className="text-[10px] font-black uppercase tracking-[0.2em]">Exit</span> : null}
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-3 text-slate-400 hover:text-violet-600 transition-all rounded-xl hover:bg-[var(--surface-muted)]"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <SunMedium size={20} /> : <Moon size={20} />}
            {!isCollapsed ? (
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                {theme === 'dark' ? 'Light' : 'Dark'}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-3 text-slate-400 hover:text-slate-900 transition-all rounded-xl hover:bg-[var(--surface-muted)]"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative bg-[var(--background)]">
        {showDashboardSearch ? (
          <header className="px-10 py-6 glass border-b border-[color:var(--border)] flex-shrink-0 sticky top-0 z-40 space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div className="w-full max-w-xl space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative group flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors" size={18} />
                    <input
                      type="text"
                      placeholder="Search papers, authors, tags, or topics..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="w-full bg-[var(--surface-muted)] border border-[color:var(--border)] rounded-2xl py-2.5 pl-12 pr-4 outline-none focus:border-violet-500/30 focus:bg-[var(--surface-strong)] transition-all placeholder:text-slate-400 text-sm shadow-inner"
                    />
                  </div>
                  <button
                    onClick={() => setShowAdvancedSearch((current) => !current)}
                    className={cn(
                      'px-4 py-2.5 rounded-2xl border text-sm font-bold transition-all flex items-center gap-2',
                      showAdvancedSearch || activeAdvancedFilterCount > 0
                        ? 'border-violet-300 bg-violet-50 text-violet-700'
                        : 'border-[color:var(--border)] bg-[var(--surface-muted)] text-slate-600 hover:text-violet-600'
                    )}
                  >
                    <SlidersHorizontal size={16} />
                    Advanced Search
                    {activeAdvancedFilterCount > 0 ? (
                      <span className="min-w-5 h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center">
                        {activeAdvancedFilterCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>

            {showAdvancedSearch ? (
              <div className="rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface-strong)] p-5 shadow-xl shadow-slate-200/20">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">Metadata Search</p>
                  <p className="text-sm text-slate-500">Filter with curated metadata selectors and a publication date range.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={resetAdvancedSearch}
                    className="px-3 py-2 rounded-xl border border-[color:var(--border)] text-xs font-bold text-slate-500 hover:text-violet-600"
                  >
                    Reset Filters
                  </button>
                  <button
                    onClick={applyAdvancedSearch}
                    className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-black uppercase tracking-[0.18em] shadow-lg shadow-violet-600/20"
                  >
                    Apply Search
                  </button>
                  <button
                    onClick={() => setShowAdvancedSearch(false)}
                    className="p-2 rounded-xl border border-[color:var(--border)] text-slate-400 hover:text-slate-700"
                    title="Close advanced search"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Author</span>
                  <MultiSelectDropdown
                    label="Author"
                    options={searchOptions.authors}
                    selected={draftSearchFilters.authors}
                    onChange={(next) => updateDraftMultiSelect('authors', next)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Publisher</span>
                  <MultiSelectDropdown
                    label="Publisher"
                    options={searchOptions.publisher}
                    selected={draftSearchFilters.publisher}
                    onChange={(next) => updateDraftMultiSelect('publisher', next)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Series Name</span>
                  <MultiSelectDropdown
                    label="Series Name"
                    options={searchOptions.series_name}
                    selected={draftSearchFilters.series_name}
                    onChange={(next) => updateDraftMultiSelect('series_name', next)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Tag</span>
                  <MultiSelectDropdown
                    label="Tag"
                    options={searchOptions.tags}
                    selected={draftSearchFilters.tags}
                    onChange={(next) => updateDraftMultiSelect('tags', next)}
                  />
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-[color:var(--border)] bg-[var(--surface-muted)] px-5 py-4">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Published Date</p>
                    <p className="text-sm font-semibold text-slate-700">
                      Between {draftSearchFilters.published_from} and {draftSearchFilters.published_to}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <span>From: {draftSearchFilters.published_from}</span>
                    <span>To: {draftSearchFilters.published_to}</span>
                  </div>
                  <div className="relative pt-4 pb-2">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-slate-200" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full bg-violet-500"
                      style={{
                        left: `${((draftFromValue - sliderBounds.min) / Math.max(sliderBounds.max - sliderBounds.min, 1)) * 100}%`,
                        right: `${100 - ((draftToValue - sliderBounds.min) / Math.max(sliderBounds.max - sliderBounds.min, 1)) * 100}%`,
                      }}
                    />
                    <input
                      type="range"
                      min={sliderBounds.min}
                      max={sliderBounds.max}
                      value={draftFromValue}
                      onChange={(event) => handleDateSliderChange('published_from', Number(event.target.value))}
                      className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none slider-thumb"
                    />
                    <input
                      type="range"
                      min={sliderBounds.min}
                      max={sliderBounds.max}
                      value={draftToValue}
                      onChange={(event) => handleDateSliderChange('published_to', Number(event.target.value))}
                      className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none slider-thumb"
                    />
                  </div>
                </div>
              </div>
              </div>
            ) : null}
          </header>
        ) : null}

        <div className="flex-1 overflow-y-auto p-10 custom-scrollbar scroll-smooth">
          <div className="mb-12">
            <h1 className="text-4xl font-black text-[var(--foreground)] tracking-tight leading-none mb-4">
              {view === 'review'
                ? 'Awaiting Human Review'
                : view === 'library'
                  ? 'Research Dashboard'
                  : view === 'graph'
                    ? 'Knowledge Graph'
                    : 'Research Multi-Chat'}
            </h1>
            <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
              <span className="w-8 h-px bg-[color:var(--border)]"></span>
              {view === 'review'
                ? 'Verify and approve AI-generated research metadata.'
                : view === 'library'
                  ? 'Explore your institutional research collection.'
                  : view === 'graph'
                    ? 'Trace relationships between papers, authors, tags, publishers, and shared themes.'
                    : 'Synthesize insights across your selected papers.'}
            </div>
          </div>

          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-700">
            {(view === 'library' || view === 'review') ? (
              <div className="flex flex-col gap-8">
                {view === 'review' ? (
                  <ReviewGrid
                    onOpenViewer={openPdfInNewWindow}
                    searchQuery={searchQuery}
                    searchFilters={searchFilters}
                    onSyncAssets={handleScan}
                    isScanning={isScanning}
                    scanState={scanState}
                    scanMessage={scanMessage}
                  />
                ) : (
                  <LibraryView
                    onSelectForChat={(ids) => {
                      setSelectedPaperIds(ids);
                      if (ids.length > 0) setView('chat');
                    }}
                    onOpenViewer={openPdfInNewWindow}
                    searchQuery={searchQuery}
                    searchFilters={searchFilters}
                  />
                )}
              </div>
            ) : null}

            {view === 'graph' ? (
              <GraphView
                onOpenViewer={openPdfInNewWindow}
                searchQuery={searchQuery}
              />
            ) : null}

            {view === 'chat' ? (
              <ChatPanel
                selectedPaperIds={selectedPaperIds}
                onOpenViewer={openPdfInNewWindow}
                onClearSelection={() => setSelectedPaperIds([])}
                onOpenLibrary={() => setView('library')}
              />
            ) : null}
          </div>
        </div>
      </div>

      {showSettings ? (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm px-6">
          <div className="w-full max-w-xl rounded-[2rem] border border-[color:var(--border)] bg-[var(--surface-strong)] shadow-2xl shadow-slate-900/20 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[color:var(--border)]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-600">Settings</p>
                <h2 className="text-xl font-black text-slate-900">Environment Controls</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 rounded-xl border border-[color:var(--border)] text-slate-400 hover:text-slate-700"
                title="Close settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[var(--surface-muted)] px-5 py-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-black text-slate-900">Dev Mode</p>
                  <p className="text-sm text-slate-500">
                    Reveal destructive local-only tools for rebuilding the database during development.
                  </p>
                </div>
                <button
                    onClick={toggleDevMode}
                  className={cn(
                    'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
                    devMode ? 'bg-violet-600' : 'bg-slate-300'
                  )}
                  aria-pressed={devMode}
                  title={devMode ? 'Disable dev mode' : 'Enable dev mode'}
                >
                  <span
                    className={cn(
                      'inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform',
                      devMode ? 'translate-x-8' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {devMode ? (
                <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-red-500">
                      <TriangleAlert size={18} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-red-700">Danger Zone</p>
                      <p className="text-sm text-red-600">
                        Wipes the local SQLite database and reingests all PDFs from the configured paper storage path.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleResetAndReingest}
                    disabled={isResettingDevData}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-700 disabled:opacity-60"
                  >
                    {isResettingDevData ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Wipe DB And Reingest
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .glass {
          background: color-mix(in srgb, var(--surface-strong) 84%, white 16%);
          backdrop-filter: blur(18px);
        }

        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #7c3aed;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
          pointer-events: auto;
          cursor: pointer;
        }

        .slider-thumb::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #7c3aed;
          border: 2px solid white;
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
          pointer-events: auto;
          cursor: pointer;
        }

        .slider-thumb::-webkit-slider-runnable-track {
          height: 18px;
          background: transparent;
        }

        .slider-thumb::-moz-range-track {
          height: 18px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}
