'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CircleDot,
  FileText,
  Loader2,
  Layers3,
  Search,
  Share2,
  Tag,
  User,
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

  const iterations = Math.min(180, Math.max(90, 30 + nodes.length * 2));
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
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<Record<GraphNodeType, boolean>>({
    paper: true,
    author: true,
    tag: true,
    publisher: true,
    series: true,
  });

  useEffect(() => {
    let active = true;

    async function loadGraph() {
      setLoading(true);
      try {
        const res = await fetch('/api/graph?status=approved');
        const data = await res.json();
        if (!active) return;
        setGraph(data);
      } catch {
        if (active) setGraph(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadGraph();

    return () => {
      active = false;
    };
  }, []);

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
    const layout = layoutGraph(visible.nodes, visible.edges);
    const adjacency = buildAdjacency(visible.edges);

    return {
      ...visible,
      layout,
      adjacency,
    };
  }, [graph, searchQuery, typeFilter]);

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

  const labelForType = (type: GraphNodeType) => NODE_META[type].label;

  return (
    <div className="h-[78vh] min-h-[680px] rounded-[2.5rem] overflow-hidden border border-slate-800/80 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-900/20 relative">
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

          <div className="px-5 py-4 border-b border-white/10 bg-slate-950/40 flex flex-wrap items-center gap-2">
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
              <span>{searchQuery.trim() ? `Filtering for "${searchQuery.trim()}"` : 'Use the global search bar to filter this map.'}</span>
            </div>
          </div>

          <div className="relative flex-1 min-h-0">
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300">
                  <Loader2 size={16} className="animate-spin text-sky-300" />
                  <span className="text-sm font-medium">Building graph map...</span>
                </div>
              </div>
            )}

            {!loading && derived.nodes.length === 0 && (
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

            {!loading && derived.nodes.length > 0 && (
              <svg viewBox="0 0 1400 900" className="w-full h-full block">
                <defs>
                  <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <g>
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
                </g>

                {derived.layout.map((node) => {
                  const selected = node.id === selectedNodeId;
                  const hovered = node.id === hoveredNodeId;
                  const matched = derived.matchingIds.has(node.id);
                  const radius = getRadius(node);
                  const fill = getFill(node, selected, hovered, matched);
                  const stroke = getStroke(node, selected, hovered, matched);
                  const paperConnected = node.type === 'paper' && selectedNodeId && selectedNodeId !== node.id && derived.adjacency.get(selectedNodeId)?.has(node.id);
                  const labelVisible = node.type === 'paper' || hovered || selected || matched || node.count > 3;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
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
                          fontSize={node.type === 'paper' ? 12 : 10}
                          fontWeight={node.type === 'paper' ? 700 : 600}
                          className="select-none"
                        >
                          {node.label.length > 28 ? `${node.label.slice(0, 28)}…` : node.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
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
                Click any node to inspect it. Paper nodes open directly in the PDF viewer; metadata nodes reveal the papers around them.
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
