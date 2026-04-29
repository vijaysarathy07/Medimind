import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

/**
 * Gets the raw FCM device token, saves it to the signed-in user's profile,
 * and also updates any caregiver records whose phone matches this user's phone.
 * Call this once after sign-in and whenever the token refreshes.
 */
export async function registerAndSaveFCMToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  const { status } = await Notifications.getPermissionsAsync();
  console.log('[FCM] Permission status:', status);
  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    console.log('[FCM] Requested permission, new status:', newStatus);
    if (newStatus !== 'granted') return;
  }

  let token: string;
  try {
    const pushToken = await Notifications.getDevicePushTokenAsync();
    token = pushToken.data as string;
    console.log('[FCM] Got token:', token ? token.slice(0, 20) + '...' : 'EMPTY');
  } catch (err) {
    console.warn('[FCM] Could not get device push token:', err);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.warn('[FCM] No user found'); return; }

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: token })
    .eq('id', user.id);

  if (error) {
    console.warn('[FCM] Failed to save token to users:', error.message);
    return;
  }
  console.log('[FCM] Token saved to users table');

  const { data: profile } = await supabase
    .from('users')
    .select('phone')
    .eq('id', user.id)
    .single();

  console.log('[FCM] User phone:', profile?.phone ?? 'NULL');

  if (profile?.phone) {
    const digits = profile.phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);

    const { error: careErr } = await supabase
      .from('caregivers')
      .update({ fcm_token: token })
      .like('phone', `%${last10}`);
    console.log('[FCM] Caregiver update error:', careErr?.message ?? 'none');
    console.log('[FCM] Matching caregivers with last10:', last10);
  }
}

/**
 * Listens for FCM token refreshes and re-saves the updated token.
 * Returns an unsubscribe function — call it on sign-out or unmount.
 */
export function listenForTokenRefresh(): () => void {
  const sub = Notifications.addPushTokenListener(async ({ data: token }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !token) return;

    await supabase.from('users').update({ fcm_token: token }).eq('id', user.id);

    const { data: profile } = await supabase
      .from('users')
      .select('phone')
      .eq('id', user.id)
      .single();

    if (profile?.phone) {
      await supabase
        .from('caregivers')
        .update({ fcm_token: token })
        .eq('phone', profile.phone);
    }
  });

  return () => sub.remove();
}
