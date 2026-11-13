// ── ARCHIVIST CONSOLE — full CRUD for games / versions / downloads ──────────
import { requireAuth, getProfile } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { fetchTags, fetchAdminLibrary } from '../lib/data.js';
import {
  esc, humanSize, fmtDate, slugify, toast,
  PLATFORMS, PROVIDERS, parseParts, partsToText,
} from '../lib/util.js';

const $ = (id) => document.getElementById(id);
const BASE = document.querySelector('meta[name="base-url"]')?.content || '/';

const S = {
  games: [],
  tags: [],
  editingGameId: null,   // null = creating
  editingVersionId: null,
  pickedTagNames: new Set(),
  currentVersionsGameId: null,
};

/* ─────────────────────────── boot / guard ────────────────────────────────── */
(async () => {
  const session = await requireAuth();
  if (!session) return;
  const profile = await getProfile(session.user.id);
  $('guard-checking').classList.add('hidden');
  if (!profile?.is_admin) {
    $('guard-denied').classList.remove('hidden');
    return;
  }
  $('console').classList.remove('hidden');
  await reloadAll();
  wireGlobalEvents();
})();

async function reloadAll() {
  const [games, tags] = await Promise.all([fetchAdminLibrary(), fetchTags()]);
  S.games = games;
  S.tags = tags;
  renderGameList();
  renderGameForm(null);
  renderVersionTab();
  renderLogs();
}

/* ─────────────────────────── tabs ────────────────────────────────────────── */
function wireGlobalEvents() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  showTab('games');
}

function showTab(name) {
  ['games', 'versions', 'logs'].forEach((t) => $(`tab-${t}`).classList.toggle('hidden', t !== name));
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const active = b.dataset.tab === name;
    b.classList.toggle('btn-cyan', active);
  });
  if (name === 'logs') renderLogs();
  if (name === 'versions') renderVersionTab();
}

/* ─────────────────────────── GAMES tab ───────────────────────────────────── */
function renderGameList() {
  $('game-list').innerHTML = S.games.map((g) => `
    <li class="flex items-center gap-2 border border-[color:var(--color-line)] px-2 py-1.5">
      <button class="flex-1 text-left text-sm hover:text-[color:var(--color-neon-cyan)]" data-edit-game="${g.id}">
        ${g.cover_url ? `<img src="${esc(g.cover_url)}" class="inline w-6 h-8 object-cover mr-1 align-middle" alt=""/>` : ''}
        ${esc(g.title)}
      </button>
      <button class="btn btn-sm btn-magenta" data-announce="${g.id}" title="Announce on Discord">📣</button>
      <button class="btn btn-sm btn-danger" data-del-game="${g.id}" title="Delete">✖</button>
    </li>`).join('') || '<li class="text-xs text-[color:var(--color-ink-dim)]">catalog empty</li>';
}

function renderGameForm(game) {
  S.editingGameId = game?.id ?? null;
  S.pickedTagNames = new Set(game ? game.tags.map((t) => t.name) : []);
  $('game-form-title').textContent = game ? `EDIT — ${game.title}` : 'NEW GAME';
  $('g-title').value = game?.title || '';
  $('g-slug').value = game?.slug || '';
  $('g-desc').value = game?.description || '';
  document.querySelectorAll('#g-platforms input').forEach((cb) => {
    cb.checked = game?.platforms?.includes(cb.value) || false;
  });
  const links = game?.external_links || {};
  $('g-itch').value = links.itch || '';
  $('g-steam').value = links.steam || '';
  $('g-trailer').value = links.trailer || '';
  $('g-cover-url').value = game?.cover_url || '';
  $('g-cover-file').value = '';
  $('g-shots').value = (game?.screenshots || []).join('\n');
  $('g-tag-input').value = '';
  $('tag-datalist').innerHTML = S.tags.map((t) => `<option value="${esc(t.name)}"></option>`).join('');
  renderPickedTags();
}

function renderPickedTags() {
  $('g-tag-chips').innerHTML = [...S.pickedTagNames].map((name) =>
    `<span class="chip active">${esc(name)} <button data-untag="${esc(name)}" title="remove">✖</button></span>`).join('');
}

