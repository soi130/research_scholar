# Scholar.AI

Scholar.AI is a local-first research paper workstation for institutional PDF flows. It ingests raw reports from a local folder, extracts structured metadata and house views, holds everything in a review queue, and turns approved papers into a searchable dashboard, key-call table, knowledge graph, and multi-paper chat workspace.

This project is designed to run primarily on a single machine, with local PDF storage and a local SQLite database. The main operating model is:

1. Drop PDFs into a watched storage folder.
2. Run an ingest scan.
3. Review and approve extracted data.
4. Use the approved corpus for search, comparison, graphing, and chat.

## What The App Does

### Review Queue

Every newly ingested paper lands in a pending state first. That gives a human a checkpoint before the paper joins the approved working library.

The review flow exists because institutional research PDFs are messy:
- page layouts vary by house
- forecasts and realized values can look similar
- document titles and series names are often noisy
- market calls are often embedded in narrative text rather than clean tables

Instead of trusting extraction blindly, Scholar.AI lets you inspect and approve before the record becomes part of the main corpus.

### Key Call Table

The key call table is the main comparison surface for extracted house views. It merges:
- extracted paper key calls
- manual overrides
- manual deletions

Manual rows take precedence over extracted rows. This means the table is not just a passive display of model output. It is a curated working surface where you can correct the effective value that the rest of the app should use.

### Knowledge Graph

The knowledge graph exposes relationships between approved papers, houses, tags, themes, and extracted entities so you can move from single-document reading to cross-document pattern recognition.

### Multi-Paper Chat

You can select approved papers and ask the app to synthesize them together. This is useful for:
- comparing house views
- summarizing common themes
- asking where reports disagree
- tracing a topic across multiple papers

## How It Works

### End-To-End Flow

The application pipeline is:

1. File discovery
2. PDF text extraction
3. AI or heuristic metadata extraction
4. SQLite persistence
5. Human review
6. Approved-data exploration in the UI

### 1. File Discovery

The ingest pipeline recursively scans the folder defined by `PAPERS_STORAGE_PATH` and collects `.pdf` files. Hidden files and hidden directories are ignored.

Important behavior:
- duplicate detection is based on file hash, not filename
- nested folders are supported
- `.DS_Store` and similar hidden entries are skipped

### 2. PDF Text Extraction

PDF extraction is handled in two stages inside [src/lib/ingest.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/ingest.ts):

1. `pdf2json` is attempted first
2. if `pdf2json` fails or times out, the pipeline falls back to `pdf-parse`

This fallback exists because some sell-side PDFs parse cleanly in one engine and fail in the other. The app now records per-file outcomes so parse failures are diagnosable instead of disappearing into a generic failed count.

### 3. AI Or Local Extraction

Once text is available, the app extracts structured metadata using the logic in [src/lib/ai.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/ai.ts).

The extraction engine order is:
- OpenAI, if `OPENAI_API_KEY` is set
- Gemini, if `GEMINI_API_KEY` is set and OpenAI is not available
- a local heuristic fallback, if no API key is configured

Current extraction output includes:
- title
- authors
- published date
- publisher / house
- series name
- abstract / summary
- key findings
- forecasts
- key calls
- topic labels
- topic summary
- research facts
- tags

### 4. SQLite Persistence

All app state lives in a local SQLite database, `papers.db`, created in the project root.

Key tables are defined in [src/lib/db.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/db.ts):
- `papers`: top-level document records
- `paper_extractions`: raw extraction payload snapshots
- `paper_key_calls`: extracted key-call rows
- `manual_key_calls`: user overrides and deletions
- `paper_topic_labels`: topic sentiment outputs
- `research_facts`: structured facts extracted from the paper
- `scan_file_logs`: per-file ingest outcomes for diagnostics
- `app_meta`: app-level metadata such as scan state

The database is local-first by design. This is important operationally:
- PDFs stay on disk
- database state stays on the machine
- destructive rebuild actions only affect the local environment

### 5. Human Review

New papers are inserted with `status = 'pending'`. They only become part of the approved library after review.

That status is what separates:
- newly ingested but untrusted output
- approved records that should drive the dashboard and downstream tools

### 6. Effective Key Calls

The key-call table endpoint in [src/app/api/key-call-table/route.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/app/api/key-call-table/route.ts) merges extracted and manual rows into a single effective result set.

The precedence model is:
- manual override wins over extracted value
- manual delete hides the row
- most recent effective row wins within a house / indicator / period combination

That design gives the UI a stable “best current truth” instead of showing raw duplicates.

## Architecture

### High-Level Architecture

