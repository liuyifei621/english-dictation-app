const cache = new Map();

export async function findEnglishAudio(word) {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
    if (!response.ok) return null;
    const entries = await response.json();
    const audio = entries.flatMap((entry) => entry.phonetics || []).map((item) => item.audio).find(Boolean);
    const url = audio ? (audio.startsWith('//') ? `https:${audio}` : audio) : null;
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
