// ============================================================================
// Supabase Edge Function: notify-new-game
// Posts a "NEW GAME" announcement to a Discord webhook.
//
// Deploy:
//   supabase functions deploy notify-new-game
//   supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
//
// Invoke (the Admin panel does this with one click):
//   supabase.functions.invoke('notify-new-game', { body: { game } })
//   where game = { title, slug, description, version, tags }
// ============================================================================
// deno-lints-ignore no-import-assertions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DISCORD_COLOR = 0x00e5ff; // neon cyan

function buildEmbed(game: { title: string; slug?: string; description?: string; version?: string; tags?: string[] }) {
  const fields = [] as { name: string; value: string; inline?: boolean }[];
  if (game.version) fields.push({ name: 'Version', value: game.version, inline: true });
  if (game.tags?.length) fields.push({ name: 'Tags', value: game.tags.join(', '), inline: true });
  return {
    title: `🎮 NEW GAME: ${game.title}`,
    description: (game.description || '').slice(0, 350),
    color: DISCORD_COLOR,
    fields,
    footer: { text: '🕹 THE VAULT — a new cartridge has been inserted' },
    timestamp: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { game } = await req.json();
    if (!game?.title) {
      return new Response(JSON.stringify({ error: 'missing game.title' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // only authenticated admins may trigger the announcement
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: adminCheck } = await supabase.rpc('is_admin');
    if (!adminCheck) {
      return new Response(JSON.stringify({ error: 'admin only' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const hook = Deno.env.get('DISCORD_WEBHOOK_URL');
    if (!hook) {
      return new Response(JSON.stringify({ error: 'DISCORD_WEBHOOK_URL secret not set' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'The Vault', embeds: [buildEmbed(game)] }),
    });

    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status }),
      { status: res.ok ? 200 : 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
