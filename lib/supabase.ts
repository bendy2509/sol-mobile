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

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    storage: !isServer ? AsyncStorage : undefined,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
