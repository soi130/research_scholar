export type GraphNodeType = 'paper' | 'author' | 'tag' | 'publisher' | 'series';

export type GraphEdgeType =
  | 'authored_by'
  | 'tagged_with'
  | 'published_by'
  | 'series_of'
  | 'related_to';

export interface PaperGraphSource {
  id: number;
  title: string | null;
  authors: string | string[] | null;
  publisher: string | null;
  series_name: string | null;
  published_date: string | null;
  abstract: string | null;
  tags: string | string[] | null;
  status?: string | null;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  paperId: number | null;
  count: number;
  metadata: {
    title?: string;
    publishedDate?: string | null;
    abstract?: string | null;
    status?: string | null;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  weight: number;
  metadata: {
    reasons?: string[];
  };
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    papers: number;
    nodes: number;
    edges: number;
    relations: Record<string, number>;
  };
}

type RelationBucket = Map<string, Set<number>>;

function safeParseList(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated parsing.
  }

  return trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'unknown';
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function nodeId(type: GraphNodeType, label: string): string {
  return `${type}:${slugify(label)}:${hashString(label)}`;
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addBucket(bucket: RelationBucket, key: string, paperId: number) {
  const existing = bucket.get(key);
  if (existing) {
    existing.add(paperId);
    return;
  }
  bucket.set(key, new Set([paperId]));
}

export function buildKnowledgeGraph(papers: PaperGraphSource[]): KnowledgeGraph {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const relationCounts: Record<string, number> = {
    authored_by: 0,
    tagged_with: 0,
    published_by: 0,
    series_of: 0,
    related_to: 0,
  };

  const authorBuckets: RelationBucket = new Map();
  const tagBuckets: RelationBucket = new Map();
  const publisherBuckets: RelationBucket = new Map();
  const seriesBuckets: RelationBucket = new Map();

  const paperLabels = new Map<number, string>();

  for (const paper of papers) {
    const paperLabel = normalizeLabel(paper.title || `Paper ${paper.id}`);
    paperLabels.set(paper.id, paperLabel);
    const paperNodeId = `paper:${paper.id}`;

    nodeMap.set(paperNodeId, {
      id: paperNodeId,
      type: 'paper',
      label: paperLabel,
      paperId: paper.id,
      count: 1,
      metadata: {
        title: paperLabel,
        publishedDate: paper.published_date,
        abstract: paper.abstract,
        status: paper.status || null,
      },
    });

    const authors = safeParseList(paper.authors);
    const tags = safeParseList(paper.tags);
    const publisher = normalizeLabel(paper.publisher || '');
    const seriesName = normalizeLabel(paper.series_name || '');

    authors.forEach((author) => {
      const label = normalizeLabel(author);
      const authorNodeId = nodeId('author', label);
      nodeMap.set(authorNodeId, {
        id: authorNodeId,
        type: 'author',
        label,
        paperId: null,
        count: (nodeMap.get(authorNodeId)?.count || 0) + 1,
        metadata: {},
      });

      const edgeId = `edge:${paperNodeId}:${authorNodeId}:authored_by`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          source: paperNodeId,
          target: authorNodeId,
          type: 'authored_by',
          weight: 1,
          metadata: {},
        });
      }
      relationCounts.authored_by += 1;
      addBucket(authorBuckets, label.toLowerCase(), paper.id);
    });

    tags.forEach((tag) => {
      const label = normalizeLabel(tag);
      const tagNodeId = nodeId('tag', label);
      nodeMap.set(tagNodeId, {
        id: tagNodeId,
        type: 'tag',
        label,
        paperId: null,
        count: (nodeMap.get(tagNodeId)?.count || 0) + 1,
        metadata: {},
      });

      const edgeId = `edge:${paperNodeId}:${tagNodeId}:tagged_with`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          source: paperNodeId,
          target: tagNodeId,
          type: 'tagged_with',
          weight: 1,
          metadata: {},
        });
      }
      relationCounts.tagged_with += 1;
      addBucket(tagBuckets, label.toLowerCase(), paper.id);
    });

    if (publisher) {
      const publisherNodeId = nodeId('publisher', publisher);
      nodeMap.set(publisherNodeId, {
        id: publisherNodeId,
        type: 'publisher',
        label: publisher,
        paperId: null,
        count: (nodeMap.get(publisherNodeId)?.count || 0) + 1,
        metadata: {},
      });

      const edgeId = `edge:${paperNodeId}:${publisherNodeId}:published_by`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          source: paperNodeId,
          target: publisherNodeId,
          type: 'published_by',
          weight: 1,
          metadata: {},
        });
      }
      relationCounts.published_by += 1;
      addBucket(publisherBuckets, publisher.toLowerCase(), paper.id);
    }

    if (seriesName) {
      const seriesNodeId = nodeId('series', seriesName);
      nodeMap.set(seriesNodeId, {
        id: seriesNodeId,
        type: 'series',
        label: seriesName,
        paperId: null,
        count: (nodeMap.get(seriesNodeId)?.count || 0) + 1,
        metadata: {},
      });

      const edgeId = `edge:${paperNodeId}:${seriesNodeId}:series_of`;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId,
          source: paperNodeId,
          target: seriesNodeId,
          type: 'series_of',
          weight: 1,
          metadata: {},
        });
      }
      relationCounts.series_of += 1;
      addBucket(seriesBuckets, seriesName.toLowerCase(), paper.id);
    }
  }

  const sharedBuckets: Array<[RelationBucket, string]> = [
    [authorBuckets, 'shared_author'],
    [tagBuckets, 'shared_tag'],
    [publisherBuckets, 'shared_publisher'],
    [seriesBuckets, 'shared_series'],
  ];

  for (const [bucket, reason] of sharedBuckets) {
    for (const paperIds of bucket.values()) {
      const ids = Array.from(paperIds);
      if (ids.length < 2) continue;

      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const sourceId = `paper:${ids[i]}`;
          const targetId = `paper:${ids[j]}`;
          const key = pairKey(ids[i], ids[j]);
          const edgeId = `edge:${key}:related_to`;
          const existing = edgeMap.get(edgeId);

          if (existing) {
            existing.weight += 1;
            const reasons = new Set(existing.metadata.reasons || []);
            reasons.add(reason);
            existing.metadata.reasons = Array.from(reasons);
          } else {
            edgeMap.set(edgeId, {
              id: edgeId,
              source: sourceId,
              target: targetId,
              type: 'related_to',
              weight: 1,
              metadata: {
                reasons: [reason],
              },
            });
          }
          relationCounts.related_to += 1;
        }
      }
    }
  }

  // Keep node weights aligned with their number of connections.
  for (const edge of edgeMap.values()) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (source) source.count += 1;
    if (target) target.count += 1;
  }

  const nodes = Array.from(nodeMap.values()).sort((a, b) => {
    if (a.type === b.type) {
      return b.count - a.count || a.label.localeCompare(b.label);
    }
    return a.type.localeCompare(b.type);
  });

  const edges = Array.from(edgeMap.values()).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));

  return {
    nodes,
    edges,
    stats: {
      papers: paperLabels.size,
      nodes: nodes.length,
      edges: edges.length,
      relations: relationCounts,
    },
  };
}
