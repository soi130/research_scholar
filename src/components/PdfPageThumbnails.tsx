'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface PdfPageThumbnailsProps {
  paperId: number;
  activePage: number;
  onSelectPage: (page: number) => void;
}

type ThumbnailItem = {
  pageNumber: number;
  src: string;
};

type PdfRenderingTask = {
  promise: Promise<unknown>;
  cancel: () => void;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      canvas: HTMLCanvasElement;
    }) => PdfRenderingTask;
  }>;
  destroy: () => void;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>;
  destroy: () => void;
};

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
  getDocument: (src: string) => PdfLoadingTask;
};

export default function PdfPageThumbnails({ paperId, activePage, onSelectPage }: PdfPageThumbnailsProps) {
  const [items, setItems] = useState<ThumbnailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let loadingTask: PdfLoadingTask | null = null;
    let pdfDoc: PdfDocumentProxy | null = null;
    let renderTask: PdfRenderingTask | null = null;

    async function loadThumbnails() {
      try {
        setLoading(true);
        setError(false);
        setItems([]);

        const pdfjsLib = (await import('pdfjs-dist')) as unknown as PdfjsModule;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        loadingTask = pdfjsLib.getDocument(`/api/papers/${paperId}/serve`);
        pdfDoc = await loadingTask.promise;
        const pageCount = Math.min(pdfDoc.numPages, 16);
        const nextItems: ThumbnailItem[] = [];

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          if (!active) break;
          const page = await pdfDoc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 0.22 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
          });

          await renderTask.promise;
          nextItems.push({ pageNumber, src: canvas.toDataURL('image/png') });
        }

        if (active) {
          setItems(nextItems);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'RenderingCancelledException') return;
        console.error('Thumbnail rail error:', err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }

    void loadThumbnails();

    return () => {
      active = false;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try {
          loadingTask.destroy();
        } catch {
          // ignore
        }
      }
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try {
          pdfDoc.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [paperId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <Loader2 className="mx-auto mb-2 animate-spin text-violet-500" size={18} />
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Loading thumbnails</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <FileText className="mx-auto mb-2" size={22} />
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Thumbnails unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 custom-scrollbar bg-[var(--surface-soft)]">
      {items.map((item) => (
        <button
          key={item.pageNumber}
          type="button"
          onClick={() => onSelectPage(item.pageNumber)}
          className={`w-full rounded-xl border p-2 text-left transition-all ${
            activePage === item.pageNumber
              ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10'
              : 'border-[color:var(--border)] bg-[var(--surface-strong)] hover:border-violet-300 hover:bg-[var(--surface-strong)]'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Page {item.pageNumber}</span>
            {activePage === item.pageNumber && <span className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-600">Active</span>}
          </div>
          <Image
            src={item.src}
            alt={`Page ${item.pageNumber}`}
            width={240}
            height={320}
            unoptimized
            className="h-auto w-full rounded-lg border border-[color:var(--border)] bg-white"
          />
        </button>
      ))}
      {items.length >= 16 && (
        <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Showing first 16 pages
        </p>
      )}
    </div>
  );
}
