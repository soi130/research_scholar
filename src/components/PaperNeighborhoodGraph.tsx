'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Layers3, Loader2, Share2, Tag, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { GraphEdge, GraphNode, GraphNodeType, KnowledgeGraph } from '@/lib/graph';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NODE_META: Record<GraphNodeType, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; bg: string; fg: string }> = {
  paper: { label: 'Paper', icon: Share2, bg: 'bg-sky-400', fg: 'text-sky-500' },
  author: { label: 'Author', icon: User, bg: 'bg-emerald-400', fg: 'text-emerald-500' },
  tag: { label: 'Tag', icon: Tag, bg: 'bg-amber-400', fg: 'text-amber-500' },
  publisher: { label: 'Publisher', icon: Building2, bg: 'bg-fuchsia-400', fg: 'text-fuchsia-500' },
  series: { label: 'Series', icon: Layers3, bg: 'bg-violet-400', fg: 'text-violet-500' },
};

type MiniNode = GraphNode & {
  x: number;
  y: number;
};

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function label(node: GraphNode) {
  return node.label.length > 26 ? `${node.label.slice(0, 26)}…` : node.label;
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

function placeRing(nodes: GraphNode[], centerX: number, centerY: number, radius: number, offset = 0) {
  if (nodes.length === 0) return [] as MiniNode[];

  return nodes.map((node, index) => {
    const hash = stableHash(node.id);
    const angle = ((index + offset) / nodes.length) * Math.PI * 2 + (hash % 17) * 0.02;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

export default function PaperNeighborhoodGraph({
  paperId,
}: {
  paperId: number;
}) {
  const router = useRouter();
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadGraph() {
      setLoading(true);
      try {
        const res = await fetch(`/api/graph?status=approved&paperId=${paperId}&limit=90`);
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
  }, [paperId]);

  const derived = useMemo(() => {
    if (!graph) {
      return {
        center: null as GraphNode | null,
        nodes: [] as MiniNode[],
        edges: [] as GraphEdge[],
        selected: null as GraphNode | null,
        relatedPaperNodes: [] as GraphNode[],
      };
    }

    const centerId = `paper:${paperId}`;
    const center = graph.nodes.find((node) => node.id === centerId) || null;
    if (!center) {
      return {
        center: null,
        nodes: [],
        edges: [],
        selected: null,
        relatedPaperNodes: [],
      };
    }

    const adjacency = buildAdjacency(graph.edges);
    const directIds = new Set<string>([center.id]);
    const directNeighbors = Array.from(adjacency.get(center.id) || []);

    directNeighbors.forEach((id) => directIds.add(id));

    const directNodes = graph.nodes.filter((node) => directIds.has(node.id) && node.id !== center.id);
    const metadataNodes = directNodes.filter((node) => node.type !== 'paper');
    const relatedPaperNodes = directNodes.filter((node) => node.type === 'paper');

    const secondaryPaperIds = new Set<string>();
    for (const node of metadataNodes) {
      const connected = Array.from(adjacency.get(node.id) || []);
      for (const connectedId of connected) {
        if (connectedId !== center.id && connectedId.startsWith('paper:')) {
          secondaryPaperIds.add(connectedId);
        }
      }
    }

    const secondaryPaperNodes = graph.nodes.filter(
      (node) => secondaryPaperIds.has(node.id) && node.id !== center.id && !relatedPaperNodes.some((paper) => paper.id === node.id)
    );

    const visibleNodes = [
      center,
      ...placeRing(metadataNodes, 260, 190, 92, 0),
      ...placeRing([...relatedPaperNodes, ...secondaryPaperNodes], 260, 190, 156, 0),
    ];

    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges = graph.edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );

    const selected = selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) || null : null;
    const selectedPaperNodes = selected
      ? Array.from(adjacency.get(selected.id) || [])
          .filter((id) => id.startsWith('paper:') && id !== center.id)
          .map((id) => graph.nodes.find((node) => node.id === id))
          .filter((node): node is GraphNode => Boolean(node))
      : [];

    return {
      center,
      nodes: visibleNodes,
      edges: visibleEdges,
      selected,
      relatedPaperNodes: selectedPaperNodes,
    };
  }, [graph, paperId, selectedNodeId]);

  const selectedIsPaper = derived.selected?.type === 'paper';

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-xl p-4 shadow-lg shadow-slate-200/20 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">Neighborhood Graph</p>
          <p className="text-sm font-semibold text-slate-700">Local links around this paper</p>
        </div>
        {loading && <Loader2 className="animate-spin text-violet-500" size={16} />}
      </div>

      {loading ? (
        <div className="h-64 rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Loader2 className="mx-auto mb-2 animate-spin text-violet-500" size={18} />
            <p className="text-xs font-semibold">Building local map...</p>
          </div>
        </div>
      ) : derived.center ? (
        <>
          <div className="relative h-72 rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-200 overflow-hidden">
            <svg viewBox="0 0 520 360" className="w-full h-full block">
              <defs>
                <filter id="miniGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {derived.edges.map((edge) => {
                const source = derived.nodes.find((node) => node.id === edge.source);
                const target = derived.nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const active = selectedNodeId && (selectedNodeId === source.id || selectedNodeId === target.id);
                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={active ? 'rgba(255,255,255,0.72)' : 'rgba(148,163,184,0.22)'}
                    strokeWidth={active ? 2 : edge.type === 'related_to' ? 1.5 : 1}
                    strokeLinecap="round"
                  />
                );
              })}

              {derived.nodes.map((node) => {
                const isCenter = node.id === derived.center?.id;
                const selected = selectedNodeId === node.id;
                const meta = NODE_META[node.type];
                const Icon = meta.icon;
                const radius = isCenter ? 18 : node.type === 'paper' ? 13 : 10;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={() => {
                      if (isCenter) {
                        setSelectedNodeId(null);
                        return;
                      }
                      setSelectedNodeId(node.id);
                      if (node.type === 'paper' && node.paperId) {
                        router.push(`/paper/${node.paperId}`);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      r={radius + (selected ? 7 : 4)}
                      fill={isCenter ? 'rgba(125,211,252,0.10)' : 'rgba(255,255,255,0.04)'}
                      opacity="0.9"
                    />
                    <circle
                      r={radius}
                      fill={isCenter ? '#7dd3fc' : node.type === 'paper' ? '#0f172a' : node.type === 'author' ? '#12261f' : node.type === 'tag' ? '#2a2108' : node.type === 'publisher' ? '#211024' : '#1f1730'}
                      stroke={isCenter ? 'rgba(255,255,255,0.95)' : selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'}
                      strokeWidth={selected ? 2.5 : 1.5}
                      filter={selected || isCenter ? 'url(#miniGlow)' : undefined}
                    />
                    <circle r={Math.max(3, radius - 5)} fill={isCenter ? '#0f172a' : 'rgba(255,255,255,0.16)'} opacity="0.6" />
                    <foreignObject x={-30} y={radius + 6} width={60} height={36}>
                      <div className="text-center text-[10px] font-semibold text-slate-200 leading-tight select-none">
                        {isCenter ? 'Center' : label(node)}
                      </div>
                    </foreignObject>
                    {!isCenter && (
                      <g transform={`translate(${radius + 8},${-radius - 4})`}>
                        <rect x={0} y={0} width={18} height={18} rx={6} className={meta.bg} opacity="0.95" />
                        <Icon size={10} className="text-slate-950" />
                      </g>
                    )}
                  </g>
                );
              })}

              <text x="260" y="187" textAnchor="middle" className="fill-white" fontSize="12" fontWeight="700">
                {derived.center.label.length > 30 ? `${derived.center.label.slice(0, 30)}…` : derived.center.label}
              </text>
              <text x="260" y="206" textAnchor="middle" className="fill-slate-300" fontSize="9" fontWeight="600">
                paper node
              </text>
            </svg>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">Selection</p>
              <span className="text-[10px] font-bold text-slate-500">
                {derived.nodes.filter((node) => node.type === 'paper').length - 1} connected papers
              </span>
            </div>

            {derived.selected ? (
              <>
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', NODE_META[derived.selected.type].bg)}>
                    {React.createElement(NODE_META[derived.selected.type].icon, { size: 16, className: 'text-slate-950' })}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 leading-tight break-words">{derived.selected.label}</p>
                    <p className="text-xs text-slate-500 capitalize">{NODE_META[derived.selected.type].label}</p>
                  </div>
                </div>

                {selectedIsPaper ? (
                  <button
                    onClick={() => derived.selected?.paperId && router.push(`/paper/${derived.selected.paperId}`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                  >
                    Open Paper
                    <ArrowUpRight size={14} />
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Related papers connected through this {NODE_META[derived.selected.type].label.toLowerCase()}.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {derived.relatedPaperNodes.slice(0, 8).map((relatedPaper) => (
                        <button
                          key={relatedPaper.id}
                          onClick={() => relatedPaper.paperId && router.push(`/paper/${relatedPaper.paperId}`)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors"
                        >
                          {relatedPaper.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Click a node to inspect its neighborhood. Paper nodes jump to a paper page; metadata nodes reveal the papers that share them.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="h-64 rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-center px-6">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No neighborhood graph available</p>
            <p className="text-xs text-slate-400">
              This paper is not in the approved graph yet, or the graph data is still loading.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
