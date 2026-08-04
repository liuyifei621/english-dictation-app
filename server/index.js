import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const upload = multer({ dest: path.join(process.cwd(), 'tmp'), limits: { fileSize: 15 * 1024 * 1024 } });
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });

function parseVocabularyText(text) {
  const seen = new Set();
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^([A-Za-z][A-Za-z-]*)\s*(?:—|–|-|:)\s*((?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|num\.)?)\s*(.*)$/)
      || line.match(/^([A-Za-z][A-Za-z-]*)\s+((?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|num\.)+)\s+(.+)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ word: match[1], pos: match[2], meaning: match[3].trim() });
  }
  return entries;
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.docx') return (await mammoth.extractRawText({ path: file.path })).value;
  if (ext === '.pdf') return (await pdfParse(await fs.readFile(file.path))).text;
  if (/\.(png|jpe?g|webp|bmp)$/i.test(ext)) {
    const worker = await createWorker('eng+chi_sim');
    const { data } = await worker.recognize(file.path);
    await worker.terminate();
    return data.text;
  }
  return await fs.readFile(file.path, 'utf8');
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.post('/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  try {
    const text = await extractText(req.file);
    const entries = parseVocabularyText(text);
    res.json({ entries, count: entries.length });
  } catch (error) {
    res.status(422).json({ error: error.message || '文档识别失败' });
  } finally {
    await fs.rm(req.file.path, { force: true }).catch(() => {});
  }
});

app.listen(process.env.PORT || 8787, '0.0.0.0', () => console.log('Extractor listening on port 8787'));
