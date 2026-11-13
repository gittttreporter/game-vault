// ── THE LIBRARY — client-rendered after Supabase auth ───────────────────────
import { requireAuth } from '../lib/auth.js';
import { fetchLibrary, fetchTags } from '../lib/data.js';
import { esc, humanSize, fmtDate, gameSearchScore, platformMeta } from '../lib/util.js';

const BASE = document.querySelector('meta[name="base-url"]')?.content || '/';

const state = {
  q: '',
  tags: new Set(),      // selected tag slugs
  tagMode: 'any',       // 'any' | 'all'
  platform: 'all',
  sort: 'title-asc',
  groupTag: '',
  games: [],
  allTags: [],
};

const $ = (id) => document.getElementById(id);

// ── URL sync (?q=&tag=a,b&mode=&platform=&sort=&group=) ─────────────────────
function readUrl() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.tagMode = p.get('mode') === 'all' ? 'all' : 'any';
  state.platform = p.get('platform') || 'all';
  state.sort = p.get('sort') || 'title-asc';
  state.groupTag = p.get('group') || '';
  (p.get('tag') || '').split(',').filter(Boolean).forEach((t) => state.tags.add(t));
}
function writeUrl() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.tags.size) p.set('tag', [...state.tags].join(','));
  if (state.tagMode !== 'any') p.set('mode', state.tagMode);
  if (state.platform !== 'all') p.set('platform', state.platform);
  if (state.sort !== 'title-asc') p.set('sort', state.sort);
  if (state.groupTag) p.set('group', state.groupTag);
  const qs = p.toString();
  history.replaceState(null, '', `${BASE}${qs ? '?' + qs : ''}`);
}

// ── filtering / sorting ─────────────────────────────────────────────────────
function hasPlatform(game, platformId) {
  if (platformId === 'all') return true;
  if ((game.platforms || []).includes(platformId)) return true;
  return (game.versions || []).some((v) => (v.downloads || []).some((d) => d.platform === platformId));
}

function matches(game) {
  // search
  const score = gameSearchScore(game, state.q);
  if (score < 0) return false;
  // tags
  if (state.tags.size) {
    const have = new Set(game.tags.map((t) => t.slug));
    const hits = [...state.tags].filter((t) => have.has(t)).length;
    if (state.tagMode === 'any' ? hits === 0 : hits !== state.tags.size) return false;
  }
  // platform
  if (!hasPlatform(game, state.platform)) return false;
  return score;
}

const latest = (g) => g.versions[0] || null;

function sortGames(list) {
  const arr = list.slice();
  switch (state.sort) {
    case 'title-desc':  arr.sort((a, b) => b.title.localeCompare(a.title)); break;
    case 'newest':      arr.sort((a, b) => (latest(b)?.release_date || '').localeCompare(latest(a)?.release_date || '')); break;
    case 'updated':     arr.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')); break;
    default:            arr.sort((a, b) => a.title.localeCompare(b.title));
  }
  return arr;
}

// ── rendering ───────────────────────────────────────────────────────────────
function tagChip(tag, active = false) {
  const style = tag.color ? `style="border-color:${esc(tag.color)}88;color:${esc(tag.color)}"` : '';
  return `<button class="chip ${active ? 'active' : ''}" data-tag-slug="${esc(tag.slug)}" ${style}>${esc(tag.name)}</button>`;
}

// inside a card we use spans (valid inside <a>) — the document-level click
// handler still intercepts them for filtering
function cardTagSpan(tag) {
  const style = tag.color ? `style="border-color:${esc(tag.color)}88;color:${esc(tag.color)}"` : '';
  return `<span class="chip" data-tag-slug="${esc(tag.slug)}" ${style}>${esc(tag.name)}</span>`;
}

function platformBadges(list) {
  return (list || []).map((id) => {
    const p = platformMeta(id);
    return `<span class="badge" style="color:${p.color}">${p.short}</span>`;
  }).join(' ');
}

function sizeSummary(v) {
  if (!v) return '—';
  const dls = v.downloads || [];
  if (!dls.length) return '—';
  const total = dls.reduce((s, d) => s + Number(d.file_size_bytes || 0), 0);
  return humanSize(total);
}

