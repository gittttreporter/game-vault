// ── GAME DETAIL — full version history, downloads, rating, comments ─────────
import { requireAuth } from '../lib/auth.js';
import { fetchGame, logDownload, fetchMyRating, saveRating } from '../lib/data.js';
import { GISCUS } from '../lib/config.js';
import { esc, humanSize, fmtDate, mdToHtml, platformMeta, providerMeta } from '../lib/util.js';

const BASE = document.querySelector('meta[name="base-url"]')?.content || '/';
const $ = (id) => document.getElementById(id);
let game = null;

// ── download buttons ────────────────────────────────────────────────────────
function providerBadge(provider) {
  const p = providerMeta(provider);
  return `<span class="badge" style="color:${p.color}">${esc(p.label)}</span>`;
}

function downloadRow(d) {
  const p = platformMeta(d.platform);
  const mediafireNote = d.provider === 'mediafire'
    ? `<span class="text-[10px] text-[color:var(--color-ink-dim)]">↪ opens the MediaFire page — one extra click there</span>`
    : '';
  return `
  <div class="flex flex-wrap items-center gap-2 border border-[color:var(--color-line)] bg-[color:var(--color-void-deep)] px-3 py-2">
    <span class="badge" style="color:${p.color}">${esc(p.label)}</span>
    ${providerBadge(d.provider)}
    <span class="text-xs text-[color:var(--color-ink-dim)]">${humanSize(d.file_size_bytes)}</span>
    ${d.sha256 ? `<span class="text-[10px] text-[color:var(--color-ink-dim)]">sha256: <code class="text-[color:var(--color-neon-green)]">${esc(d.sha256.slice(0, 12))}…</code> <button class="btn btn-sm btn-brass" data-copy="${esc(d.sha256)}">copy</button></span>` : ''}
    ${mediafireNote}
    <button class="btn btn-sm btn-cyan ml-auto" data-dl-id="${d.id}" data-dl-url="${esc(d.url)}">
      ⬇ ${d.provider === 'mediafire' ? 'Download from MediaFire' : 'Download'}
    </button>
  </div>`;
}

function partsList(d) {
  const parts = d.parts || [];
  if (!d.is_multi_part || !parts.length) return '';
  return `
  <div class="mt-1 ml-3 border-l border-dashed border-[color:var(--color-brass-dim)] pl-3 space-y-1">
    <div class="heading-font text-[10px] uppercase tracking-widest text-[color:var(--color-brass)]">multi-part archive — download ALL parts</div>
    ${parts.map((p, i) => `
      <div class="flex items-center gap-2 text-xs">
        <span class="text-[color:var(--color-ink-dim)]">part ${i + 1}:</span>
        <span>${esc(p.name || `part ${i + 1}`)}</span>
        ${p.size_bytes ? `<span class="text-[color:var(--color-ink-dim)]">(${humanSize(p.size_bytes)})</span>` : ''}
        <button class="btn btn-sm btn-magenta" data-dl-id="${d.id}" data-dl-url="${esc(p.url)}">⬇ get part</button>
      </div>`).join('')}
  </div>`;
}

function versionBlock(v) {
  return `
  <article class="panel ${v.is_latest ? 'panel-brass' : ''} p-5 flicker-in">
    <header class="flex flex-wrap items-center gap-3 mb-3">
      <h3 class="heading-font text-lg font-bold ${v.is_latest ? 'glow-cyan' : 'text-white'}">v${esc(v.version_string)}</h3>
      ${v.is_latest ? `<span class="badge" style="color:var(--color-neon-green)">LATEST</span>` : ''}
      <span class="text-xs text-[color:var(--color-ink-dim)]">released ${fmtDate(v.release_date)}</span>
    </header>
    ${v.changelog ? `<div class="changelog text-sm text-[color:var(--color-ink)] mb-4">${mdToHtml(v.changelog)}</div>` : ''}
    ${(v.downloads || []).length
      ? v.downloads.map((d) => downloadRow(d) + partsList(d)).join('')
      : `<p class="text-sm text-[color:var(--color-ink-dim)]">no files published for this version</p>`}
  </article>`;
}

