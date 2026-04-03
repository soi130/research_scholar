
'use strict';
const PDFParser = require('pdf2json');
const filepath = process.argv[2];
const parser = new PDFParser();
let text = '';
parser.on('pdfParser_dataError', () => { process.stdout.write(JSON.stringify('')); process.exit(0); });
parser.on('pdfParser_dataReady', (data) => {
  try {
    for (const page of (data.Pages || [])) {
      for (const line of (page.Texts || [])) {
        for (const t of (line.R || [])) {
          try { text += decodeURIComponent(t.T) + ' '; } catch { text += t.T + ' '; }
        }
        text += '\n';
      }
      text += '\n';
    }
  } catch(e) {}
  process.stdout.write(JSON.stringify(text));
  process.exit(0);
});
process.on('unhandledRejection', () => { process.stdout.write(JSON.stringify(text || '')); process.exit(0); });
parser.loadPDF(filepath);
setTimeout(() => { process.stdout.write(JSON.stringify(text || '')); process.exit(0); }, 30000);
