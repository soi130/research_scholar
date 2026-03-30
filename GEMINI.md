# 🎓 GEMINI.md - KKP Scholar: AI Research Co-Pilot

This document provides essential context and instructions for AI agents working on the **KKP Scholar** (paper-library-app) project.

## 🚀 Project Overview
**KKP Scholar** is a premium, local-first research management platform that automates the ingestion, metadata extraction, and analysis of institutional research papers (PDFs). It uses AI (Gemini/OpenAI) to extract structured data and provides a RAG-based multi-chat interface for synthesizing insights across documents.

### Core Tech Stack
- **Framework**: [Next.js 15+](https://nextjs.org/) (App Router, React 19)
- **UI/UX**: [Tailwind CSS v4](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/)
- **Database**: [SQLite](https://www.sqlite.org/) (Local-first, managed via `sqlite3` and `sqlite` packages)
- **AI Integration**: [Google Gemini SDK](https://ai.google.dev/) (`gemini-1.5-flash`), [OpenAI SDK](https://openai.com/) (Fallback/Alternative)
- **PDF Processing**: [pdf2json](https://github.com/modesty/pdf2json) for text extraction
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🏗️ Project Architecture & Workflow

### 1. Ingestion Engine (`src/lib/ingest.ts`)
- **Scan**: Monitors or manually scans a configured local folder for PDF files.
- **Parse**: Uses `pdf2json` to extract raw text from PDFs.
- **Extract**: Calls AI (Gemini/GPT) with a specialized prompt to extract metadata:
    - Title, Authors, Published Date, Publisher/House, Series Name.
    - Abstract, Key Findings (array), Tags (array).
- **Store**: Saves metadata into `papers.db` with a `status` of `'pending'`.

### 2. Review & Approval UI
- **Dashboard**: `src/components/DashboardLayout.tsx`
- **Review Queue**: `src/components/ReviewGrid.tsx` allows users to verify, edit, and approve extracted metadata.
- **Status Flow**: `pending` → `approved`. Only `approved` papers are available for chat.

### 3. AI Multi-Chat (RAG) (`src/app/api/chat/route.ts`)
- **Context**: Dynamically builds a system prompt containing metadata and summaries of selected (or all approved) papers.
- **Citations**: AI is instructed to cite papers using a custom protocol: `[Title](paper://<id>)`.
- **RAG Logic**: Currently metadata-heavy (Abstracts + Key Findings). Future iterations may include vector-based full-text retrieval.

---

## 📂 Key Directory Structure
- `src/app/api/`: REST endpoints for papers, tags, chat, and ingestion.
- `src/app/paper/[id]/`: Specialized PDF viewer and paper details page.
- `src/components/`: Core UI components (Dashboard, Library, Chat, PDF Thumbnail).
- `src/lib/`: Backend utilities (DB connection, AI prompts, Ingestion logic).
- `scripts/`: CLI tools for administrative tasks like bulk ingestion.
- `public/`: Static assets and PDF storage symlinks.

---

## 🛠️ Development & Operational Commands

### Environment Setup
Requires a `.env.local` file with:
- `GEMINI_API_KEY`: Your Google AI key.
- `PAPERS_STORAGE_PATH`: Path to the directory containing research PDFs.
- `OPENAI_API_KEY`: (Optional) Fallback provider.

### Common Commands
- `npm install`: Install dependencies.
- `npm run dev`: Start the local development server.
- `npm run build`: Build for production.
- `npm run start`: Run the production build.
- `npm run lint`: Run ESLint.
- `node scripts/ingest.mjs`: Manually trigger the ingestion script (check file content for exact usage).

---

## 🛡️ Privacy & Security Conventions
- **Data Exclusion**: `*.pdf` and `papers.db*` are strictly excluded from Git tracking via `.gitignore`.
- **Local-First**: All metadata and documents stay on the local machine; only text snippets are sent to AI APIs for extraction/chat.

---

## 📝 Development Guidelines
- **Type Safety**: Maintain strict TypeScript definitions for paper metadata and database schemas.
- **UI Consistency**: Follow the aesthetic of "Premium Research Tool" using Tailwind v4 and subtle Framer Motion transitions.
- **Database Migrations**: `src/lib/db.ts` handles basic table creation and column updates; ensure any schema changes are reflected there.
- **AI Prompting**: Updates to extraction logic should be made in `src/lib/ai.ts`. Multi-chat logic resides in `src/app/api/chat/route.ts`.