// ── main detail view ────────────────────────────────────────────────────────
function render() {
  const links = game.external_links || {};
  const linkBtn = (url, label) => url
    ? `<a class="btn btn-sm btn-magenta" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>` : '';

  $('detail').innerHTML = `
  <div class="grid gap-6 md:grid-cols-[minmax(0,16rem)_1fr] mt-2 flicker-in">
    <div class="panel p-2">
      <div class="cover-frame">
        ${game.cover_url
          ? `<img src="${esc(game.cover_url)}" alt="${esc(game.title)} cover" />`
          : `<div class="w-full h-full grid place-items-center heading-font text-5xl text-[color:var(--color-line)]">◈</div>`}
      </div>
    </div>
    <div class="space-y-3">
      <div class="flex flex-wrap items-baseline gap-3">
        <h1 class="heading-font text-3xl font-black glow-cyan">${esc(game.title)}</h1>
        <span class="text-sm text-[color:var(--color-brass)]">
          ${game.ratingAvg ? `★ ${game.ratingAvg.toFixed(1)} <span class="text-[color:var(--color-ink-dim)]">(${game.ratingCount})</span>` : ''}
        </span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${game.tags.map((t) => `<a class="chip" href="${BASE}?tag=${encodeURIComponent(t.slug)}" style="${t.color ? `border-color:${esc(t.color)}88;color:${esc(t.color)}` : ''}">${esc(t.name)}</a>`).join('')}
      </div>
      <p class="text-sm whitespace-pre-line text-[color:var(--color-ink)] leading-relaxed">${esc(game.description)}</p>
      <div class="flex flex-wrap gap-2 pt-1">
        ${linkBtn(links.itch, 'itch.io')}${linkBtn(links.steam, 'Steam')}${linkBtn(links.trailer, 'Trailer')}
      </div>
      <div class="panel p-3 inline-block">
        <span class="heading-font text-[10px] uppercase tracking-widest text-[color:var(--color-ink-dim)] block mb-1">Your rating</span>
        <div id="stars" class="flex gap-1">
          ${[1, 2, 3, 4, 5].map((n) => `<span class="star" data-star="${n}" title="${n} star${n > 1 ? 's' : ''}">★</span>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="rule-brass my-6"></div>
  <h2 class="heading-font text-lg glow-magenta mb-4">◇ VERSION HISTORY</h2>
  <div class="space-y-4">${game.versions.map(versionBlock).join('') || '<p class="text-sm text-[color:var(--color-ink-dim)]">no versions published yet</p>'}</div>`;

  // gallery
  const shots = game.screenshots || [];
  if (shots.length) {
    $('gallery').classList.remove('hidden');
    $('gallery').innerHTML = `
      <h2 class="heading-font text-lg glow-magenta mb-4">◈ SCREENSHOTS</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        ${shots.map((s) => `<a class="panel overflow-hidden" href="${esc(s)}" target="_blank" rel="noopener"><img src="${esc(s)}" alt="screenshot" loading="lazy" class="w-full h-40 object-cover hover:scale-105 transition-transform" /></a>`).join('')}
      </div>`;
  }

  wireStars();
  wireDownloads();
  mountGiscus();
}

// ── interactions ────────────────────────────────────────────────────────────
let myRating = 0;

function paintStars() {
  document.querySelectorAll('#stars .star').forEach((el) => {
    el.classList.toggle('lit', Number(el.dataset.star) <= myRating);
  });
}

function wireStars() {
  paintStars();
  const box = $('stars');
  box.addEventListener('mouseover', (e) => {
    const s = e.target.closest('[data-star]');
    if (!s) return;
    document.querySelectorAll('#stars .star').forEach((el) =>
      el.classList.toggle('lit', Number(el.dataset.star) <= Number(s.dataset.star)));
  });
  box.addEventListener('mouseout', paintStars);
  box.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-star]');
    if (!s) return;
    const score = Number(s.dataset.star);
    try {
      await saveRating(game.id, score);
      myRating = score;
      paintStars();
      location.reload(); // re-fetches the fresh average
    } catch (err) {
      alert('Rating failed: ' + err.message);
    }
  });
}

function wireDownloads() {
  $('detail').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      await navigator.clipboard.writeText(copyBtn.dataset.copy);
      copyBtn.textContent = '✓';
      setTimeout(() => (copyBtn.textContent = 'copy'), 1200);
      return;
    }
    const btn = e.target.closest('[data-dl-id]');
    if (!btn) return;
    e.preventDefault();
    await logDownload(btn.dataset.dlId); // fire & forget log
    window.open(btn.dataset.dlUrl, '_blank', 'noopener');
  });
}

function mountGiscus() {
  if (!GISCUS.repo || !GISCUS.repoId || !GISCUS.categoryId) {
    $('comments').innerHTML =
      `<p class="heading-font text-sm text-[color:var(--color-ink-dim)] mb-2">◈ TRANSMISSION LOG</p>
       <p class="text-xs text-[color:var(--color-ink-dim)]">comments disabled — giscus not configured (see README §Giscus)</p>`;
    return;
  }
  $('comments').innerHTML =
    `<p class="heading-font text-sm glow-magenta mb-4">◈ TRANSMISSION LOG</p>
     <div id="giscus-mount"></div>`;
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  s.setAttribute('data-repo', GISCUS.repo);
  s.setAttribute('data-repo-id', GISCUS.repoId);
  s.setAttribute('data-category', 'Announcements');
  s.setAttribute('data-category-id', GISCUS.categoryId);
  s.setAttribute('data-mapping', 'specific');
  s.setAttribute('data-term', game.id);
  s.setAttribute('data-strict', '1');
  s.setAttribute('data-reactions-enabled', '1');
  s.setAttribute('data-emit-metadata', '0');
  s.setAttribute('data-input-position', 'top');
  s.setAttribute('data-theme', 'dark_dimmed');
  s.setAttribute('data-lang', 'en');
  s.setAttribute('data-loading', 'lazy');
  s.crossOrigin = 'anonymous';
  s.async = true;
  $('giscus-mount').appendChild(s);
}

// ── boot ────────────────────────────────────────────────────────────────────
(async () => {
  await requireAuth();
  const slug = new URLSearchParams(location.search).get('g');
  if (!slug) {
    location.replace(BASE);
    return;
  }
  try {
    game = await fetchGame(slug);
    $('state-loading').classList.add('hidden');
    if (!game) {
      $('state-error').classList.remove('hidden');
      $('error-detail').textContent = `no cartridge with id "${slug}" in the vault`;
      return;
    }
    document.title = `${game.title} · THE VAULT`;
    try { myRating = await fetchMyRating(game.id); } catch { /* non-fatal */ }
    render();
  } catch (err) {
    console.error(err);
    $('state-loading').classList.add('hidden');
    $('state-error').classList.remove('hidden');
    $('error-detail').textContent = err.message;
  }
})();
