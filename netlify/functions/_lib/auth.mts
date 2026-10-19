import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SECTION_KEY = 'music-factory';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Server-side Supabase client with the secret key (bypasses RLS). Never expose to the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Server is missing SUPABASE_URL / SUPABASE_SECRET_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Same rule as has_admin_section('music-factory') in the database: a super admin who holds the
 * section. Because the secret key bypasses RLS, every function MUST call this before doing work.
 * Returns the user id, or a ready-made error Response.
 */
export async function requireFactoryUser(
  req: Request,
  admin: SupabaseClient
): Promise<{ userId: string } | { error: Response }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: json({ error: 'Not logged in' }, 401) };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: json({ error: 'Not logged in' }, 401) };
  const userId = data.user.id;

  const [{ data: profile }, { data: grant }] = await Promise.all([
    admin.from('users').select('is_super_admin').eq('id', userId).maybeSingle(),
    admin.from('admin_permissions').select('section').eq('user_id', userId).eq('section', SECTION_KEY).maybeSingle(),
  ]);
  if (!profile?.is_super_admin || !grant) return { error: json({ error: 'No access' }, 403) };

  return { userId };
}
