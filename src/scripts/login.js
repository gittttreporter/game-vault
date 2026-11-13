import { supabase } from '../lib/supabase.js';

const BASE = document.querySelector('meta[name="base-url"]')?.content || '/';

// If already logged in, skip the form.
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  const params = new URLSearchParams(location.search);
  let next = params.get('next') || BASE;
  try {
    const u = new URL(next, location.origin);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) next = BASE;
  } catch { next = BASE; }
  location.replace(next);
}

const form = document.getElementById('login-form');
const errEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = '⟳ Verifying…';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent =
      error.message === 'Invalid login credentials'
        ? 'ACCESS DENIED — invalid credentials.'
        : `ACCESS DENIED — ${error.message}`;
    errEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '⏎ Authenticate';
    return;
  }

  const params = new URLSearchParams(location.search);
  let next = params.get('next') || BASE;
  try {
    const u = new URL(next, location.origin);
    if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) next = BASE;
  } catch { next = BASE; }
  location.replace(next);
});