function renderVersionTab() {
  const opts = S.games.map((g) =>
    `<option value="${g.id}" ${g.id === S.currentVersionsGameId ? 'selected' : ''}>${esc(g.title)}</option>`).join('');
  $('v-game').innerHTML = opts || '<option value="">— create a game first —</option>';
  if (!S.currentVersionsGameId && S.games.length) S.currentVersionsGameId = S.games[0].id;
  if (S.currentVersionsGameId) $('v-game').value = S.currentVersionsGameId;
  renderVersionsList();
}

const currentGame = () => S.games.find((g) => g.id === S.currentVersionsGameId) || null;

function renderVersionsList() {
  const game = currentGame();
  if (!game) { $('versions-list').innerHTML = ''; return; }
  $('versions-list').innerHTML = game.versions.map((v) => `
  <details class="panel ${v.is_latest ? 'panel-brass' : ''}" open>
    <summary class="flex flex-wrap items-center gap-3 cursor-pointer px-4 py-3">
      <span class="heading-font font-bold ${v.is_latest ? 'glow-cyan' : ''}">v${esc(v.version_string)}</span>
      ${v.is_latest ? `<span class="badge" style="color:var(--color-neon-green)">latest</span>` : ''}
      <span class="text-xs text-[color:var(--color-ink-dim)]">${fmtDate(v.release_date)} · ${(v.downloads || []).length} file(s)</span>
      <span class="ml-auto flex gap-2">
        <button class="btn btn-sm" data-edit-version="${v.id}">edit</button>
        <button class="btn btn-sm btn-danger" data-del-version="${v.id}">✖</button>
      </span>
    </summary>
    <div class="px-4 pb-4 space-y-2">
      ${(v.downloads || []).map((d) => `
        <div class="flex flex-wrap items-center gap-2 border border-[color:var(--color-line)] bg-[color:var(--color-void-deep)] px-3 py-2 text-sm">
          <span class="badge" style="color:var(--color-neon-cyan)">${esc(d.platform)}</span>
          <span class="badge" style="color:${d.provider === 'mediafire' ? 'var(--color-neon-magenta)' : 'var(--color-neon-cyan)'}">${esc(d.provider)}</span>
          <span class="text-xs text-[color:var(--color-ink-dim)]">${humanSize(d.file_size_bytes)}</span>
          ${d.is_multi_part ? `<span class="text-[10px] text-[color:var(--color-brass)]">multi-part ×${(d.parts || []).length}</span>` : ''}
          <a class="text-xs text-[color:var(--color-ink-dim)] truncate max-w-xs" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>
          <span class="ml-auto flex gap-2">
            <button class="btn btn-sm" data-edit-download="${d.id}" data-version="${v.id}">edit</button>
            <button class="btn btn-sm btn-danger" data-del-download="${d.id}">✖</button>
          </span>
        </div>`).join('') || '<p class="text-xs text-[color:var(--color-ink-dim)]">no files yet</p>'}
      <button class="btn btn-sm btn-cyan" data-add-download="${v.id}">＋ add download file</button>
    </div>
  </details>`).join('') || '<p class="text-xs text-[color:var(--color-ink-dim)]">no versions yet</p>';
}

