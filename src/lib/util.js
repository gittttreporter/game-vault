// Shared formatting + domain helpers.

export const PLATFORMS = [
  { id: 'windows', label: 'Windows', short: 'WIN', color: '#00e5ff' },
  { id: 'linux',   label: 'Linux',   short: 'LNX', color: '#39ff8e' },
  { id: 'macos',   label: 'macOS',   short: 'MAC', color: '#c9a227' },
  { id: 'android', label: 'Android', short: 'AND', color: '#ff2bd6' },
  { id: 'source',  label: 'Source',  short: 'SRC', color: '#7d8aa0' },
];

export const platformMeta = (id) =>
  PLATFORMS.find((p) => p.id === id) || { id, label: id, short: id.slice(0, 3).toUpperCase(), color: '#7d8aa0' };

export const PROVIDERS = [
  { id: 'github',    label: 'GitHub',    color: '#00e5ff' },
  { id: 'mediafire', label: 'MediaFire', color: '#ff2bd6' },
];

export const providerMeta = (id) =>
  PROVIDERS.find((p) => p.id === id) || { id, label: id, color: '#7d8aa0' };

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
export function humanSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  let n = Number(bytes), u = 0;
  while (n >= 1024 && u < UNITS.length - 1) { n /= 1024; u++; }
  return `${n >= 100 ? Math.round(n) : n.toFixed(n >= 10 ? 1 : 2)} ${UNITS[u]}`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toISOString().slice(0, 10);
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Minimal, safe markdown renderer for changelogs (no raw HTML passes through). */
export function mdToHtml(md) {
  const lines = esc(md).split(/\r?\n/);
  const out = [];
  let inList = false;
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      else if (line.trim() === '') out.push('');
      else out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

/**
 * Fuzzy scorer: every whitespace-separated term must match somewhere in the
 * haystack (subsequence match, greedy). Higher score = better match.
 * Returns -1 when the haystack does not match.
 */
export function fuzzyScore(haystack, query) {
  const hay = haystack.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  let total = 0;
  for (const term of terms) {
    // direct substring beats subsequence
    const idx = hay.indexOf(term);
    if (idx >= 0) { total += 100 - Math.min(idx, 50); continue; }
    // subsequence fallback
    let pos = 0, matched = '';
    for (const ch of term) {
      const found = hay.indexOf(ch, pos);
      if (found === -1) { matched = null; break; }
      matched += ch;
      pos = found + 1;
    }
    if (matched === null) return -1;
    total += 20;
  }
  return total;
}

/** Scores a game against a search query using title > tags > description. */
export function gameSearchScore(game, query) {
  if (!query.trim()) return 0;
  const tagText = (game.tags || []).map((t) => t.name).join(' ');
  const titleScore = fuzzyScore(game.title, query);
  const tagScore = fuzzyScore(tagText, query);
  const descScore = fuzzyScore(game.description || '', query);
  const best = Math.max(titleScore, tagScore * 0.6, descScore * 0.3);
  return best < 0 ? -1 : best;
}

/** Parse "name | url | size_bytes" lines into the parts jsonb shape. */
export function parseParts(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [name, url, size] = line.split('|').map((s) => s.trim());
      return { name: name || `part ${i + 1}`, url: url || '', size_bytes: Number(size) || 0 };
    })
    .filter((p) => p.url);
}

/** Inverse: parts jsonb → textarea lines. */
export function partsToText(parts) {
  return (parts || [])
    .map((p) => `${p.name} | ${p.url} | ${p.size_bytes ?? ''}`)
    .join('\n');
}

export function toast(msg, kind = 'ok') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.cssText = 'position:fixed;bottom:1.25rem;right:1.25rem;z-index:99;display:flex;flex-direction:column;gap:.5rem;max-width:22rem;';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'panel px-4 py-2 text-sm flicker-in';
  el.style.borderColor = kind === 'err' ? '#ff5252' : kind === 'info' ? '#00e5ff' : '#39ff8e';
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3200);
  setTimeout(() => el.remove(), 3700);
}
