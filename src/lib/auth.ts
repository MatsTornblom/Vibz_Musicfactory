import { supabase } from './supabase';

// The admin_permissions section that gates this whole app (see has_admin_section() in the DB).
export const SECTION_KEY = 'music-factory';

export type AccessState = 'loading' | 'logged-out' | 'no-access' | 'allowed';

/** Where the standard Vibz login lives; returns here afterwards. */
export function loginUrl(): string {
  const url = new URL('https://enter.vibz.world/');
  url.searchParams.set('returnUrl', window.location.href);
  return url.toString();
}

/**
 * Decide what the user may see. Never creates sessions or users.
 * admin_my_sections() only returns sections for super admins, so a normal user and a
 * super admin without this section both end up as 'no-access' (fail closed on any error).
 */
export async function resolveAccess(): Promise<AccessState> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return 'logged-out';

    const { data, error } = await supabase.rpc('admin_my_sections');
    if (error) {
      console.error('Failed to load admin sections:', error);
      return 'no-access';
    }
    return ((data as string[]) ?? []).includes(SECTION_KEY) ? 'allowed' : 'no-access';
  } catch (error) {
    console.error('Access check failed:', error);
    return 'no-access';
  }
}
