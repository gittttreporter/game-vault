// Public runtime configuration (safe to ship to the browser — data access is
// protected by Supabase Row Level Security, not by hiding these keys).

export const SUPABASE_URL =
  import.meta.env.PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY =
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

// Giscus (GitHub Discussions comments) — leave empty to hide comments.
export const GISCUS = {
  repo: import.meta.env.PUBLIC_GISCUS_REPO || '',
  repoId: import.meta.env.PUBLIC_GISCUS_REPO_ID || '',
  categoryId: import.meta.env.PUBLIC_GISCUS_CATEGORY_ID || '',
  mapping: 'specific', // we pass term = game id explicitly
};

export const SITE = {
  name: 'THE VAULT',
  tagline: 'private game distribution · authorized personnel only',
};

export const configMissing = !SUPABASE_URL || !SUPABASE_ANON_KEY;
