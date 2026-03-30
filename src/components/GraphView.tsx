'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CircleDot,
  FileText,
  Loader2,
  Layers3,
  Maximize2,
  Minimize2,
  Search,
  Share2,
  Sparkles,
  Tag,
  User,
  X,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { GraphEdge, GraphNode, GraphNodeType, KnowledgeGraph } from '@/lib/graph';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NODE_ORDER: GraphNodeType[] = ['paper', 'author', 'tag', 'publisher', 'series'];

const NODE_META = {
  paper: { label: 'Papers', icon: FileText, color: 'text-sky-300', fill: 'bg-sky-400' },
  author: { label: 'Authors', icon: User, color: 'text-emerald-300', fill: 'bg-emerald-400' },
  tag: { label: 'Tags', icon: Tag, color: 'text-amber-300', fill: 'bg-amber-400' },
  publisher: { label: 'Publishers', icon: Building2, color: 'text-fuchsia-300', fill: 'bg-fuchsia-400' },
  series: { label: 'Series', icon: Layers3, color: 'text-violet-300', fill: 'bg-violet-400' },
} satisfies Record<GraphNodeType, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; fill: string }>;

type NodePoint = GraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type TimeWindow = 'all' | '3m' | '6m' | '1y' | '2y';

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getRadius(node: GraphNode) {
  if (node.type === 'paper') return 12 + Math.min(10, Math.log2(node.count + 1));
  if (node.type === 'author') return 8 + Math.min(4, Math.log2(node.count + 1));
  if (node.type === 'tag') return 7 + Math.min(4, Math.log2(node.count + 1));
  if (node.type === 'publisher') return 9 + Math.min(5, Math.log2(node.count + 1));
  return 8 + Math.min(4, Math.log2(node.count + 1));
}

function getStroke(node: GraphNode, selected: boolean, hovered: boolean, matched: boolean) {
  if (selected) return 'rgba(255,255,255,0.95)';
  if (hovered) return 'rgba(255,255,255,0.8)';
  if (matched) return 'rgba(255,255,255,0.6)';
  if (node.type === 'paper') return 'rgba(125,211,252,0.8)';
  if (node.type === 'author') return 'rgba(110,231,183,0.75)';
  if (node.type === 'tag') return 'rgba(252,211,77,0.75)';
  if (node.type === 'publisher') return 'rgba(232,121,249,0.7)';
  return 'rgba(196,181,253,0.7)';
}

function getFill(node: GraphNode, selected: boolean, hovered: boolean, matched: boolean) {
  if (selected || hovered) {
    if (node.type === 'paper') return '#7dd3fc';
    if (node.type === 'author') return '#6ee7b7';
    if (node.type === 'tag') return '#fcd34d';
    if (node.type === 'publisher') return '#e879f9';
    return '#c4b5fd';
  }
  if (matched) return 'rgba(255,255,255,0.92)';
  if (node.type === 'paper') return '#0f172a';
  if (node.type === 'author') return '#12261f';
  if (node.type === 'tag') return '#2a2108';
  if (node.type === 'publisher') return '#211024';
  return '#1f1730';
}

function buildAdjacency(edges: GraphEdge[]) {
  const adjacency = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  return adjacency;
}

