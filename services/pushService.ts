import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

export async function registerAndSavePushToken(): Promise<void> {
  if (Platform.OS === 'web') return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    if (newStatus !== 'granted') return;
  }

  let token: string;
  try {
    const pushToken = await Notifications.getDevicePushTokenAsync();
    token = pushToken.data as string;
    console.log('[Push] Expo push token:', token.slice(0, 30) + '...');
  } catch (err) {
    console.warn('[Push] Could not get Expo push token:', err);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.warn('[Push] No user found'); return; }

  const { error } = await supabase
    .from('users')
    .update({ expo_push_token: token })
    .eq('id', user.id);

  if (error) {
    console.warn('[Push] Failed to save token to users:', error.message);
    return;
  }

  const { data: profile } = await supabase
    .from('users')
    .select('phone')
    .eq('id', user.id)
    .single();

  if (profile?.phone) {
    const last10 = profile.phone.replace(/\D/g, '').slice(-10);
    await supabase
      .from('caregivers')
      .update({ expo_push_token: token })
      .like('phone', `%${last10}`);
  }
}

export function listenForTokenRefresh(): () => void {
  const sub = Notifications.addPushTokenListener(async ({ data: token }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !token) return;

    await supabase.from('users').update({ expo_push_token: token }).eq('id', user.id);

    const { data: profile } = await supabase
      .from('users')
      .select('phone')
      .eq('id', user.id)
      .single();

    if (profile?.phone) {
      await supabase
        .from('caregivers')
        .update({ expo_push_token: token })
        .eq('phone', profile.phone);
    }
  });

  return () => sub.remove();
}