function card(game) {
  const v = latest(game);
  const stars = game.ratingAvg ? `${game.ratingAvg.toFixed(1)}★` : '';
  return `
  <a href="${BASE}game/?g=${encodeURIComponent(game.slug)}" class="panel flicker-in block overflow-hidden transition-transform hover:-translate-y-1 hover:border-[color:var(--color-neon-cyan)]">
    <div class="cover-frame">
      ${game.cover_url
        ? `<img src="${esc(game.cover_url)}" alt="${esc(game.title)} cover" loading="lazy" />`
        : `<div class="w-full h-full grid place-items-center heading-font text-3xl text-[color:var(--color-line)]">◈</div>`}
      ${v ? `<span class="absolute top-2 left-2 badge bg-[color:var(--color-void-deep)]/80" style="color:var(--color-neon-cyan)">v${esc(v.version_string)}</span>` : ''}
      ${stars ? `<span class="absolute top-2 right-2 badge bg-[color:var(--color-void-deep)]/80" style="color:var(--color-brass)">${stars}</span>` : ''}
    </div>
    <div class="p-3 space-y-2">
      <h3 class="heading-font text-sm font-bold text-white leading-snug">${esc(game.title)}</h3>
      <p class="text-xs text-[color:var(--color-ink-dim)] line-clamp-2 min-h-[2rem]">${esc((game.description || '').slice(0, 140))}</p>
      <div class="flex flex-wrap gap-1">${game.tags.slice(0, 4).map((t) => cardTagSpan(t)).join('')}</div>
      <div class="flex items-center justify-between pt-1 text-xs">
        <span>${platformBadges(game.platforms)}</span>
        <span class="text-[color:var(--color-ink-dim)]">${sizeSummary(v)}</span>
      </div>
      ${v ? `<div class="text-[10px] text-[color:var(--color-brass-dim)]">released ${fmtDate(v.release_date)}</div>` : ''}
    </div>
  </a>`;
}

function renderTagBar() {
  $('tag-chips').innerHTML = state.allTags.map((t) => tagChip(t, state.tags.has(t.slug))).join('');
  $('tag-mode').textContent = `match: ${state.tagMode.toUpperCase()}`;
  $('group-tag').innerHTML =
    `<option value="">Group: none</option>` +
    state.allTags.map((t) => `<option value="${esc(t.slug)}" ${state.groupTag === t.slug ? 'selected' : ''}>Group by: ${esc(t.name)}</option>`).join('');
}

function render() {
  const scored = state.games.map((g) => [g, matches(g)]).filter(([, ok]) => ok !== false);
  const filtered = sortGames(scored.map(([g]) => g));

  $('result-count').textContent = `${filtered.length} / ${state.games.length} cartridges online`;
  const empty = filtered.length === 0;
  const emptyEl = $('state-empty');
  emptyEl.classList.toggle('hidden', !empty);
  emptyEl.querySelector('p').textContent = !state.games.length
    ? '◇ the vault is empty — the archivist must insert cartridges via the admin console'
    : '◇ no cartridges match this query';
  $('grid').innerHTML = '';
  $('grouped').innerHTML = '';

  if (state.groupTag) {
    const tag = state.allTags.find((t) => t.slug === state.groupTag);
    const groupName = tag ? tag.name : state.groupTag;
    const with_ = filtered.filter((g) => g.tags.some((t) => t.slug === state.groupTag));
    const without = filtered.filter((g) => !g.tags.some((t) => t.slug === state.groupTag));
    $('grouped').innerHTML = `
      <section>
        <h2 class="heading-font text-sm glow-magenta mb-3">◆ ${esc(groupName)}</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">${with_.map(card).join('')}</div>
      </section>
      ${without.length ? `
      <section>
        <h2 class="heading-font text-sm text-[color:var(--color-ink-dim)] mb-3">◇ untagged</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">${without.map(card).join('')}</div>
      </section>` : ''}
    `;
  } else {
    $('grid').innerHTML = filtered.map(card).join('');
  }

  writeUrl();
}

// ── events ──────────────────────────────────────────────────────────────────
let searchTimer;
$('search').value = state.q;
$('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value; render(); }, 150);
});
$('platform').value = state.platform;
$('platform').addEventListener('change', (e) => { state.platform = e.target.value; render(); });
$('sort').value = state.sort;
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('group-tag').addEventListener('change', (e) => { state.groupTag = e.target.value; render(); });
$('tag-mode').addEventListener('click', () => {
  state.tagMode = state.tagMode === 'any' ? 'all' : 'any';
  renderTagBar(); render();
});
$('tag-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag-slug]');
  if (!btn) return;
  const slug = btn.dataset.tagSlug;
  state.tags.has(slug) ? state.tags.delete(slug) : state.tags.add(slug);
  renderTagBar(); render();
});
// tags rendered inside cards link back to filtering
document.addEventListener('click', (e) => {
  const chip = e.target.closest('#grid [data-tag-slug], #grouped [data-tag-slug]');
  if (!chip) return;
  e.preventDefault();
  e.stopPropagation();
  const slug = chip.dataset.tagSlug;
  state.tags.has(slug) ? state.tags.delete(slug) : state.tags.add(slug);
  renderTagBar(); render();
});

// ── boot ────────────────────────────────────────────────────────────────────
(async () => {
  await requireAuth();
  readUrl();
  try {
    const [games, tags] = await Promise.all([fetchLibrary(), fetchTags()]);
    state.games = games;
    state.allTags = tags;
    $('controls').classList.remove('hidden');
    renderTagBar();
    $('platform').value = state.platform;
    $('sort').value = state.sort;
    $('search').value = state.q;
    render();
    $('state-loading').classList.add('hidden');
  } catch (err) {
    console.error(err);
    $('state-loading').classList.add('hidden');
    $('state-error').classList.remove('hidden');
    $('error-detail').textContent = err.message;
  }
})();