function buildVisibleGraph(graph: KnowledgeGraph, searchQuery: string, typeFilter: Record<GraphNodeType, boolean>) {
  const adjacency = buildAdjacency(graph.edges);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const typeFilteredNodes = graph.nodes.filter((node) => typeFilter[node.type]);
  const typeNodeIds = new Set(typeFilteredNodes.map((node) => node.id));

  if (!normalizedQuery) {
    const visibleEdges = graph.edges.filter((edge) => typeNodeIds.has(edge.source) && typeNodeIds.has(edge.target));
    return {
      nodes: typeFilteredNodes,
      edges: visibleEdges,
      highlightedIds: new Set<string>(),
      matchingIds: new Set<string>(),
    };
  }

  const matchingIds = new Set<string>();

  for (const node of typeFilteredNodes) {
    const text = [
      node.label,
      node.metadata.title || '',
      node.metadata.abstract || '',
      node.metadata.publishedDate || '',
      node.metadata.status || '',
    ]
      .join(' ')
      .toLowerCase();

    if (text.includes(normalizedQuery)) {
      matchingIds.add(node.id);
    }
  }

  const highlightedIds = new Set<string>(matchingIds);
  for (const id of matchingIds) {
    const neighbors = adjacency.get(id);
    neighbors?.forEach((neighborId) => {
      if (typeNodeIds.has(neighborId)) {
        highlightedIds.add(neighborId);
      }
    });
  }

  const visibleIds = matchingIds.size > 0 ? highlightedIds : new Set<string>();
  const visibleNodes = typeFilteredNodes.filter((node) => visibleIds.has(node.id));
  const visibleEdges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    highlightedIds,
    matchingIds,
  };
}

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], width = 1400, height = 900) {
  if (nodes.length === 0) return [] as NodePoint[];

  const centerX = width / 2;
  const centerY = height / 2;
  const points = new Map<string, NodePoint>();
  const seedRadius = Math.min(width, height) * 0.18;

  nodes.forEach((node, index) => {
    const hash = stableHash(node.id);
    const angle = ((hash % 360) / 180) * Math.PI;
    const ring = seedRadius + ((hash % 220) / 220) * seedRadius * 1.2;
    const x = centerX + Math.cos(angle + index * 0.11) * ring;
    const y = centerY + Math.sin(angle + index * 0.11) * ring;
    points.set(node.id, {
      ...node,
      x,
      y,
      vx: 0,
      vy: 0,
    });
  });

  const linkPairs = edges
    .map((edge) => {
      const source = points.get(edge.source);
      const target = points.get(edge.target);
      if (!source || !target) return null;
      return { source, target, weight: Math.max(1, edge.weight) };
    })
    .filter(Boolean) as Array<{ source: NodePoint; target: NodePoint; weight: number }>;

  const iterations = Math.min(110, Math.max(50, 18 + nodes.length));
  for (let i = 0; i < iterations; i += 1) {
    for (let a = 0; a < nodes.length; a += 1) {
      const pointA = points.get(nodes[a].id);
      if (!pointA) continue;

      for (let b = a + 1; b < nodes.length; b += 1) {
        const pointB = points.get(nodes[b].id);
        if (!pointB) continue;

        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const strength = 1200 / distSq;
        const forceX = (dx / dist) * strength * 0.015;
        const forceY = (dy / dist) * strength * 0.015;

        pointA.vx -= forceX;
        pointA.vy -= forceY;
        pointB.vx += forceX;
        pointB.vy += forceY;
      }
    }

    for (const link of linkPairs) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const desired = link.source.type === 'paper' || link.target.type === 'paper' ? 120 : 160;
      const delta = dist - desired;
      const force = delta * 0.0009 * link.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      link.source.vx += fx;
      link.source.vy += fy;
      link.target.vx -= fx;
      link.target.vy -= fy;
    }

    for (const point of points.values()) {
      point.vx += (centerX - point.x) * 0.0002;
      point.vy += (centerY - point.y) * 0.0002;

      point.x += point.vx;
      point.y += point.vy;
      point.vx *= 0.82;
      point.vy *= 0.82;

      const padding = 40;
      point.x = Math.min(width - padding, Math.max(padding, point.x));
      point.y = Math.min(height - padding, Math.max(padding, point.y));
    }
  }

  return Array.from(points.values());
}

