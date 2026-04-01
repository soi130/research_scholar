import { NextResponse } from 'next/server';
import { getDb, runInTransaction } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

function paperResponse(paper: Record<string, unknown>) {
  return {
    ...paper,
    authors: paper.authors ? JSON.parse(String(paper.authors)) : [],
    key_findings: paper.key_findings ? JSON.parse(String(paper.key_findings)) : [],
    tags: paper.tags ? JSON.parse(String(paper.tags)) : [],
    forecasts: paper.forecasts ? JSON.parse(String(paper.forecasts)) : {},
    topic_labels: paper.topic_labels ? JSON.parse(String(paper.topic_labels)) : [],
    topic_summary: paper.topic_summary ? JSON.parse(String(paper.topic_summary)) : {
      core_topics: [],
      top_positive_topics: [],
      top_negative_topics: [],
    },
  };
}

function normalizeKeyFindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const expectedUpdatedAt = typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null;

  const result = await runInTransaction(async (db) => {
    const paper = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    if (!paper) {
      return { type: 'missing' as const };
    }

    if (expectedUpdatedAt && String(paper.updated_at || '') !== expectedUpdatedAt) {
      return { type: 'conflict' as const, paper };
    }

    await db.run(
      `UPDATE papers
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['approved', id]
    );

    const updated = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    return { type: 'updated' as const, paper: updated! };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  if (result.type === 'conflict') {
    return NextResponse.json(
      { error: 'Paper was updated by another reviewer.', paper: paperResponse(result.paper) },
      { status: 409 }
    );
  }

  console.log(`Paper ${id} approved.`);
  return NextResponse.json({ message: 'Paper approved', paper: paperResponse(result.paper) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const {
    title,
    authors,
    published_date,
    publisher,
    series_name,
    journal,
    abstract,
    key_findings,
    forecasts,
    tags,
    expectedUpdatedAt,
  } = body;

  const result = await runInTransaction(async (db) => {
    const current = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    if (!current) {
      return { type: 'missing' as const };
    }

    if (expectedUpdatedAt && String(current.updated_at || '') !== expectedUpdatedAt) {
      return { type: 'conflict' as const, paper: current };
    }

    await db.run(`
      UPDATE papers 
      SET 
        title = ?, authors = ?, published_date = ?,
        publisher = ?, series_name = ?, journal = ?,
      abstract = ?, key_findings = ?, forecasts = ?, tags = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title,
      JSON.stringify(authors || []),
      published_date,
      publisher,
      series_name,
      journal,
      abstract,
      JSON.stringify(normalizeKeyFindings(key_findings)),
      JSON.stringify(forecasts || {}),
      JSON.stringify(tags || []),
      id
    ]);

    const updated = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
    return { type: 'updated' as const, paper: updated! };
  });

  if (result.type === 'missing') {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  if (result.type === 'conflict') {
    return NextResponse.json(
      { error: 'Paper was updated by another reviewer.', paper: paperResponse(result.paper) },
      { status: 409 }
    );
  }

  return NextResponse.json({ message: 'Paper updated', paper: paperResponse(result.paper) });
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const paper = await db.get<Record<string, unknown>>('SELECT * FROM papers WHERE id = ?', [id]);
  if (!paper) {
    return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
  }

  const latestExtractionId = Number(paper.latest_extraction_id || 0);
  const extraction = latestExtractionId
    ? await db.get<Record<string, unknown>>(
        `
          SELECT id, paper_id, file_hash, provider, model, prompt_version, extraction_payload, created_at
          FROM paper_extractions
          WHERE id = ?
        `,
        [latestExtractionId]
      )
    : null;
  const topicLabels = await db.all<Record<string, unknown>[]>(
    `
      SELECT topic_code, relevance, direction, confidence, evidence, regime, drivers, display_json, created_at
      FROM paper_topic_labels
      WHERE paper_id = ?
      ORDER BY relevance DESC, confidence DESC, topic_code ASC
    `,
    [id]
  );
  const researchFacts = await db.all<Record<string, unknown>[]>(
    `
      SELECT
        id,
        paper_id,
        source_house,
        fact_type,
        stance,
        subject,
        entity_or_scope,
        metric,
        value_number,
        unit,
        time_reference,
        evidence_text,
        evidence_page,
        confidence,
        ambiguity_flags,
        review_status,
        reviewed_fact_type,
        reviewed_stance,
        reviewed_subject,
        reviewed_entity_or_scope,
        reviewed_metric,
        reviewed_value_number,
        reviewed_unit,
        reviewed_time_reference,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
      FROM research_facts
      WHERE paper_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [id]
  );

  return NextResponse.json({
    ...paperResponse(paper),
    topic_labels_detail: topicLabels.map((label) => ({
      topic: String(label.topic_code || ''),
      relevance: Number(label.relevance || 0),
      direction: Number(label.direction || 0),
      confidence: Number(label.confidence || 0),
      evidence: String(label.evidence || ''),
      regime: label.regime ? String(label.regime) : null,
      drivers: label.drivers ? JSON.parse(String(label.drivers)) : [],
      display: label.display_json ? JSON.parse(String(label.display_json)) : {},
      created_at: label.created_at,
    })),
    research_facts: researchFacts.map((fact) => ({
      ...fact,
      value_number: fact.value_number === null || fact.value_number === undefined ? null : Number(fact.value_number),
      evidence_page: fact.evidence_page === null || fact.evidence_page === undefined ? null : Number(fact.evidence_page),
      confidence: Number(fact.confidence || 0),
      ambiguity_flags: fact.ambiguity_flags ? JSON.parse(String(fact.ambiguity_flags)) : [],
      reviewed_value_number:
        fact.reviewed_value_number === null || fact.reviewed_value_number === undefined
          ? null
          : Number(fact.reviewed_value_number),
    })),
    latest_extraction: extraction
      ? {
          ...extraction,
          extraction_payload: extraction.extraction_payload ? JSON.parse(String(extraction.extraction_payload)) : null,
        }
      : null,
  });
}
