// Wires the shared navbar: shows the user's email, the Admin link for admins,
// and handles logout. Safe on every page (login page included — it just idles).
import { supabase } from '../lib/supabase.js';
import { getProfile, BASE } from '../lib/auth.js';

async function initNav() {
  const { data: { session } } = await supabase.auth.getSession();
  const userEl = document.getElementById('nav-user');
  const adminEl = document.getElementById('nav-admin');
  const logoutBtn = document.getElementById('nav-logout');
  if (!session) {
    logoutBtn?.classList.add('hidden');
    adminEl?.classList.add('hidden');
    return;
  }

  if (userEl) {
    userEl.textContent = session.user.email || '';
    userEl.classList.remove('hidden');
  }
  logoutBtn?.classList.remove('hidden');
  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace(`${BASE}login/`);
  });

  const profile = await getProfile(session.user.id);
  if (profile?.is_admin) adminEl?.classList.remove('hidden');
}

initNav();
