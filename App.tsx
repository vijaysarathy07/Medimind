import './services/backgroundTask';

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import RootNavigator from './navigation/RootNavigator';
import OnboardingScreen from './screens/OnboardingScreen';
import AuthScreen from './screens/AuthScreen';
import { ToastProvider } from './contexts/ToastContext';
import { supabase } from './services/supabase';
import { Colors } from './constants/theme';
import { registerAlertTask } from './services/backgroundTask';
import { registerAndSaveFCMToken, listenForTokenRefresh } from './services/fcmService';

const ONBOARDING_KEY = '@medimind/onboarding_done';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary:    Colors.primary,
    background: Colors.background,
    surface:    Colors.surface,
  },
};

// null  = still loading
// false = loaded, not done
// true  = loaded, done
type BoolState = boolean | null;

export default function App() {
  const [onboardingDone, setOnboardingDone] = useState<BoolState>(null);
  const [session,        setSession]        = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // 1. Check onboarding flag
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(val => setOnboardingDone(val === 'true'))
      .catch(()  => setOnboardingDone(false));

    // 2. Check existing Supabase session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) registerAndSaveFCMToken();
    });

    // 3. Listen for auth changes (sign in / sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) registerAndSaveFCMToken();
    });

    // 4. Keep FCM token fresh if it rotates
    const unsubscribeTokenRefresh = listenForTokenRefresh();

    registerAlertTask();

    return () => {
      subscription.unsubscribe();
      unsubscribeTokenRefresh();
    };
  }, []);

  async function handleOnboardingComplete() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setOnboardingDone(true);
  }

  // ── Still loading both checks ──
  if (onboardingDone === null || session === undefined) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" backgroundColor={Colors.primary} />
      </View>
    );
  }

  // ── First launch — show onboarding ──
  if (!onboardingDone) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </SafeAreaProvider>
    );
  }

  // ── Not signed in — show auth screen ──
  if (!session) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={Colors.background} />
        <AuthScreen onAuth={() => {/* session listener updates automatically */}} />
      </SafeAreaProvider>
    );
  }

  // ── Signed in — show main app ──
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <PaperProvider theme={theme}>
          <NavigationContainer>
            <StatusBar style="dark" backgroundColor={Colors.white} />
            <RootNavigator />
          </NavigationContainer>
        </PaperProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
});
