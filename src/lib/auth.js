// Auth guard + session helpers, shared by every protected page.
import { supabase } from './supabase.js';

const BASE = document.querySelector('meta[name="base-url"]')?.content || '/';

function safeNext(raw) {
  // only allow same-origin paths starting with our base — no open redirects
  try {
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin) return null;
    if (!u.pathname.startsWith(BASE)) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/** Redirect to /login/ unless a valid session exists. Returns the session. */
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const next = safeNext(location.pathname + location.search + location.hash);
  const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
  location.replace(`${BASE}login/${suffix}`);
  await new Promise(() => {}); // stop script execution while redirecting
}

/** Fetch the current user's profile row (display name + admin flag). */
export async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

/** Log out everywhere and return to the login page. */
export async function logout() {
  await supabase.auth.signOut();
  location.replace(`${BASE}login/`);
}

export { BASE };
