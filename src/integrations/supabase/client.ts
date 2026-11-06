import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const envUrl = import.meta.env?.VITE_SUPABASE_URL;
const envKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY;

const hasExternalSupabase = Boolean(
  envUrl &&
  envKey &&
  !envUrl.includes('placeholder-project') &&
  !envKey.includes('placeholder-anon-key')
);

const getDefaultLocalSupabaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/__supabase`;
  }
  return 'http://localhost:3000/__supabase';
};

export const isSupabaseConfigured = true;

const SUPABASE_URL = hasExternalSupabase ? envUrl : getDefaultLocalSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = hasExternalSupabase ? envKey : "astrachat-local-anon-key";

// Use standard localStorage unless specifically inside a verified Lovable preview environment
const getAuthStorage = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    const host = window.location.hostname;
    const isLovable = host.includes('lovable') || host.includes('gpt-eng');
    if (isLovable) {
      return brokeredPreviewStorage() || localStorage;
    }
  } catch {
    // fallback to localStorage
  }
  return localStorage;
};

// Singleton Supabase client instance
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: getAuthStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});