/* ─────────────────────────── LOGS tab ────────────────────────────────────── */
async function renderLogs() {
  const { data, error } = await supabase
    .from('user_downloads')
    .select(`
      id, downloaded_at,
      user:profiles ( display_name ),
      download:downloads ( platform, provider, file_size_bytes,
        version:game_versions ( version_string, game:games ( title ) ) )
    `)
    .order('downloaded_at', { ascending: false })
    .limit(300);

  if (error) {
    $('logs-body').innerHTML = `<tr><td colspan="7" class="py-4 text-[color:var(--color-neon-magenta)]">log load failed: ${esc(error.message)}</td></tr>`;
    return;
  }
  $('logs-body').innerHTML = (data || []).map((r) => {
    const d = r.download || {};
    const v = d.version || {};
    const g = v.game || {};
    return `
    <tr class="border-b border-[color:var(--color-line)]/50">
      <td class="py-2 pr-4 text-xs text-[color:var(--color-ink-dim)]">${fmtDate(r.downloaded_at)} ${r.downloaded_at.slice(11, 16)}</td>
      <td class="pr-4">${esc(r.user?.display_name || '—')}</td>
      <td class="pr-4">${esc(g.title || '—')}</td>
      <td class="pr-4">v${esc(v.version_string || '—')}</td>
      <td class="pr-4">${esc(d.platform || '—')}</td>
      <td class="pr-4">${esc(d.provider || '—')}</td>
      <td>${humanSize(d.file_size_bytes)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="py-4 text-[color:var(--color-ink-dim)]">no downloads recorded yet</td></tr>';
}

/* ─────────────────────────── mutations: games ────────────────────────────── */
async function uploadCover(gameId, file) {
  const path = `${gameId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '-')}`;
  const { error } = await supabase.storage.from('covers').upload(path, file, { upsert: true });
  if (error) throw new Error('cover upload: ' + error.message);
  const { data } = supabase.storage.from('covers').getPublicUrl(path);
  return data.publicUrl;
}

async function ensureTag(name) {
  const existing = S.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const { data, error } = await supabase
    .from('tags').insert({ name, slug: slugify(name) }).select().single();
  if (error) throw new Error('tag: ' + error.message);
  S.tags.push(data);
  return data;
}

async function syncGameTags(gameId) {
  const ids = [];
  for (const name of S.pickedTagNames) {
    const tag = await ensureTag(name);
    ids.push(tag.id);
  }
  const { error: del } = await supabase.from('game_tags').delete().eq('game_id', gameId);
  if (del) throw new Error('tag unlink: ' + del.message);
  if (ids.length) {
    const { error: ins } = await supabase
      .from('game_tags').insert(ids.map((tag_id) => ({ game_id: gameId, tag_id })));
    if (ins) throw new Error('tag link: ' + ins.message);
  }
}

async function saveGame(e) {
  e.preventDefault();
  const title = $('g-title').value.trim();
  if (!title) return;
  const payload = {
    title,
    slug: slugify($('g-slug').value.trim() || title),
    description: $('g-desc').value,
    platforms: [...document.querySelectorAll('#g-platforms input:checked')].map((cb) => cb.value),
    external_links: {
      itch: $('g-itch').value.trim() || null,
      steam: $('g-steam').value.trim() || null,
      trailer: $('g-trailer').value.trim() || null,
    },
    cover_url: $('g-cover-url').value.trim() || null,
    screenshots: $('g-shots').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
  };

  try {
    let gameId = S.editingGameId;
    if (gameId) {
      const { error } = await supabase.from('games').update(payload).eq('id', gameId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('games').insert(payload).select().single();
      if (error) throw error;
      gameId = data.id;
    }

    const file = $('g-cover-file').files[0];
    if (file) {
      const url = await uploadCover(gameId, file);
      await supabase.from('games').update({ cover_url: url }).eq('id', gameId);
    }

    await syncGameTags(gameId);
    toast('✔ game saved');
    await reloadAll();
  } catch (err) {
    toast('✖ ' + err.message, 'err');
  }
}

async function deleteGame(id) {
  const g = S.games.find((x) => x.id === id);
  if (!g || !confirm(`Delete "${g.title}" and ALL its versions, files, ratings and logs? This cannot be undone.`)) return;
  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) return toast('✖ ' + error.message, 'err');
  toast('✔ game deleted');
  if (S.currentVersionsGameId === id) S.currentVersionsGameId = null;
  await reloadAll();
}

async function announceGame(id) {
  const g = S.games.find((x) => x.id === id);
  if (!g) return;
  try {
    const { error } = await supabase.functions.invoke('notify-new-game', {
      body: {
        game: {
          title: g.title,
          slug: g.slug,
          description: g.description,
          version: g.versions[0]?.version_string || null,
          tags: g.tags.map((t) => t.name),
        },
      },
    });
    if (error) throw error;
    toast('📣 announcement dispatched');
  } catch (err) {
    toast('✖ announce: ' + err.message, 'err');
  }
}

/* ─────────────────────────── mutations: versions ─────────────────────────── */
function renderVersionForm(version) {
  S.editingVersionId = version?.id ?? null;
  $('version-form-title').textContent = version
    ? `EDIT VERSION — v${version.version_string}` : 'NEW VERSION';
  $('v-string').value = version?.version_string || '';
  $('v-date').value = version?.release_date || new Date().toISOString().slice(0, 10);
  $('v-changelog').value = version?.changelog || '';
  $('version-editor').classList.remove('hidden');
  $('version-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveVersion(e) {
  e.preventDefault();
  const game = currentGame();
  if (!game) return toast('✖ pick a game first', 'err');
  const payload = {
    game_id: game.id,
    version_string: $('v-string').value.trim(),
    release_date: $('v-date').value || null,
    changelog: $('v-changelog').value,
  };
  try {
    if (S.editingVersionId) {
      const { error } = await supabase.from('game_versions').update(payload).eq('id', S.editingVersionId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('game_versions').insert(payload);
      if (error) throw error;
    }
    toast('✔ version saved (is_latest auto-managed)');
    $('version-editor').classList.add('hidden');
    S.editingVersionId = null;
    await reloadAll();
  } catch (err) {
    toast('✖ ' + err.message, 'err');
  }
}

async function deleteVersion(id) {
  if (!confirm('Delete this version and all its download entries?')) return;
  const { error } = await supabase.from('game_versions').delete().eq('id', id);
  if (error) return toast('✖ ' + error.message, 'err');
  toast('✔ version deleted');
  await reloadAll();
}

/* ─────────────────────────── mutations: downloads ────────────────────────── */
function downloadFormHtml(version, existing) {
  const platformOpts = PLATFORMS.map((p) =>
    `<option value="${p.id}" ${existing?.platform === p.id ? 'selected' : ''}>${p.label}</option>`).join('');
  const providerOpts = PROVIDERS.map((p) =>
    `<option value="${p.id}" ${existing?.provider === p.id ? 'selected' : ''}>${p.label}${p.id === 'github' ? ' (≤ 2 GB)' : ' (> 2 GB)'}</option>`).join('');
  return `
  <form class="dl-form panel panel-brass p-4 space-y-3" data-version="${version.id}">
    <div class="grid gap-3 sm:grid-cols-3">
      <div><label class="lbl">Platform</label><select class="input" name="platform">${platformOpts}</select></div>
      <div><label class="lbl">Provider</label><select class="input" name="provider">${providerOpts}</select></div>
      <div><label class="lbl">File size (bytes)</label><input class="input" name="size" type="number" min="0" step="1" value="${existing?.file_size_bytes ?? ''}" placeholder="e.g. 5368709120" /></div>
    </div>
    <div><label class="lbl">URL * — GitHub release asset link, or MediaFire page link</label>
      <input class="input" name="url" type="url" required value="${esc(existing?.url || '')}" placeholder="https://…" /></div>
    <div><label class="lbl">SHA256 (optional)</label><input class="input" name="sha256" value="${esc(existing?.sha256 || '')}" /></div>
    <div><label class="lbl">Parts — multi-part archives: one per line  name | url | size_bytes</label>
      <textarea class="input" name="parts" rows="3" placeholder="part1 | https://… | 4294967296">${esc(partsToText(existing?.parts))}</textarea></div>
    <div class="flex gap-2">
      <button type="submit" class="btn btn-cyan">⌘ ${existing ? 'Save file' : 'Add file'}</button>
      <button type="button" class="btn btn-cancel-dl">cancel</button>
    </div>
  </form>`;
}

async function saveDownload(formEl, versionId, downloadId) {
  const f = new FormData(formEl);
  const payload = {
    version_id: versionId,
    platform: f.get('platform'),
    provider: f.get('provider'),
    url: f.get('url'),
    file_size_bytes: Number(f.get('size')) || 0,
    sha256: f.get('sha256') || null,
    parts: parseParts(f.get('parts')),
  };
  try {
    if (downloadId) {
      const { error } = await supabase.from('downloads').update(payload).eq('id', downloadId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('downloads').insert(payload);
      if (error) throw error;
    }
    toast('✔ download entry saved');
    await reloadAll();
  } catch (err) {
    toast('✖ ' + err.message, 'err');
  }
}

async function deleteDownload(id) {
  if (!confirm('Delete this download entry?')) return;
  const { error } = await supabase.from('downloads').delete().eq('id', id);
  if (error) return toast('✖ ' + error.message, 'err');
  toast('✔ deleted');
  await reloadAll();
}

/* ─────────────────────────── global event wiring ─────────────────────────── */
document.addEventListener('submit', (e) => {
  if (e.target.id === 'game-form') return saveGame(e);
  if (e.target.id === 'version-form') return saveVersion(e);
  if (e.target.classList.contains('dl-form')) {
    e.preventDefault();
    return saveDownload(e.target, e.target.dataset.version, e.target.dataset.downloadId || null);
  }
});

document.addEventListener('click', async (e) => {
  const t = e.target;

  // buttons inside a <summary> must not toggle the surrounding <details>
  if (t.closest('summary') && t.closest('button')) e.preventDefault();

  // tag picking
  const untag = t.closest('[data-untag]');
  if (untag) { S.pickedTagNames.delete(untag.dataset.untag); renderPickedTags(); return; }

  // game list actions
  const editGame = t.closest('[data-edit-game]');
  if (editGame) {
    showTab('games');
    renderGameForm(S.games.find((g) => g.id === editGame.dataset.editGame));
    $('game-form').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const delGame = t.closest('[data-del-game]');
  if (delGame) return deleteGame(delGame.dataset.delGame);
  const announce = t.closest('[data-announce]');
  if (announce) return announceGame(announce.dataset.announce);
  if (t.closest('#btn-new-game')) return renderGameForm(null);

  // version tab actions
  const editVersion = t.closest('[data-edit-version]');
  if (editVersion) {
    const v = currentGame()?.versions.find((x) => x.id === editVersion.dataset.editVersion);
    if (v) renderVersionForm(v);
    return;
  }
  const delVersion = t.closest('[data-del-version]');
  if (delVersion) return deleteVersion(delVersion.dataset.delVersion);
  if (t.closest('#btn-new-version')) return renderVersionForm(null);
  if (t.closest('#v-reset')) { $('version-editor').classList.add('hidden'); return; }
  if (t.closest('#g-reset')) return renderGameForm(null);
  const addDl = t.closest('[data-add-download]');
  if (addDl) {
    addDl.insertAdjacentHTML('afterend', downloadFormHtml({ id: addDl.dataset.addDownload }, null));
    const form = addDl.nextElementSibling;
    form.querySelector('.btn-cancel-dl').addEventListener('click', () => form.remove());
    return;
  }
  const editDl = t.closest('[data-edit-download]');
  if (editDl) {
    const v = currentGame()?.versions.find((x) => x.id === editDl.dataset.version);
    const d = v?.downloads.find((x) => x.id === editDl.dataset.editDownload);
    if (d) {
      editDl.closest('div.flex').insertAdjacentHTML('afterend', downloadFormHtml(v, d));
      const form = editDl.closest('div.flex').nextElementSibling;
      form.dataset.downloadId = d.id;
      form.dataset.version = v.id;
      form.querySelector('.btn-cancel-dl').addEventListener('click', () => form.remove());
    }
    return;
  }
  const delDl = t.closest('[data-del-download]');
  if (delDl) return deleteDownload(delDl.dataset.delDownload);
});

// slug auto-fill + tag input
document.addEventListener('input', (e) => {
  if (e.target.id === 'g-title' && !S.editingGameId) {
    $('g-slug').placeholder = slugify(e.target.value) || 'auto-from-title';
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'v-game') {
    S.currentVersionsGameId = e.target.value || null;
    renderVersionsList();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'g-tag-input' && e.key === 'Enter') {
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name) return;
    S.pickedTagNames.add(name);
    e.target.value = '';
    renderPickedTags();
  }
});
