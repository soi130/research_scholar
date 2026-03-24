# Scholar.AI - Research Paper Library

A modern, AI-powered web application for managing research papers.

## Features
- **Automatic Metadata Extraction**: Reads PDFs and extracts title, authors, findings, and more using Gemini AI.
- **Human-in-the-Loop Review**: Approve or edit AI-generated metadata before it enters your library.
- **Multi-Paper Chat**: Chat with multiple research papers simultaneously to compare methodologies or results.
- **Glassmorphism UI**: A premium, dark-themed interface built with Next.js and Tailwind CSS.

## Windows Setup Instructions

1. **Install Node.js**: Download and install from [nodejs.org](https://nodejs.org/).
2. **Setup Folder Structure**:
   - Create a folder for your papers (e.g., `C:\MyResearch\Storage`).
   - Copy the `paper-library-app` folder anywhere on your machine.
3. **Configure API Key**:
   - Rename `.env.local.example` to `.env.local`.
   - Add your [Google Gemini API Key](https://aistudio.google.com/app/apikey).
   - Set `PAPERS_STORAGE_PATH` to the absolute path of your papers folder.
4. **Install Dependencies**:
   - Open PowerShell or Command Prompt in the `paper-library-app` folder.
   - Run: `npm install --legacy-peer-deps`
5. **Run the App**:
   - Run: `npm run dev`
   - Open your browser to `http://localhost:3000`.

## How to use
1. Put your PDF papers into the configured folder.
2. Open the app and click **"Sync Library"**.
3. Go to **"Review Queue"** to verify the AI-extracted data.
4. Click the checkmark to **Approve**.
5. Once approved, papers appear in the **Dashboard** where you can select them for **Multi-Chat**.
