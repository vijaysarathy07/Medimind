import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

// ─── types ───────────────────────────────────────────────────

export type NewCaregiver = {
  name:         string;
  phone:        string;
  relationship: string;
};

type Props = {
  visible:  boolean;
  onClose:  () => void;
  onSave:   (data: NewCaregiver) => Promise<void>;
};

// ─── constants ───────────────────────────────────────────────

const RELATIONSHIPS = ['Family', 'Spouse', 'Doctor', 'Nurse', 'Friend'];

// ─── component ───────────────────────────────────────────────

export default function AddCaregiverModal({ visible, onClose, onSave }: Props) {
  const [name,         setName]         = useState('');
  const [phone,        setPhone]        = useState('');
  const [relationship, setRelationship] = useState('Family');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  function reset() {
    setName('');
    setPhone('');
    setRelationship('Family');
    setError('');
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSave() {
    setError('');
    if (!name.trim()) {
      setError('Please enter the caregiver\'s name.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter a WhatsApp phone number.');
      return;
    }
    if (!phone.trim().startsWith('+')) {
      setError('Phone must start with a country code, e.g. +91 or +1.');
      return;
    }

    setSaving(true);
    try {
      await onSave({ name: name.trim(), phone: phone.trim(), relationship });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save caregiver.');
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Caregiver</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Name */}
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Priya Sarathy"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
            returnKeyType="next"
          />

          {/* Phone */}
          <Text style={styles.label}>WhatsApp Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            returnKeyType="done"
          />
          <Text style={styles.hint}>
            📱 Include country code. Caregiver must have WhatsApp.
          </Text>

          {/* Relationship */}
          <Text style={styles.label}>Relationship</Text>
          <View style={styles.chipRow}>
            {RELATIONSHIPS.map((rel) => (
              <TouchableOpacity
                key={rel}
                style={[
                  styles.chip,
                  relationship === rel && styles.chipActive,
                ]}
                onPress={() => setRelationship(rel)}
              >
                <Text
                  style={[
                    styles.chipText,
                    relationship === rel && styles.chipTextActive,
                  ]}
                >
                  {rel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Add Caregiver</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor:      Colors.white,
    borderTopLeftRadius:  Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding:              Spacing.md,
    paddingBottom:        Spacing.xl + 8,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.border,
    alignSelf:       'center',
    marginBottom:    Spacing.md,
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   Spacing.lg,
  },
  title: {
    fontSize:   Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color:      Colors.textPrimary,
  },
  closeBtn: {
    fontSize: 18,
    color:    Colors.textMuted,
  },
  label: {
    fontSize:     Typography.fontSizeSM,
    fontWeight:   Typography.fontWeightSemibold,
    color:        Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  Spacing.xs,
    marginTop:     Spacing.sm,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius:    Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm + 2,
    fontSize:         Typography.fontSizeMD,
    color:            Colors.textPrimary,
    borderWidth:      1.5,
    borderColor:      Colors.border,
  },
  hint: {
    fontSize:  Typography.fontSizeXS,
    color:     Colors.textMuted,
    marginTop: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs,
    borderRadius:      Radius.full,
    backgroundColor:   Colors.background,
    borderWidth:       1.5,
    borderColor:       Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  chipText: {
    fontSize:   Typography.fontSizeSM,
    color:      Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
  },
  chipTextActive: {
    color:      Colors.white,
    fontWeight: Typography.fontWeightSemibold,
  },
  errorBox: {
    backgroundColor: '#FFF5F5',
    borderRadius:    Radius.sm,
    padding:         Spacing.sm,
    marginTop:       Spacing.sm,
    borderWidth:     1,
    borderColor:     '#FFCDD2',
  },
  errorText: {
    fontSize: Typography.fontSizeSM,
    color:    Colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap:           Spacing.sm,
    marginTop:     Spacing.lg,
  },
  cancelBtn: {
    flex:            1,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems:      'center',
  },
  cancelBtnText: {
    fontSize:   Typography.fontSizeMD,
    color:      Colors.textSecondary,
    fontWeight: Typography.fontWeightMedium,
  },
  saveBtn: {
    flex:            2,
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems:      'center',
    shadowColor:     Colors.primary,
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.25,
    shadowRadius:    6,
    elevation:       3,
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.white,
  },
});