```text
Local PDF folder
    |
    v
Ingest scanner
    |
    v
PDF text extraction
  - pdf2json
  - pdf-parse fallback
    |
    v
AI / heuristic extraction
  - OpenAI
  - Gemini
  - local fallback
    |
    v
SQLite persistence
  - papers
  - extractions
  - key calls
  - scan logs
    |
    v
Review queue
    |
    v
Approved views
  - dashboard
  - key call table
  - knowledge graph
  - multi-paper chat
```

### App Structure

- [src/lib/ingest.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/ingest.ts): scan orchestration, file hashing, PDF parsing, ingestion, and scan-file logging
- [src/lib/ai.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/ai.ts): extraction engine selection and metadata extraction logic
- [src/lib/db.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/lib/db.ts): SQLite connection, schema creation, migrations, and write serialization
- [src/components/DashboardLayout.tsx](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/components/DashboardLayout.tsx): the main app shell and settings / dev controls
- [src/components/KeyCallTable.tsx](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/components/KeyCallTable.tsx): grouped key-call pivot, row editing, and paper-opening behavior
- [src/app/api/dev/reset-and-rescan/route.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/app/api/dev/reset-and-rescan/route.ts): local DB wipe and optional reingest
- [src/app/api/dev/scan-file-logs/route.ts](/Users/mrclawmacmini/Desktop/paper_library/paper-library-app/src/app/api/dev/scan-file-logs/route.ts): latest scan-log API for diagnostics

### Why The Architecture Is Local-First

This app is optimized for research workflows where the source material is sensitive, messy, and often proprietary. A local-first architecture keeps the operational model simple:

- the paper store is just a local folder
- the database is just a local SQLite file
- the app server is just a local Next.js process
- the UI works against the local DB rather than a remote backend

That makes the system easier to audit, easier to back up, and easier to run on a Windows workstation without extra infrastructure.

## Installation

## Windows-First Setup

This is the recommended setup if the app will mainly run on Windows.

### 1. Install Prerequisites

Install:
- Node.js 20 LTS or newer
- Git

Recommended:
- Windows 11
- PowerShell or Windows Terminal

To confirm Node is installed:

```powershell
node -v
npm -v
```

### 2. Clone The Repository

```powershell
git clone https://github.com/soi130/research_scholar.git
cd research_scholar\paper-library-app
```

### 3. Install Dependencies

```powershell
npm install
```

### 4. Create Your Environment File

Copy the sample config:

```powershell
copy .env.local.example .env.local
```

Then edit `.env.local`.

At least one AI provider key should be set:
- `OPENAI_API_KEY`
- or `GEMINI_API_KEY`

You also need a paper storage path. On Windows, use an absolute path.

Example:

```env
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=
PAPERS_STORAGE_PATH=C:\Users\YourName\Documents\cio_paper
```

Notes:
- absolute Windows paths are strongly recommended
- keep the path pointed at the folder that actually contains your PDFs
- nested subfolders are supported

### 5. Start The App

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

### 6. First Run

On first run, the app will:
- create `papers.db` in the project root
- create the required SQLite tables automatically
- open directly into the app shell

There is currently no login gate. This is intended for local operation.

## Running On Windows Day-To-Day

Typical daily flow:

1. Put new PDFs into your configured `PAPERS_STORAGE_PATH`
2. Open the app
3. Trigger ingest or use the dev reset/reingest controls if needed
4. Review pending papers
5. Approve good records
6. Use the dashboard, key-call table, graph, and chat views

## Dev And Maintenance Tools

In Settings, Dev Mode exposes local-only maintenance actions:
- `Wipe Only`
- `Wipe DB And Reingest`
- `Latest Scan Log`

The latest scan log is especially useful when papers are missing from the review queue. It shows, per file:
- status
- filename
- stage
- reason
- error message

That makes it easy to see whether a file failed at:
- read
- parse
- AI extraction
- persistence

## Current Product Notes

- the UI is currently dark-mode only
- login has been removed; the app opens directly
- the key-call table supports manual overrides and manual deletions
- clicking an extracted forecast value in the key-call table opens the referenced paper
- forecast periods are displayed in short form such as `FY26`, `1Q26`, `2Q27`

## Known Limitations

- numeric extraction can still confuse realized values with true forward forecasts in some papers
- PDF parsing quality still depends on report layout and encoding quality
- the local heuristic fallback is useful for resilience, but lower quality than model-backed extraction

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS v4
- SQLite
- OpenAI SDK
- Google Gemini SDK
- `pdf2json`
- `pdf-parse`
- Lucide React

## Data And Privacy

This project is intended for local use with proprietary research material.

Operationally:
- PDFs are expected to live outside the repo or in ignored storage paths
- `papers.db` is local state
- the repository ignores local database files and PDF storage content

You should still make sure your use of research documents complies with your internal rights, licenses, and handling rules.
