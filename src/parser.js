const POS = '(?:n\\.|v\\.|adj\\.|adv\\.|prep\\.|pron\\.|conj\\.|num\\.)';

export function parseVocabularyText(text) {
  const result = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((raw) => raw.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || /^原 PDF|^未整理页面|^【/.test(line)) continue;
    let match = line.match(new RegExp(`^([A-Za-z][A-Za-z-]*)\s*(?:—|–|-|:)\s*(${POS})?\s*(.*)$`))
      || line.match(new RegExp(`^([A-Za-z][A-Za-z-]*)\s+(${POS})\s+(.+)$`));
    if (!match && /^([A-Za-z][A-Za-z-]*)(?:\s+(n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|num\.))?$/.test(line) && lines[i + 1] && /[\u3400-\u9fff]/.test(lines[i + 1])) {
      const parts = line.split(/\s+/);
      match = [null, parts[0], parts[1] || '', lines[++i]];
    }
    if (!match) continue;
    const word = match[1].toLowerCase();
    if (seen.has(word)) continue;
    seen.add(word);
    result.push({ word: match[1], pos: match[2] || '', meaning: match[3].trim() });
  }
  return result;
}

export function parseVocabularyFileText(text) {
  const entries = parseVocabularyText(text);
  if (!entries.length) throw new Error('没有识别到“英文—词性—中文释义”格式的词条');
  return entries;
}
