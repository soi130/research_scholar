import chokidar from 'chokidar';
import path from 'path';
import { ingestPaper } from './ingest';

let watcher: chokidar.FSWatcher | null = null;

export function startWatcher(folderPath: string) {
  if (watcher) return;
  
  console.log(`Starting watcher for: ${folderPath}`);
  
  watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.pdf')) {
      console.log(`File added: ${filePath}`);
      ingestPaper(filePath);
    }
  });

  return watcher;
}
