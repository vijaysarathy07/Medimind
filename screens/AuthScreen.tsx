import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../services/supabase';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [mode,     setMode]     = useState<Mode>('signin');
  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (mode === 'signup' && !phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data: { user: newUser }, error } = await supabase.auth.signUp({
          email:    email.trim(),
          password,
          options:  { data: { name: name.trim(), phone: phone.trim() } },
        });
        if (error) throw error;

        if (newUser) {
          await supabase.from('users').upsert({
            id:    newUser.id,
            name:  name.trim(),
            phone: phone.trim(),
          }, { onConflict: 'id' });
        }

        Alert.alert(
          'Account created!',
          'You can now sign in.',
          [{ text: 'OK', onPress: () => setMode('signin') }]
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email:    email.trim(),
          password,
        });
        if (error) throw error;
        onAuth();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      const display = msg.toLowerCase().includes('email not confirmed')
        ? 'Please check your inbox and confirm your email before signing in.'
        : msg;
      Alert.alert('Error', display);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoBox}>
            <Text style={styles.logoEmoji}>💊</Text>
            <Text style={styles.logoText}>MediMind</Text>
            <Text style={styles.logoSub}>Your personal medicine companion</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>

            {mode === 'signup' && (
              <>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Vijay Sarathy"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <Text style={styles.label}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 9876543210"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Min. 6 characters"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.submitBtnText}>
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </Text>
              }
            </TouchableOpacity>

            {/* Toggle mode */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={styles.toggleText}>
                {mode === 'signin'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
                <Text style={styles.toggleLink}>
                  {mode === 'signin' ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.md,
  },
  logoBox: { alignItems: 'center', marginBottom: Spacing.xl },
  logoEmoji: { fontSize: 56, marginBottom: Spacing.sm },
  logoText: {
    fontSize: 32,
    fontWeight: Typography.fontWeightBold,
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  logoSub: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 50,
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
  },
  toggleRow: { alignItems: 'center', marginTop: Spacing.lg },
  toggleText: { fontSize: Typography.fontSizeSM, color: Colors.textSecondary },
  toggleLink: { color: Colors.primary, fontWeight: Typography.fontWeightSemibold },
});
