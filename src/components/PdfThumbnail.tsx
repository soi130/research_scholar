'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';

interface PdfThumbnailProps {
  paperId: number;
  className?: string;
}

export default function PdfThumbnail({ paperId, className }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let loadingTask: any = null;
    let pdfDoc: any = null;
    let renderTask: any = null;
    let timeoutId: NodeJS.Timeout;

    const renderThumbnail = async () => {
      try {
        setLoading(true);
        setError(false);

        // Dynamically import pdfjs-dist on the client
        const pdfjsLib = await import('pdfjs-dist');
        
        // Set worker path
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        loadingTask = pdfjsLib.getDocument(`/api/papers/${paperId}/serve`);
        pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1);

        if (!isMounted || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
        if (isMounted) setLoading(false);
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') return;
        console.error('Thumbnail error:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    // Add a debounce to prevent rapid firing during search filtering
    timeoutId = setTimeout(() => {
      if (isMounted) renderThumbnail();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (renderTask) {
        try { renderTask.cancel(); } catch(e) {}
      }
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        try { loadingTask.destroy(); } catch(e) {}
      }
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try { pdfDoc.destroy(); } catch(e) {}
      }
    };
  }, [paperId]);

  return (
    <div className={`relative bg-slate-50 flex items-center justify-center overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 backdrop-blur-sm z-10">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500/40" />
        </div>
      )}
      {error ? (
        <div className="flex flex-col items-center gap-2 text-slate-300">
           <FileText size={32} />
           <span className="text-[10px] font-bold">PREVIEW UNAVAILABLE</span>
        </div>
      ) : (
        <canvas 
          ref={canvasRef} 
          className="w-full h-full object-cover object-top transition-opacity duration-500"
          style={{ opacity: loading ? 0 : 1 }}
        />
      )}
    </div>
  );
}
