import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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
    const looseMatch = !match && line.match(/^([A-Za-z][A-Za-z-]*)\s+(.+)$/);
    if (!match && !looseMatch) continue;
    const parsed = match || [null, looseMatch[1], '', looseMatch[2]];
    const key = parsed[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ word: parsed[1], pos: parsed[2], meaning: parsed[3].trim() });
  }
  return entries;
}

async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.docx') return (await mammoth.extractRawText({ path: file.path })).value;
  if (ext === '.pdf') return (await pdfParse(await fs.readFile(file.path))).text;
  if (/\.(png|jpe?g|webp|bmp)$/i.test(ext)) {
    const image = sharp(file.path);
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const enhanced = await image.resize({ width: Math.max(width, 1800), withoutEnlargement: false }).grayscale().normalize().sharpen().png().toBuffer();
    const enhancedMeta = await sharp(enhanced).metadata();
    const enhancedWidth = enhancedMeta.width || Math.max(width, 1800);
    const enhancedHeight = enhancedMeta.height || height;
    const buffers = width > height * 1.15 ? await Promise.all([
      sharp(enhanced).extract({ left: 0, top: 0, width: Math.floor(enhancedWidth / 2), height: enhancedHeight }).toBuffer(),
      sharp(enhanced).extract({ left: Math.floor(enhancedWidth / 2), top: 0, width: Math.ceil(enhancedWidth / 2), height: enhancedHeight }).toBuffer(),
    ]) : [enhanced];
    const worker = await createWorker('eng+chi_sim');
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
    const results = [];
    for (const buffer of buffers) results.push((await worker.recognize(buffer)).data.text);
    await worker.terminate();
    return results.join('\n');
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
