const POS_RE = '(n\\.|v\\.|adj\\.|adv\\.|prep\\.|pron\\.|conj\\.|num\\.|art\\.|aux\\.)';
const POS_PATTERN = new RegExp(`^${POS_RE}$`, 'i');

function makeEntry(word, pos, meaning) {
  const cleanWord = word.trim().replace(/^[\d.、)）\s]+/, '').replace(/[，,;；]+$/, '');
  const cleanMeaning = meaning.trim().replace(/^[：:—–-]+\s*/, '');
  if (!/^[A-Za-z][A-Za-z-]*$/.test(cleanWord) || !cleanMeaning) return null;
  return { word: cleanWord, pos: pos?.trim() || '', meaning: cleanMeaning };
}

export function parseVocabularyText(text) {
  const result = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/).flatMap((raw) => raw.split(/\s+(?=[A-Za-z][A-Za-z-]*(?:\s+(?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|num\.|art\.|aux\.))?\s+[\u3400-\u9fff])/i)).map((raw) => raw.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/[|｜]/g, ' ');
    if (/^原 PDF|^未整理页面|^【/.test(line)) continue;
    let entry = null;
    const englishFirst = line.match(/^(?:\d+[.、)）]\s*)?([A-Za-z][A-Za-z-]*)(?:\s+|\s*[—–:：-]\s*)(.*)$/);
    if (englishFirst) {
      let rest = englishFirst[2].trim().replace(/^[—–:：-]\s*/, '');
      const parts = rest.split(/\s+/);
      const pos = POS_PATTERN.test(parts[0] || '') ? parts.shift() : '';
      entry = makeEntry(englishFirst[1], pos, parts.join(' '));
    }
    if (!entry) {
      const chineseFirst = line.match(/^(?:\d+[.、)）]\s*)?(.+?)[\s—–:：-]+([A-Za-z][A-Za-z-]*)$/);
      if (chineseFirst) entry = makeEntry(chineseFirst[2], '', chineseFirst[1]);
    }
    if (!entry && /^[A-Za-z][A-Za-z-]*(?:\s+(?:n\.|v\.|adj\.|adv\.|prep\.|pron\.|conj\.|num\.|art\.|aux\.))?$/i.test(line) && lines[i + 1] && /[\u3400-\u9fff]/.test(lines[i + 1])) {
      const parts = line.split(/\s+/);
      entry = makeEntry(parts[0], parts[1] || '', lines[++i]);
    }
    if (entry && !seen.has(entry.word.toLowerCase())) {
      seen.add(entry.word.toLowerCase());
      result.push(entry);
    }
  }
  return result;
}

export function parseVocabularyFileText(text) {
  const entries = parseVocabularyText(text);
  if (!entries.length) throw new Error('没有识别到词条，请使用“英文 词性 中文”或“中文 — 英文”格式');
  return entries;
}