export default function GraphView({
  searchQuery = '',
  onOpenViewer,
}: {
  searchQuery?: string;
  onOpenViewer?: (id: number) => void;
}) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [topicInput, setTopicInput] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [focusLabel, setFocusLabel] = useState('Pick a tag or topic to build a focused map.');
  const [focusReady, setFocusReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [graphSpread, setGraphSpread] = useState(1);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1y');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [activeFocus, setActiveFocus] = useState<{ query: string; tag: string }>({ query: '', tag: '' });
  const [typeFilter, setTypeFilter] = useState<Record<GraphNodeType, boolean>>({
    paper: true,
    author: true,
    tag: true,
    publisher: true,
    series: true,
  });
  const panStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const graphShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTags() {
      try {
        const res = await fetch('/api/tags');
        const data = await res.json();
        if (!active) return;
        setAvailableTags(Array.isArray(data) ? data.slice(0, 24) : []);
      } catch {
        if (active) setAvailableTags([]);
      }
    }

    void loadTags();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const today = new Date();
    setAsOfDate(today.toISOString().slice(0, 10));
  }, []);

  const computeTemporalRange = () => {
    if (!asOfDate) {
      return { from: '', to: '', asOf: '' };
    }

    if (timeWindow === 'all') {
      return { from: '', to: '', asOf: asOfDate };
    }

    const asOf = new Date(asOfDate);
    if (Number.isNaN(asOf.getTime())) {
      return { from: '', to: '', asOf: '' };
    }

    const from = new Date(asOf.getTime());
    if (timeWindow === '3m') from.setMonth(from.getMonth() - 3);
    if (timeWindow === '6m') from.setMonth(from.getMonth() - 6);
    if (timeWindow === '1y') from.setFullYear(from.getFullYear() - 1);
    if (timeWindow === '2y') from.setFullYear(from.getFullYear() - 2);

    return {
      from: from.toISOString().slice(0, 10),
      to: asOfDate,
      asOf: asOfDate,
    };
  };

  const loadFocusedGraph = async ({ query, tag }: { query: string; tag: string }) => {
    const trimmedQuery = query.trim();
    const trimmedTag = tag.trim();

    if (!trimmedQuery && !trimmedTag) {
      setGraph(null);
      setFocusReady(false);
      setFocusLabel('Pick a tag or topic to build a focused map.');
      setActiveFocus({ query: '', tag: '' });
      return;
    }

    const params = new URLSearchParams({
      status: 'approved',
      limit: '140',
    });

    if (trimmedQuery) params.set('q', trimmedQuery);
    if (trimmedTag) params.set('tag', trimmedTag);
    const temporal = computeTemporalRange();
    if (temporal.from) params.set('from', temporal.from);
    if (temporal.to) params.set('to', temporal.to);
    if (temporal.asOf) params.set('asOf', temporal.asOf);

    setLoading(true);
    setFocusReady(true);
    setActiveFocus({ query: trimmedQuery, tag: trimmedTag });
    const focusBase = trimmedTag ? `Focused on tag "${trimmedTag}"` : `Focused on topic "${trimmedQuery}"`;
    const rangeLabel =
      timeWindow === 'all'
        ? asOfDate
          ? `as of ${asOfDate}`
          : 'all history'
        : asOfDate
          ? `${timeWindow.toUpperCase()} window (as of ${asOfDate})`
          : `${timeWindow.toUpperCase()} window`;
    setFocusLabel(`${focusBase} • ${rangeLabel}`);

    try {
      const res = await fetch(`/api/graph?${params.toString()}`);
      const data = await res.json();
      if (data?.focusRequired) {
        setGraph(null);
        setFocusReady(false);
        setFocusLabel('Pick a tag or topic to build a focused map.');
      } else {
        setGraph(data);
      }
    } catch {
      setGraph(null);
      setFocusReady(false);
      setFocusLabel('Unable to load graph right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleBuildGraph = () => {
    void loadFocusedGraph({ query: topicInput, tag: selectedTag });
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
    setTopicInput('');
    void loadFocusedGraph({ query: '', tag });
  };

  const handleClearFocus = () => {
    setSelectedTag('');
    setTopicInput('');
    setGraph(null);
    setFocusReady(false);
    setFocusLabel('Pick a tag or topic to build a focused map.');
    setActiveFocus({ query: '', tag: '' });
  };

  useEffect(() => {
    if (!activeFocus.query && !activeFocus.tag) return;
    if (!asOfDate) return;
    void loadFocusedGraph(activeFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindow, asOfDate]);

  const derived = useMemo(() => {
    if (!graph) {
      return {
        nodes: [] as GraphNode[],
        edges: [] as GraphEdge[],
        layout: [] as NodePoint[],
        highlightedIds: new Set<string>(),
        matchingIds: new Set<string>(),
        adjacency: new Map<string, Set<string>>(),
      };
    }

    const visible = buildVisibleGraph(graph, searchQuery, typeFilter);
    const layout = layoutGraph(visible.nodes, visible.edges).map((node) => ({
      ...node,
      x: 700 + (node.x - 700) * graphSpread,
      y: 450 + (node.y - 450) * graphSpread,
    }));
    const adjacency = buildAdjacency(visible.edges);

    return {
      ...visible,
      layout,
      adjacency,
    };
  }, [graph, searchQuery, typeFilter, graphSpread]);

  useEffect(() => {
    if (selectedNodeId && !derived.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [derived.nodes, selectedNodeId]);

  const selectedNode = derived.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedNeighbors = selectedNode ? Array.from(derived.adjacency.get(selectedNode.id) || []) : [];
  const selectedConnectedPapers = derived.layout.filter(
    (node) => selectedNeighbors.includes(node.id) && node.type === 'paper'
  );

  const relationCounts = graph?.stats.relations || {
    authored_by: 0,
    tagged_with: 0,
    published_by: 0,
    series_of: 0,
    related_to: 0,
  };

  const nodeCount = derived.nodes.length;
  const edgeCount = derived.edges.length;
  const viewportLabel = `${Math.round(viewport.zoom * 100)}%`;
  const labelScale = Math.max(0.78, Math.min(1.12, 1 / Math.sqrt(Math.max(viewport.zoom, 0.85))));

  const labelForType = (type: GraphNodeType) => NODE_META[type].label;

  const clampZoom = (value: number) => Math.min(2.5, Math.max(0.4, value));

  const getPointerInViewBox = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 1400;
    const y = ((event.clientY - rect.top) / rect.height) * 900;
    return { x, y };
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svgPoint = getPointerInViewBox(event);
    const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08;
    setViewport((current) => {
      const nextZoom = clampZoom(current.zoom * zoomFactor);
      const worldX = (svgPoint.x - current.x) / current.zoom;
      const worldY = (svgPoint.y - current.y) / current.zoom;
      return {
        zoom: nextZoom,
        x: svgPoint.x - worldX * nextZoom,
        y: svgPoint.y - worldY * nextZoom,
      };
    });
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-graph-node="true"]')) {
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    svg.setPointerCapture(event.pointerId);
    panStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsPanning(true);
    setSelectedNodeId(null);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!panStateRef.current.active) return;

    const dx = event.clientX - panStateRef.current.startX;
    const dy = event.clientY - panStateRef.current.startY;
    setViewport((current) => ({
      ...current,
      x: panStateRef.current.originX + dx,
      y: panStateRef.current.originY + dy,
    }));
  };

  const endPointerInteraction = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    panStateRef.current.active = false;
    setIsPanning(false);
  };

  const resetViewport = () => setViewport({ x: 0, y: 0, zoom: 1 });
  const zoomBy = (factor: number) => {
    setViewport((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }));
  };

  const toggleFullscreen = async () => {
    const el = graphShellRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await el.requestFullscreen();
  };

  return (
    <div
      ref={graphShellRef}
      className={cn(
        'h-[78vh] min-h-[680px] rounded-[2.5rem] overflow-hidden border border-slate-800/80 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-900/20 relative',
        isFullscreen ? 'rounded-none h-screen min-h-0' : ''
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(196,181,253,0.10),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,1))]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div className="relative z-10 h-full flex">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="p-5 border-b border-white/10 bg-slate-950/50 backdrop-blur-md flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-400/15 border border-sky-300/20 flex items-center justify-center text-sky-200 shadow-lg shadow-sky-500/10">
                  <Share2 size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight text-white">Knowledge Graph</h2>
                  <p className="text-xs text-slate-400">
                    Obsidian-style map of papers, authors, tags, publishers, and related documents.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-[11px] font-semibold text-slate-400">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="uppercase tracking-[0.18em] text-slate-500">Nodes</p>
                <p className="text-slate-100 text-base font-black">{nodeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="uppercase tracking-[0.18em] text-slate-500">Links</p>
                <p className="text-slate-100 text-base font-black">{edgeCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="uppercase tracking-[0.18em] text-slate-500">Related</p>
                <p className="text-slate-100 text-base font-black">{relationCounts.related_to}</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-white/10 bg-slate-950/40 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBuildGraph();
                  }}
                  placeholder="Search a topic, company, macro theme, or keyword"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/30 focus:bg-white/10 transition-all"
                />
              </div>
              <button
                onClick={handleBuildGraph}
                className="inline-flex items-center gap-2 rounded-2xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-sky-300 transition-colors"
              >
                <Sparkles size={15} />
                Build Graph
              </button>
              <button
                onClick={handleClearFocus}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 transition-colors"
              >
                <X size={15} />
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mr-2">Popular Tags</span>
              {availableTags.length > 0 ? (
                availableTags.slice(0, 16).map((tag) => {
                  const active = selectedTag.toLowerCase() === tag.toLowerCase();
                  return (
                    <button
                      key={tag}
                      onClick={() => handleTagSelect(tag)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                        active
                          ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      )}
                    >
                      {tag}
                    </button>
                  );
                })
              ) : (
                <span className="text-xs text-slate-500">No tags loaded yet.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mr-2">
                <CalendarClock size={12} />
                Time Window
              </span>
              {[
                { label: 'All', value: 'all' as const },
                { label: '3M', value: '3m' as const },
                { label: '6M', value: '6m' as const },
                { label: '1Y', value: '1y' as const },
                { label: '2Y', value: '2y' as const },
              ].map((option) => {
                const active = timeWindow === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTimeWindow(option.value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      active
                        ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
              <div className="ml-2 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black">As Of</span>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(event) => setAsOfDate(event.target.value)}
                  className="bg-transparent text-xs text-slate-200 outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mr-2">Spacing</span>
              {[
                { label: 'Tight', value: 0.82 },
                { label: 'Normal', value: 1 },
                { label: 'Wide', value: 1.22 },
                { label: 'Far', value: 1.45 },
              ].map((preset) => {
                const active = Math.abs(graphSpread - preset.value) < 0.01;
                return (
                  <button
                    key={preset.label}
                    onClick={() => setGraphSpread(preset.value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      active
                        ? 'border-sky-300/30 bg-sky-400/15 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                onClick={() => setGraphSpread(1)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-all"
              >
                Reset Spacing
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mr-2">Node Types</span>
              {NODE_ORDER.map((type) => {
                const meta = NODE_META[type];
                const active = typeFilter[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter((prev) => ({ ...prev, [type]: !prev[type] }))}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      active
                        ? 'border-white/15 bg-white/10 text-white shadow-lg shadow-black/10'
                        : 'border-white/10 bg-transparent text-slate-500'
                    )}
                  >
                    <Icon size={13} className={active ? meta.color : 'text-slate-500'} />
                    {meta.label}
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                <Search size={13} />
                <span>{focusLabel}</span>
              </div>
            </div>
          </div>

          <div className="relative flex-1 min-h-0">
            {!focusReady && !loading && !graph && (
              <div className="absolute inset-0 flex items-center justify-center p-10 text-center">
                <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/20">
                  <CircleDot size={36} className="mx-auto text-sky-300 mb-5" />
                  <h3 className="text-xl font-black text-white mb-2">Build a focused graph</h3>
                  <p className="text-sm text-slate-400">
                    Start with a topic or a tag to keep the graph fast. This loads only a relevant subset instead of the full library.
                  </p>
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300">
                  <Loader2 size={16} className="animate-spin text-sky-300" />
                  <span className="text-sm font-medium">Building graph map...</span>
                </div>
              </div>
            )}

            {!loading && graph && derived.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center p-10 text-center">
                <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 px-8 py-10 shadow-2xl shadow-black/20">
                  <CircleDot size={36} className="mx-auto text-sky-300 mb-5" />
                  <h3 className="text-xl font-black text-white mb-2">No graph nodes to display</h3>
                  <p className="text-sm text-slate-400">
                    Approve papers and add tags, authors, or publishers to start building the map. If a search is active, try clearing it.
                  </p>
                </div>
              </div>
            )}

            {!loading && graph && derived.nodes.length > 0 && (
              <svg
                ref={svgRef}
                viewBox="0 0 1400 900"
                className={cn('w-full h-full block touch-none select-none', isPanning ? 'cursor-grabbing' : 'cursor-grab')}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endPointerInteraction}
                onPointerCancel={endPointerInteraction}
                onPointerLeave={endPointerInteraction}
              >
                <defs>
                  <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g transform={`matrix(${viewport.zoom} 0 0 ${viewport.zoom} ${viewport.x} ${viewport.y})`}>
                  {derived.edges.map((edge) => {
                    const source = derived.layout.find((node) => node.id === edge.source);
                    const target = derived.layout.find((node) => node.id === edge.target);
                    if (!source || !target) return null;

                    const selected = selectedNodeId && (selectedNodeId === source.id || selectedNodeId === target.id);
                    const hovered = hoveredNodeId && (hoveredNodeId === source.id || hoveredNodeId === target.id);
                    const active = selected || hovered || derived.matchingIds.size > 0;

                    return (
                      <line
                        key={edge.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke={selected ? 'rgba(255,255,255,0.75)' : 'rgba(148,163,184,0.22)'}
                        strokeWidth={selected ? 1.8 : edge.type === 'related_to' ? 1.4 : 1}
                        strokeLinecap="round"
                        opacity={active ? 1 : 0.6}
                      />
                    );
                  })}

                  {derived.layout.map((node) => {
                    const selected = node.id === selectedNodeId;
                    const hovered = node.id === hoveredNodeId;
                    const matched = derived.matchingIds.has(node.id);
                    const radius = getRadius(node);
                    const fill = getFill(node, selected, hovered, matched);
                    const stroke = getStroke(node, selected, hovered, matched);
                    const paperConnected = node.type === 'paper' && selectedNodeId && selectedNodeId !== node.id && derived.adjacency.get(selectedNodeId)?.has(node.id);
                    const labelVisible = node.type === 'paper' || hovered || selected || matched || node.count > 3 || viewport.zoom >= 0.85;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x},${node.y})`}
                        data-graph-node="true"
                        onClick={() => {
                          setSelectedNodeId(node.id);
                          if (node.type === 'paper' && node.paperId) {
                            onOpenViewer?.(node.paperId);
                          }
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        className="cursor-pointer"
                      >
                        <circle
                          r={radius + (selected ? 6 : hovered ? 4 : matched ? 2 : 0)}
                          fill={node.type === 'paper' ? 'rgba(125,211,252,0.08)' : 'rgba(255,255,255,0.04)'}
                          stroke="rgba(255,255,255,0.05)"
                          strokeWidth={1}
                        />
                        <circle
                          r={radius}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={selected ? 3 : hovered ? 2.2 : matched ? 2 : 1.2}
                          filter={selected || hovered ? 'url(#nodeGlow)' : undefined}
                          opacity={paperConnected ? 1 : 0.95}
                        />
                        <circle r={radius - 4} fill={node.type === 'paper' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'} opacity={selected || hovered ? 0.55 : 0.28} />
                        {labelVisible && (
                          <text
                            y={radius + 16}
                            textAnchor="middle"
                            fill="rgba(226,232,240,0.92)"
                            fontSize={(node.type === 'paper' ? 12 : 10) * labelScale}
                            fontWeight={node.type === 'paper' ? 700 : 600}
                            className="select-none"
                          >
                            {node.label.length > 28 ? `${node.label.slice(0, 28)}…` : node.label}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>

          <div className="absolute right-6 bottom-6 z-20 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 backdrop-blur-md">
            <button
              onClick={() => zoomBy(1.12)}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
              aria-label="Zoom in"
            >
              <span className="text-lg leading-none">+</span>
            </button>
            <button
              onClick={() => zoomBy(0.89)}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
              aria-label="Zoom out"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={resetViewport}
              className="rounded-xl bg-white/5 hover:bg-white/10 px-3 h-8 text-xs font-semibold text-slate-200 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => void toggleFullscreen()}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 flex items-center justify-center transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black pl-2 border-l border-white/10">
              {viewportLabel}
            </span>
          </div>
        </div>

        <aside className="w-[360px] shrink-0 border-l border-white/10 bg-slate-950/90 backdrop-blur-xl p-5 overflow-y-auto">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 mb-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mb-2">Selection</p>
            {selectedNode ? (
              <>
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center border', NODE_META[selectedNode.type].fill, 'border-white/10')}>
                    {React.createElement(NODE_META[selectedNode.type].icon, { size: 18, className: 'text-slate-950' })}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-white leading-tight break-words">{selectedNode.label}</h3>
                    <p className="text-xs text-slate-400 capitalize">{labelForType(selectedNode.type)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
                    <p className="text-slate-500 uppercase tracking-[0.18em] text-[10px] font-black">Connections</p>
                    <p className="text-white font-black text-base">{selectedNeighbors.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
                    <p className="text-slate-500 uppercase tracking-[0.18em] text-[10px] font-black">Weight</p>
                    <p className="text-white font-black text-base">{selectedNode.count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 col-span-2">
                    <p className="text-slate-500 uppercase tracking-[0.18em] text-[10px] font-black">As Of</p>
                    <p className="text-white font-black text-base">
                      {selectedNode.metadata.publishedDate || selectedNode.metadata.ingestedAt || 'Unknown'}
                    </p>
                  </div>
                </div>

                {selectedNode.type === 'paper' && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {selectedNode.metadata.abstract
                        ? selectedNode.metadata.abstract.slice(0, 240)
                        : 'No abstract is available for this paper yet.'}
                    </p>
                    {selectedNode.paperId && (
                      <button
                        onClick={() => onOpenViewer?.(selectedNode.paperId!)}
                        className="inline-flex items-center gap-2 rounded-xl border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/15 transition-colors"
                      >
                        Open Paper
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                )}

                {selectedNode.type !== 'paper' && selectedConnectedPapers.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mb-2">
                      Connected Papers
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedConnectedPapers.slice(0, 12).map((paper) => (
                        <button
                          key={paper.id}
                          onClick={() => {
                            setSelectedNodeId(paper.id);
                            const paperId = paper.paperId ?? Number.parseInt(paper.id.replace('paper:', ''), 10);
                            if (Number.isFinite(paperId)) {
                              onOpenViewer?.(paperId);
                            }
                          }}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-white/10 transition-colors max-w-full"
                        >
                          {paper.label.length > 24 ? `${paper.label.slice(0, 24)}…` : paper.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 leading-relaxed">
                Click any node to inspect it. Paper nodes open the document, and metadata nodes reveal the papers around them.
              </p>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mb-3">Map Summary</p>
            <div className="space-y-2 text-sm">
              {NODE_ORDER.map((type) => {
                const meta = NODE_META[type];
                const count = graph?.nodes.filter((node) => node.type === type).length || 0;
                return (
                  <div key={type} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {React.createElement(meta.icon, { size: 14, className: meta.color })}
                      <span className="text-slate-300">{meta.label}</span>
                    </div>
                    <span className="font-black text-white">{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mb-2">Timeline</p>
              <div className="space-y-1.5 text-xs text-slate-300 mb-3">
                <div className="flex items-center justify-between">
                  <span>From</span>
                  <span className="font-black text-white">{graph?.time.from || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>To</span>
                  <span className="font-black text-white">{graph?.time.to || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>As Of</span>
                  <span className="font-black text-white">{graph?.time.asOf || 'N/A'}</span>
                </div>
              </div>

              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-black mb-2">Relation Types</p>
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Paper to author</span>
                  <span className="font-black text-white">{relationCounts.authored_by}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Paper to tag</span>
                  <span className="font-black text-white">{relationCounts.tagged_with}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Paper to publisher</span>
                  <span className="font-black text-white">{relationCounts.published_by}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Paper to series</span>
                  <span className="font-black text-white">{relationCounts.series_of}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Related paper links</span>
                  <span className="font-black text-white">{relationCounts.related_to}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
