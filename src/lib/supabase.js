import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // session survives reloads (localStorage)
    autoRefreshToken: true,
    detectSessionInUrl: false,   // we handle our own ?next= redirect
  },
});
