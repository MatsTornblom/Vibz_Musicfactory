import { createClient } from '@supabase/supabase-js';
import Cookies from 'js-cookie';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration');
}

// Same shared-cookie session as every other Vibz app (see Vibz_Admin_App/src/lib/supabase.ts).
// This app only READS the session written by enter.vibz.world; it never logs anyone in.
// It must run on a *.vibz.world host, otherwise the cookie is not visible.
const cookieDomain = () => '.' + window.location.hostname.split('.').slice(-2).join('.');

// Slim the session before writing: browsers silently DROP cookies over ~4KB, and a dropped
// write on token refresh leaves the old, already-rotated refresh token in the cookie, which
// makes Supabase revoke the whole session. Must match the other Vibz apps.
function slimSession(value: string): string {
  try {
    const session = JSON.parse(value);
    if (session && typeof session === 'object' && session.access_token && session.user) {
      return JSON.stringify({
        ...session,
        user: {
          id: session.user.id,
          aud: session.user.aud,
          role: session.user.role,
          email: session.user.email,
        },
      });
    }
  } catch {
    // Not JSON — write as-is
  }
  return value;
}

// Auth lives only in the shared .vibz.world cookie (no localStorage copy).
const storage = {
  getItem: (key: string) => Cookies.get(key) ?? null,
  setItem: (key: string, value: string) => {
    value = slimSession(value);
    Cookies.set(key, value, {
      domain: cookieDomain(),
      sameSite: 'lax',
      path: '/',
      secure: true,
      expires: 365,
    });
    // Read back to detect a silently dropped write (cookie too large or blocked).
    if (Cookies.get(key) !== value) {
      console.error(`[Auth] cookie write DROPPED for ${key} (value ${value.length} chars) — session will likely be lost on next refresh`);
    }
  },
  removeItem: (key: string) => {
    // Must match the domain it was written with, or the shared cookie survives.
    Cookies.remove(key, {
      domain: cookieDomain(),
      sameSite: 'lax',
      path: '/',
      secure: true,
    });
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage,
    flowType: 'pkce',
  },
});
