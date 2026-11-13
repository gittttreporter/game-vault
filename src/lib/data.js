// Data access layer — all queries go through Supabase with RLS enforced
// server-side, so unauthenticated visitors get empty/error results by design.
import { supabase } from './supabase.js';

const GAME_SELECT = `
  id, title, slug, description, cover_url, screenshots, platforms,
  external_links, created_at, updated_at,
  game_tags ( tag:tags ( id, name, slug, color ) ),
  game_versions (
    id, version_string, changelog, release_date, is_latest, created_at,
    downloads (
      id, platform, provider, url, file_size_bytes, sha256,
      is_multi_part, parts, created_at
    )
  ),
  ratings ( score, user_id )
`;

function shapeGame(row) {
  return {
    ...row,
    tags: (row.game_tags || []).map((t) => t.tag).filter(Boolean),
    versions: (row.game_versions || [])
      .slice()
      .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '') || (b.created_at || '').localeCompare(a.created_at || '')),
    ratingCount: (row.ratings || []).length,
    ratingAvg: (row.ratings || []).length
      ? row.ratings.reduce((s, r) => s + r.score, 0) / row.ratings.length
      : null,
    updated_at: row.updated_at,
  };
}

/** Every game with tags, full version history, downloads and rating stats. */
export async function fetchLibrary() {
  const { data, error } = await supabase.from('games').select(GAME_SELECT).order('title');
  if (error) throw error;
  return (data || []).map(shapeGame);
}

/** One game by slug (same shape as fetchLibrary entries). */
export async function fetchGame(slug) {
  const { data, error } = await supabase
    .from('games').select(GAME_SELECT).eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? shapeGame(data) : null;
}

/** All tags (for the filter bar + admin autocomplete). */
export async function fetchTags() {
  const { data, error } = await supabase.from('tags').select('*').order('name');
  if (error) throw error;
  return data || [];
}

/** Record who downloaded what, then return so the caller can open the URL. */
export async function logDownload(downloadId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('user_downloads').insert({ user_id: user.id, download_id: downloadId });
  if (error) console.warn('download log failed:', error.message);
}

/** My rating for a game, plus the average/count. */
export async function fetchMyRating(gameId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('ratings').select('score').eq('game_id', gameId).eq('user_id', user.id).maybeSingle();
  return data?.score ?? 0;
}

export async function saveRating(gameId, score) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ratings')
    .upsert({ user_id: user.id, game_id: gameId, score }, { onConflict: 'user_id,game_id' });
  if (error) throw error;
}

/** Distinct list of { game, versions, downloads } used by the admin panel. */
export async function fetchAdminLibrary() {
  return fetchLibrary(); // same shape; RLS allows admin write via separate policies
}
