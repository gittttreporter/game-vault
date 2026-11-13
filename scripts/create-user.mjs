#!/usr/bin/env node
// ============================================================================
// create-user.mjs — admin-only account creation (no public sign-up!)
//
// Usage:
//   1. Get your SERVICE ROLE key: Supabase Dashboard → Settings → API →
//      "service_role" (secret! never commit it, never put it in .env PUBLIC_*)
//   2. Run:
//        SUPABASE_URL=https://YOURPROJECT.supabase.co \
//        SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//        node scripts/create-user.mjs friend1@example.com "S3cretPass!" "Alice"
//
//      The 3rd argument (display name) is optional.
//
// Alternative: Supabase Dashboard → Authentication → Add user (also fine,
// just remember to tick "Auto Confirm User").
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const [url, key, email, password, displayName] = process.argv.slice(2);

if (!url || !key || !email || !password) {
  console.error(`
Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
  node scripts/create-user.mjs <email> <password> [display-name]

The service role key is found under Supabase → Settings → API.
`);
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skip the confirmation mail
  user_metadata: { display_name: displayName || email.split('@')[0] },
});

if (error) {
  console.error('✖ Failed:', error.message);
  process.exit(1);
}

// touch the profile row in case the DB trigger hasn't run yet
await supabase.from('profiles').upsert({
  id: data.user.id,
  display_name: displayName || email.split('@')[0],
});

console.log(`✔ Created user ${email} (id: ${data.user.id})`);
console.log('  They can now log in at your site with those credentials.');
