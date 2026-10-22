import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const isServer = typeof window === 'undefined';

// Supabase project URL derived from project abeilkegrspsavfavxkh
const defaultUrl = 'https://abeilkegrspsavfavxkh.supabase.co';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || defaultUrl;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseAnonKey && !supabaseAnonKey.includes('dummy') && supabaseAnonKey.length > 20
);

/**
 * Cloud sync is OFF: the app is autonomous (local ledger + encrypted backup).
 * It used the public key with no identity, so the server could not tell one manager from
 * anyone else (see docs/SUPABASE_SECURITE.md). Turn it back on only behind a server that
 * authenticates each manager (option C) — every Supabase call below checks this flag.
 */
export const CLOUD_SYNC_ENABLED = false;

/** True only when sync is switched on AND a real key is configured. */
export const isCloudSyncActive = CLOUD_SYNC_ENABLED && isSupabaseConfigured;

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    storage: !isServer ? AsyncStorage : undefined,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
