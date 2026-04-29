import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

console.log('SUPABASE_URL:', SUPABASE_URL); // add this line

if (__DEV__ && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  console.warn(
    '[MediMind] Supabase credentials are missing.\n' +
    'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file,\n' +
    'then restart Metro (press r in the terminal).'
  );
}

// AsyncStorage-backed session keeps auth alive across app restarts
// and inside background tasks where there is no active React context.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',   // prevent empty-string crash
  SUPABASE_ANON_KEY || 'placeholder-key',
  {
    auth: {
      storage:            AsyncStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
    },
  }
);
