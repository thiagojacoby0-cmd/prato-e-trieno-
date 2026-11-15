import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;
const tokenStorage = new AsyncLocalStorage<string>();

export function runWithSupabaseToken<T>(token: string, fn: () => T): T {
  return tokenStorage.run(token, fn);
}

function isValidHttpUrl(val?: string): boolean {
  return Boolean(val && /^https?:\/\//i.test(val.trim()));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    isValidHttpUrl(process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(isValidHttpUrl(process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getSupabaseAnon(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}

export function getSupabaseClientForToken(explicitToken?: string): SupabaseClient | null {
  const admin = getSupabaseAdmin();
  if (admin) return admin;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  const token = explicitToken ?? tokenStorage.getStore();
  if (!token) return getSupabaseAnon();
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
